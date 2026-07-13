"""Shared color-ramp helpers: sampling + preset storage.

Consumed by 😺NKD Gradient Map and 😺NKD Gradient Generate — both use the same
ColorRampWidget.vue editor and the same wire format, so a ramp built for one
works in the other.
"""
from __future__ import annotations
import json
import os
import re
from typing import List, Tuple

import torch

_DEFAULT_RAMP = json.dumps({
    "stops": [{"pos": 0.0, "color": "#000000"}, {"pos": 1.0, "color": "#ffffff"}],
})


def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return (0.0, 0.0, 0.0)
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def _parse_ramp(ramp_json: str) -> List[Tuple[float, float, float, float]]:
    """Returns sorted [(pos, r, g, b), ...], falling back to the default
    black→white ramp on any malformed input."""
    try:
        data = json.loads(ramp_json) if ramp_json else {}
        raw_stops = data.get("stops", [])
        stops = []
        for s in raw_stops:
            pos = max(0.0, min(1.0, float(s["pos"])))
            r, g, b = _hex_to_rgb(str(s["color"]))
            stops.append((pos, r, g, b))
        stops.sort(key=lambda s: s[0])
        if len(stops) >= 2:
            return stops
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    return [(0.0, 0.0, 0.0, 0.0), (1.0, 1.0, 1.0, 1.0)]


def _sample_ramp(stops: List[Tuple[float, float, float, float]],
                 t: torch.Tensor) -> torch.Tensor:
    """Sample the ramp at positions `t` (any shape, values in [0, 1]).
    Returns a tensor of shape t.shape + (3,), linearly interpolated in sRGB."""
    positions = torch.tensor([s[0] for s in stops], device=t.device, dtype=t.dtype)
    colors = torch.tensor([[s[1], s[2], s[3]] for s in stops],
                          device=t.device, dtype=t.dtype)
    tc = t.clamp(0.0, 1.0)
    idx = torch.bucketize(tc, positions).clamp(1, len(stops) - 1)
    lo, hi = idx - 1, idx
    p_lo, p_hi = positions[lo], positions[hi]
    span = (p_hi - p_lo).clamp_min(1e-6)
    frac = ((tc - p_lo) / span).clamp(0.0, 1.0).unsqueeze(-1)
    return colors[lo] + (colors[hi] - colors[lo]) * frac


# ---------------------------------------------------------------------------
# Preset storage — same pattern as NKD Sigmas Curve (ComfyUI user directory).
# ---------------------------------------------------------------------------

_PRESET_NAME_RE = re.compile(r"^[\w \-().]{1,64}$")


def _user_presets_path() -> str:
    try:
        import folder_paths  # type: ignore
        user_dir = folder_paths.get_user_directory()
    except Exception:
        user_dir = os.path.dirname(os.path.realpath(__file__))
    os.makedirs(user_dir, exist_ok=True)
    return os.path.join(user_dir, "nkd_color_ramp_presets.json")


def _read_user_presets() -> list:
    path = _user_presets_path()
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


def _write_user_presets(presets: list) -> None:
    path = _user_presets_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(presets, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def _sanitise_preset(payload: dict):
    name = str(payload.get("name", "")).strip()
    if not _PRESET_NAME_RE.match(name):
        return None
    raw_stops = payload.get("stops")
    if not isinstance(raw_stops, list) or len(raw_stops) < 2:
        return None
    stops = []
    for s in raw_stops:
        try:
            pos = max(0.0, min(1.0, float(s["pos"])))
            color = str(s["color"])
            if not re.match(r"^#[0-9a-fA-F]{6}$", color):
                return None
            stops.append({"pos": pos, "color": color})
        except (KeyError, TypeError, ValueError):
            return None
    return {"name": name, "stops": stops}


def _register_preset_routes() -> None:
    try:
        from server import PromptServer  # type: ignore
        from aiohttp import web  # type: ignore
    except ImportError:
        return

    routes = PromptServer.instance.routes

    @routes.get("/nkd_color_ramp/presets")
    async def list_presets(_request):
        return web.json_response({"user": _read_user_presets()})

    @routes.post("/nkd_color_ramp/presets")
    async def save_preset(request):
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)
        clean = _sanitise_preset(payload)
        if clean is None:
            return web.json_response({"error": "invalid preset"}, status=400)
        presets = _read_user_presets()
        idx = next(
            (i for i, p in enumerate(presets) if p.get("name", "").lower() == clean["name"].lower()),
            -1,
        )
        if idx >= 0:
            presets[idx] = clean
        else:
            presets.append(clean)
        _write_user_presets(presets)
        return web.json_response({"ok": True, "preset": clean})

    @routes.delete("/nkd_color_ramp/presets/{name}")
    async def delete_preset(request):
        name = request.match_info.get("name", "").strip()
        if not name:
            return web.json_response({"error": "missing name"}, status=400)
        presets = _read_user_presets()
        new_presets = [p for p in presets if p.get("name", "").lower() != name.lower()]
        if len(new_presets) == len(presets):
            return web.json_response({"error": "not found"}, status=404)
        _write_user_presets(new_presets)
        return web.json_response({"ok": True})


_register_preset_routes()
