"""😺NKD LoRA Control — per-block LoRA analysis and shaping.

Blocks are read from the LoRA file itself, so any architecture works with no
preset table. Each block can be muted or rescaled, and the whole LoRA can be
driven over sampling time by a curve (any FLOAT list, e.g. 😺NKD Sigmas Curve).

Block shape is baked into the weights; the curve rides on top as a hook, so the
two multiply: shape x time.
"""
from __future__ import annotations

import json
import logging
import os
import re

import comfy.hooks
import comfy.sd
import comfy.utils
import folder_paths
from comfy.utils import load_torch_file
from comfy_api.latest import io

from . import lora_control_core as core
from .helpers import _safe_join, _safe_name


def _resolve(lora_name: str) -> str:
    """Resolve a LoRA name to a real path. Only ever through folder_paths, so a
    name coming off the wire cannot address anything outside the loras folders."""
    path = folder_paths.get_full_path("loras", lora_name) if lora_name else None
    if not path or not os.path.isfile(path):
        raise FileNotFoundError(f"LoRA not found: {lora_name}")
    return path


_cache: dict[tuple[str, float], dict] = {}


def analyse_path(path: str) -> dict:
    """Analysis for a LoRA file, cached on (path, mtime)."""
    key = (path, os.path.getmtime(path))
    hit = _cache.get(key)
    if hit is None:
        _cache.clear()                                # one LoRA's worth is plenty
        hit = _cache[key] = core.analyze(load_torch_file(path, safe_load=True))
        hit["lora_name"] = os.path.basename(path)
    return hit


def _keyframes(curve: list[float], strength: float):
    """Turn a FLOAT list into hook keyframes, one per point.

    The list already has the sampler's resolution, so there is nothing to
    interpolate — unlike a keyframe string, which has to guess a point count.
    """
    last = len(curve) - 1
    group = comfy.hooks.HookKeyframeGroup()
    for i, value in enumerate(curve):
        group.add(comfy.hooks.HookKeyframe(
            strength=float(value) * strength,
            start_percent=i / last,
            guarantee_steps=1 if i == 0 else 0,
        ))
    return group


class NKDLoraControl(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDLoraControl",
            display_name="😺NKD LoRA Control",
            category="😺NKD Nodes/Utils",
            description=(
                "Loads a LoRA with per-block control. Blocks are read from the file, "
                "so any architecture works without a preset. Connect a float curve to "
                "shape the LoRA strength over sampling steps."
            ),
            inputs=[
                io.Model.Input("model"),
                io.Combo.Input(
                    "lora_name",
                    options=folder_paths.get_filename_list("loras"),
                    tooltip="LoRA file to load and analyse",
                ),
                io.Float.Input(
                    "strength", default=1.0, min=-10.0, max=10.0, step=0.05,
                    tooltip="Overall LoRA strength. Multiplies the curve when one is connected.",
                ),
                # Driven by the block panel. multiline=False on purpose: a
                # multiline STRING is a real DOM textarea that survives every
                # way of hiding a widget and renders as a slab under the node.
                io.String.Input("blocks", default="", multiline=False, socketless=True,
                                tooltip="Per-block rules, written by the panel"),
                io.Float.Input(
                    "curve", optional=True, force_input=True,
                    tooltip="Strength over sampling steps, as a float list "
                            "(e.g. the 'floats' output of 😺NKD Sigmas Curve).",
                ),
                # LAST on purpose. Hooks hang off the CONDITIONING, not the model
                # — set_hooks_for_conditioning is what makes a schedule happen —
                # so these only matter with a curve, and the widget shows/hides
                # them with it. Links are addressed by INDEX, so the pair has to
                # sit at the tail: then appearing and disappearing is a push and a
                # pop, and nothing before them can be renumbered.
                io.Conditioning.Input("positive", optional=True),
                io.Conditioning.Input("negative", optional=True),
            ],
            outputs=[
                io.Model.Output(),
                io.Conditioning.Output(display_name="positive"),
                io.Conditioning.Output(display_name="negative"),
            ],
        )

    @classmethod
    def execute(cls, model, lora_name: str, strength: float, blocks: str = "",
                positive=None, negative=None, curve=None) -> io.NodeOutput:
        path = _resolve(lora_name)
        state_dict = load_torch_file(path, safe_load=True)
        analysis = analyse_path(path)

        weights = core.parse_blocks(blocks, analysis["order"])
        muted = [b for b, w in weights.items() if w == 0.0]
        shaped = core.filter_state_dict(state_dict, weights)

        notes = []
        if isinstance(curve, (int, float)):   # a single float is not a curve
            curve = None
        if curve is not None and len(curve) < 2:
            notes.append("curve needs at least 2 points - ignored")
            curve = None
        if curve is not None and (positive is None or negative is None):
            raise ValueError(
                "A strength curve needs positive and negative conditioning wired through "
                "this node: the schedule is carried by hooks attached to the conditioning, "
                "not by the model."
            )
        if curve is not None:
            quantized, label = core.is_quantized(model)
            if quantized:
                # Hooks walk weights assuming plain nn.Linear and blow up on
                # quantized layers at sample time, so fall back to a flat apply.
                notes.append(f"curve skipped: {label} model, applied flat instead")
                curve = None

        if curve is None:
            out_model, _ = comfy.sd.load_lora_for_models(model, None, shaped, strength, 0.0)
            out_positive, out_negative = positive, negative
        else:
            # ponytail: model-only, like every selective loader out there. Wire a
            # CLIP input if an SDXL-era LoRA ever needs its text encoder shaped.
            hooks = comfy.hooks.create_hook_lora(lora=shaped, strength_model=1.0, strength_clip=0.0)
            hooks.set_keyframes_on_hooks(_keyframes(list(curve), strength))
            out_model = model.clone()
            out_model.register_all_hook_patches(
                hooks, comfy.hooks.create_target_dict(comfy.hooks.EnumWeightTarget.Model))
            out_positive = comfy.hooks.set_hooks_for_conditioning(positive, hooks)
            out_negative = comfy.hooks.set_hooks_for_conditioning(negative, hooks)
            notes.append(f"curve: {len(curve)} steps, {min(curve):.2f} to {max(curve):.2f}, "
                         f"x{strength} overall")

        on = len(analysis["order"]) - len(muted)
        note = "  ·  ".join([f"{on}/{len(analysis['order'])} blocks"] + notes)
        # The panel already shows every number, so there is no report output left
        # to wire — but a fallback must never be silent, so the notes go to the
        # log AND back to the widget's status line.
        for n in notes:
            logging.warning("[NKD LoRA Control] %s", n)
        return io.NodeOutput(out_model, out_positive, out_negative, ui={"nkd_note": [note]})


# ---------------------------------------------------------------------------
# User presets
#
# A preset is just the block rule text, which is portable by construction: rules
# name blocks, and a block a LoRA does not have is ignored, so a preset saved on
# a 38-single FLUX LoRA applies cleanly to a 24-single Klein one.
#
# Stored in ComfyUI's user directory, not next to the node, so it survives pack
# updates. Same shape and the same routes as 😺NKD Sigmas Curve.
# ---------------------------------------------------------------------------

_PRESET_NAME_RE = re.compile(r"^[\w \-().]{1,64}$")
_MAX_RULES = 16384


def _presets_path() -> str:
    try:
        user_dir = folder_paths.get_user_directory()
    except Exception:
        user_dir = os.path.dirname(os.path.realpath(__file__))
    os.makedirs(user_dir, exist_ok=True)
    return os.path.join(user_dir, "nkd_lora_control_presets.json")


def _read_presets() -> list[dict]:
    path = _presets_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [p for p in data if isinstance(p, dict) and "name" in p]
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _write_presets(presets: list[dict]) -> None:
    path = _presets_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(presets, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)          # atomic: a crash mid-write cannot truncate it


def _sanitise_preset(payload: dict) -> dict | None:
    name = str(payload.get("name", "")).strip()
    if not _PRESET_NAME_RE.match(name):
        return None
    rules = payload.get("rules")
    if not isinstance(rules, str) or len(rules) > _MAX_RULES:
        return None
    return {"name": name, "rules": rules}


def _register_preset_routes() -> None:
    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.get("/nkd/lora/presets")
    async def _list(_request):
        return web.json_response({"user": _read_presets()})

    @routes.post("/nkd/lora/presets")
    async def _save(request):
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)
        clean = _sanitise_preset(payload)
        if clean is None:
            return web.json_response({"error": "invalid preset"}, status=400)
        presets = _read_presets()
        idx = next((i for i, p in enumerate(presets)
                    if p.get("name", "").lower() == clean["name"].lower()), -1)
        if idx >= 0:
            presets[idx] = clean
        else:
            presets.append(clean)
        _write_presets(presets)
        return web.json_response({"ok": True, "preset": clean})

    @routes.delete("/nkd/lora/presets/{name}")
    async def _delete(request):
        name = request.match_info.get("name", "").strip()
        if not name:
            return web.json_response({"error": "missing name"}, status=400)
        presets = _read_presets()
        kept = [p for p in presets if p.get("name", "").lower() != name.lower()]
        if len(kept) == len(presets):
            return web.json_response({"error": "not found"}, status=404)
        _write_presets(kept)
        return web.json_response({"ok": True})


# ---------------------------------------------------------------------------
# Writing a shaped LoRA out
#
# The panel's setup is applied to a copy of the tensors and written as a normal
# .safetensors, so any loader can use it at strength 1.0 and the node stops being
# needed. Muted blocks are not written at all, so the file comes out smaller.
#
# The user picks a NAME, never a path. The destination is fixed under the loras
# folder and every component goes through _safe_name/_safe_join: a directory
# widget that takes whatever you type is exactly what got this pack flagged by
# the registry once already.
# ---------------------------------------------------------------------------

_SAVE_SUBFOLDER = "NKD"


def _source_metadata(path: str) -> dict:
    """The original file's metadata, or {} for anything that isn't safetensors."""
    try:
        from safetensors import safe_open
        with safe_open(path, framework="pt", device="cpu") as f:
            return dict(f.metadata() or {})
    except Exception:
        return {}


def save_shaped(lora_name: str, rules: str, name: str, overwrite: bool = False) -> dict:
    """Write the shaped LoRA. Returns {"path": <relative>} or {"error": ...}."""
    src = _resolve(lora_name)

    roots = folder_paths.get_folder_paths("loras")
    if not roots:
        return {"error": "no loras folder configured"}
    out_dir = _safe_join(roots[0], _SAVE_SUBFOLDER)
    if out_dir is None:
        return {"error": "bad destination"}
    os.makedirs(out_dir, exist_ok=True)

    stem = _safe_name(name, "")
    if not stem:
        return {"error": "invalid name"}
    if stem.lower().endswith(".safetensors"):
        stem = stem[: -len(".safetensors")]
    dest = _safe_join(out_dir, stem + ".safetensors")
    if dest is None:
        return {"error": "invalid name"}
    if os.path.exists(dest) and not overwrite:
        return {"exists": True, "path": f"{_SAVE_SUBFOLDER}/{stem}.safetensors"}

    state_dict = load_torch_file(src, safe_load=True)
    analysis = analyse_path(src)
    weights = core.parse_blocks(rules, analysis["order"])
    shaped = core.filter_state_dict(state_dict, weights)
    if not shaped:
        return {"error": "every block is muted, nothing to save"}

    # safetensors metadata is str -> str. Carry the provenance so a file found in
    # six months still says where it came from and what was done to it.
    meta = {k: str(v) for k, v in _source_metadata(src).items()
            if k.startswith(("ss_", "modelspec."))}
    meta["nkd_source_lora"] = os.path.basename(src)
    meta["nkd_block_rules"] = rules or "(none)"

    comfy.utils.save_torch_file(shaped, dest, metadata=meta)
    kept = len(shaped)
    return {"path": f"{_SAVE_SUBFOLDER}/{stem}.safetensors",
            "tensors": kept, "of": len(state_dict)}


def _register_routes() -> None:
    """GET /nkd/lora/blocks?name=<lora> -> the analysis for the block panel.

    The panel needs block names and impact scores the moment you pick a LoRA,
    not after a run — that wait is half of what makes per-block work tedious.
    `name` is resolved through folder_paths and never touches the filesystem
    directly, so it cannot address anything outside the loras folders.
    """
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.post("/nkd/lora/save")
    async def _save_shaped(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)
        try:
            result = save_shaped(str(body.get("lora_name", "")), str(body.get("rules", "")),
                                 str(body.get("name", "")), bool(body.get("overwrite")))
        except FileNotFoundError:
            return web.json_response({"error": "LoRA not found"}, status=404)
        except Exception as exc:
            logging.exception("[NKD LoRA Control] save failed")
            return web.json_response({"error": str(exc)[:200]}, status=200)
        if result.get("exists"):
            return web.json_response(result, status=409)
        return web.json_response(result, status=200 if "path" in result else 400)

    @PromptServer.instance.routes.get("/nkd/lora/blocks")
    async def _blocks(request):
        name = request.query.get("name", "")
        try:
            analysis = analyse_path(_resolve(name))
        except FileNotFoundError:
            return web.json_response({"error": "not found"}, status=404)
        except Exception as exc:                  # a bad file must not 500 the editor
            return web.json_response({"error": str(exc)[:200]}, status=200)
        return web.json_response(analysis, headers={"Cache-Control": "no-store"})


try:
    _register_routes()
    _register_preset_routes()
except Exception as _exc:                          # no server (unit tests), or re-import
    logging.warning("[NKD Basic Tools] /nkd/lora/blocks NOT registered (%s)", _exc)
