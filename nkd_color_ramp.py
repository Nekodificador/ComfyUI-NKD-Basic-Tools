"""Shared color-ramp helpers: sampling + preset storage.

Consumed by 😺NKD Gradient Map and 😺NKD Gradient Generate — both use the same
ColorRampWidget.vue editor and the same wire format, so a ramp built for one
works in the other.
"""
from __future__ import annotations
import json
import math
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


def _parse_ramp(ramp_json: str) -> List[Tuple[float, float, float, float, float]]:
    """Returns sorted [(pos, r, g, b, mid), ...], falling back to the default
    black→white ramp on any malformed input. `mid` (0..1, default 0.5) is the
    color-transition midpoint of the segment to the NEXT stop."""
    try:
        data = json.loads(ramp_json) if ramp_json else {}
        raw_stops = data.get("stops", [])
        stops = []
        for s in raw_stops:
            pos = max(0.0, min(1.0, float(s["pos"])))
            r, g, b = _hex_to_rgb(str(s["color"]))
            mid = min(0.95, max(0.05, float(s.get("mid", 0.5))))
            stops.append((pos, r, g, b, mid))
        stops.sort(key=lambda s: s[0])
        if len(stops) >= 2:
            return stops
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    return [(0.0, 0.0, 0.0, 0.0, 0.5), (1.0, 1.0, 1.0, 1.0, 0.5)]


_INTERP_MODES = ("smooth", "bezier", "steps")


def _parse_interp(ramp_json: str) -> str:
    """The ramp's interpolation mode: 'smooth' (linear), 'bezier' (eased) or
    'steps' (hard, no transition). Defaults to 'smooth'."""
    try:
        mode = str(json.loads(ramp_json).get("interp", "smooth")) if ramp_json else "smooth"
    except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
        mode = "smooth"
    return mode if mode in _INTERP_MODES else "smooth"


def _sample_ramp(stops: List[Tuple[float, float, float, float]],
                 t: torch.Tensor, interp: str = "smooth") -> torch.Tensor:
    """Sample the ramp at positions `t` (any shape, values in [0, 1]).
    Returns a tensor of shape t.shape + (3,), interpolated in sRGB per `interp`:
    'smooth' = linear, 'bezier' = smoothstep ease, 'steps' = hard blocks."""
    positions = torch.tensor([s[0] for s in stops], device=t.device, dtype=t.dtype)
    colors = torch.tensor([[s[1], s[2], s[3]] for s in stops],
                          device=t.device, dtype=t.dtype)
    mids = torch.tensor([(s[4] if len(s) > 4 else 0.5) for s in stops],
                        device=t.device, dtype=t.dtype)
    tc = t.clamp(0.0, 1.0)

    if interp == "steps":
        # Each stop's color holds until the next one (Blender "Constant").
        idx = (torch.searchsorted(positions, tc, right=True) - 1).clamp(0, len(stops) - 1)
        return colors[idx]

    idx = torch.bucketize(tc, positions).clamp(1, len(stops) - 1)
    lo, hi = idx - 1, idx
    p_lo, p_hi = positions[lo], positions[hi]
    span = (p_hi - p_lo).clamp_min(1e-6)
    frac = ((tc - p_lo) / span).clamp(0.0, 1.0)
    # Per-segment midpoint: sample at fraction `mid` reaches the 50% color.
    m = mids[lo].clamp(0.05, 0.95)
    exp = torch.log(torch.tensor(0.5, device=t.device, dtype=t.dtype)) / torch.log(m)
    frac = frac.pow(exp)  # 0→0, 1→1; exp>0 so no NaN
    if interp == "bezier":
        frac = frac * frac * (3.0 - 2.0 * frac)  # smoothstep ease at each stop
    frac = frac.unsqueeze(-1)
    return colors[lo] + (colors[hi] - colors[lo]) * frac


# ---------------------------------------------------------------------------
# Gradient handles — two points in normalised [0,1] image space, dragged
# directly on the preview (used by 😺NKD Gradient Generate). Meaning depends
# on shape:
#   Linear:  p0 = gradient start, p1 = gradient end
#   Radial:  p0 = center,         p1 = point where the ramp reaches its end
#   Angular: p0 = center,         p1 = zero-angle reference direction
#   Diamond: p0 = center,         p1 = point where the ramp reaches its end
# ---------------------------------------------------------------------------

_DEFAULT_HANDLES = json.dumps({"p0": [0.0, 0.5], "p1": [1.0, 0.5], "mid": 0.5})


def _parse_handles(handles_json: str):
    """Returns (p0, p1, mid). p0/p1 are NOT clamped to [0,1] — a handle may
    sit outside the frame so the gradient terminates off-image (Photoshop
    style). `mid` in (0,1) is the color-transition midpoint (0.5 = neutral)."""
    try:
        data = json.loads(handles_json) if handles_json else {}
        p0, p1 = data["p0"], data["p1"]
        mid = float(data.get("mid", 0.5))
        return (float(p0[0]), float(p0[1])), (float(p1[0]), float(p1[1])), mid
    except (ValueError, KeyError, TypeError, IndexError, json.JSONDecodeError):
        return (0.0, 0.5), (1.0, 0.5), 0.5


def _warp_position(t: torch.Tensor, mid: float) -> torch.Tensor:
    """Photoshop-style gradient midpoint: bias where the ramp's 50% color
    lands. A pixel at geometric fraction `mid` ends up sampling the ramp's
    midpoint. `mid` = 0.5 is a no-op."""
    mid = min(max(float(mid), 0.05), 0.95)
    if abs(mid - 0.5) < 1e-4:
        return t
    exp = math.log(0.5) / math.log(mid)
    return t.clamp(0.0, 1.0).pow(exp)


def _position_field(shape: str, width: int, height: int, p0, p1, device) -> torch.Tensor:
    """Returns a [H, W] tensor in [0, 1] describing where each pixel falls
    along the gradient defined by handles p0->p1, per shape."""
    # Work in aspect-corrected units (x scaled by w/h) so distances and angles
    # are the same as on screen: a Radial stays a circle on a non-square canvas
    # instead of an ellipse. Diamond is unaffected (the scale cancels in dx/ex).
    aspect = width / height if height else 1.0
    ys = torch.linspace(0.0, 1.0, height, device=device).view(height, 1).expand(height, width)
    xs = torch.linspace(0.0, aspect, width, device=device).view(1, width).expand(height, width)
    dx, dy = xs - p0[0] * aspect, ys - p0[1]
    ex, ey = (p1[0] - p0[0]) * aspect, p1[1] - p0[1]

    if shape == "Radial":
        radius = max(math.hypot(ex, ey), 1e-4)
        return (torch.hypot(dx, dy) / radius).clamp(0.0, 1.0)

    if shape == "Angular":
        ref = math.atan2(ey, ex)
        theta = torch.atan2(dy, dx) - ref
        return (theta / (2 * math.pi)) % 1.0

    if shape == "Diamond":
        aex, aey = max(abs(ex), 1e-4), max(abs(ey), 1e-4)
        return (0.5 * (dx.abs() / aex + dy.abs() / aey)).clamp(0.0, 1.0)

    # Linear (default): project every pixel onto the p0->p1 axis; the
    # segment's own length sets the extent, exactly like dragging a line in
    # Photoshop's gradient tool.
    length = max(math.hypot(ex, ey), 1e-4)
    ux, uy = ex / length, ey / length
    proj = dx * ux + dy * uy
    return (proj / length).clamp(0.0, 1.0)


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
            mid = min(0.95, max(0.05, float(s.get("mid", 0.5))))
            stops.append({"pos": pos, "color": color, "mid": mid})
        except (KeyError, TypeError, ValueError):
            return None
    interp = str(payload.get("interp", "smooth"))
    if interp not in _INTERP_MODES:
        interp = "smooth"
    return {"name": name, "stops": stops, "interp": interp}


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
