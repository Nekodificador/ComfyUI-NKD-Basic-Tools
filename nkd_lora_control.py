"""😺NKD LoRA Control — per-block LoRA analysis and shaping.

Blocks are read from the LoRA file itself, so any architecture works with no
preset table. Each block can be muted or rescaled, and the whole LoRA can be
driven over sampling time by a curve (any FLOAT list, e.g. 😺NKD Sigmas Curve).

Block shape is baked into the LoRA tensors; the curve scales them per step, so
the two multiply: shape x time.
"""
from __future__ import annotations

import json
import logging
import os
import re

import comfy.lora
import comfy.patcher_extension
import comfy.sd
import comfy.utils
import folder_paths
import torch
from comfy import weight_adapter
from comfy.utils import load_torch_file
from comfy_api.latest import io

from . import lora_control_core as core
from .helpers import _safe_join, _safe_name, same_origin_only


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


def _to_device(value, device):
    if isinstance(value, torch.Tensor):
        return value.to(device)
    if isinstance(value, weight_adapter.WeightAdapterBase):
        return type(value)(value.loaded_keys, _to_device(value.weights, device))
    if isinstance(value, (tuple, list)):
        return type(value)(_to_device(v, device) for v in value)
    return value


class _CurveWeight:
    """Weight function that adds the LoRA delta on every forward, scaled by the
    curve value of the current step. Quantized layers dequantize before their
    weight functions run, so this works on int8/fp8/nvfp4 models too, where
    ComfyUI's weight hooks break."""

    def __init__(self, key, offset, function, adapter, state):
        self.key, self.offset, self.function = key, offset, function
        self.adapter, self.state = adapter, state

    def move_to(self, device=None):
        self.adapter = _to_device(self.adapter, device)
        return 0   # ponytail: LoRA tensors are small next to the model; report them if VRAM estimates drift

    def __call__(self, weight):
        s = self.state["strength"]
        if s == 0.0:
            return weight
        # calculate_weight adds in place, and unquantized layers hand us the live
        # parameter, so without the copy the delta piles up on every forward.
        return comfy.lora.calculate_weight([(s, self.adapter, 1.0, self.offset, self.function)],
                                           weight.clone(), self.key, intermediate_dtype=weight.dtype)


def _curve_on_the_fly(model, shaped, curve, strength):
    """Per-step LoRA strength: the delta is applied as a weight function, and an
    apply_model wrapper picks the curve value for the current sigma. Keyframes are
    placed by percent -> sigma, so chained samplers share one schedule."""
    out = model.clone()
    loaded = comfy.lora.load_lora(shaped, comfy.lora.model_lora_keys_unet(out.model, {}))
    sampling = out.get_model_object("model_sampling")
    last = len(curve) - 1
    frames = [(float(sampling.percent_to_sigma(i / last)), float(v) * strength) for i, v in enumerate(curve)]
    state = {"strength": frames[0][1]}

    def pick_strength(executor, x, t, *args, **kwargs):
        sigma = float(t.max())
        state["strength"] = next((s for sig, s in reversed(frames) if sig >= sigma), frames[0][1])
        return executor(x, t, *args, **kwargs)

    out.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.APPLY_MODEL, "nkd_lora_curve", pick_strength)
    for k, adapter in loaded.items():
        key, offset, function = (k, None, None) if isinstance(k, str) else (k[0], k[1], k[2] if len(k) > 2 else None)
        out.add_weight_wrapper(key, _CurveWeight(key, offset, function, adapter, state))
    return out


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
            ],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, model, lora_name: str, strength: float, blocks: str = "",
                curve=None) -> io.NodeOutput:
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
        if curve is None:
            out_model, _ = comfy.sd.load_lora_for_models(model, None, shaped, strength, 0.0)
        else:
            # ponytail: model-only, like every selective loader out there. Wire a
            # CLIP input if an SDXL-era LoRA ever needs its text encoder shaped.
            out_model = _curve_on_the_fly(model, shaped, list(curve), strength)
            notes.append(f"curve: {len(curve)} steps, {min(curve):.2f} to {max(curve):.2f}, "
                         f"x{strength} overall")

        on = len(analysis["order"]) - len(muted)
        note = "  ·  ".join([f"{on}/{len(analysis['order'])} blocks"] + notes)
        # The panel already shows every number, so there is no report output left
        # to wire — but a fallback must never be silent, so the notes go to the
        # log AND back to the widget's status line.
        for n in notes:
            logging.warning("[NKD LoRA Control] %s", n)
        return io.NodeOutput(out_model, ui={"nkd_note": [note]})


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

    # GET and POST share one handler so the preset list survives hot reloads.
    @routes.route("*", "/nkd/lora/presets")
    async def _presets(request):
        if request.method == "GET":
            return web.json_response({"user": _read_presets()})
        if request.method != "POST":
            raise web.HTTPMethodNotAllowed(request.method, ["GET", "POST"])
        return await _save(request)

    @same_origin_only
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
    @same_origin_only
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


def save_shaped(lora_name: str, rules: str, name: str, overwrite: bool = False,
                strength: float = 1.0) -> dict:
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
    if strength != 1.0:
        # Folded into the per-block multipliers, never applied as a second pass:
        # scaling the tensors twice would square it. A muted block stays muted.
        weights = {b: w * strength for b, w in weights.items()}
    shaped = core.filter_state_dict(state_dict, weights)
    if not shaped:
        return {"error": "nothing left to save at this strength"}

    # safetensors metadata is str -> str. Carry the provenance so a file found in
    # six months still says where it came from and what was done to it.
    meta = {k: str(v) for k, v in _source_metadata(src).items()
            if k.startswith(("ss_", "modelspec."))}
    meta["nkd_source_lora"] = os.path.basename(src)
    meta["nkd_block_rules"] = rules or "(none)"
    if strength != 1.0:
        meta["nkd_baked_strength"] = str(strength)

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
    @same_origin_only
    async def _save_shaped(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)
        try:
            result = save_shaped(str(body.get("lora_name", "")), str(body.get("rules", "")),
                                 str(body.get("name", "")), bool(body.get("overwrite")),
                                 float(body.get("strength", 1.0)))
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
