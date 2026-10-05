"""NKD Curves — Photoshop-style tone curves (RGB master + per-channel).

The points are B-spline control points (as in NKD Sigmas Curve): the curve
runs through the end points and is pulled toward the inner ones without ever
leaving their polygon, so it never bellies out the way an interpolating spline
does. Flat beyond the first/last point. src/CurvesWidget.vue implements the
same spline for the live preview — keep the two in lock-step.
"""
from __future__ import annotations
import json
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .helpers import _resize_mask
from .nkd_frequency import _send_source_to_widget

CHANNELS = ("rgb", "r", "g", "b")
LUT_SIZE = 1024
SPLINE_DEGREE = 3
SPLINE_SAMPLES = 500
_DEFAULT_CURVES = json.dumps({c: [[0, 0], [1, 1]] for c in CHANNELS})


def parse_curves(s: str) -> dict[str, list[tuple]]:
    """Points are [x, y] or [x, y, 1] for a corner."""
    try:
        data = json.loads(s)
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    out = {}
    for c in CHANNELS:
        try:
            pts = sorted((min(max(float(p[0]), 0.0), 1.0), min(max(float(p[1]), 0.0), 1.0),
                          len(p) > 2 and bool(p[2]))
                         for p in data.get(c) or [])
        except (TypeError, ValueError):
            pts = []
        out[c] = pts if len(pts) >= 2 else [(0.0, 0.0, False), (1.0, 1.0, False)]
    return out


def _bspline_table(pts):
    """Sample the clamped uniform B-spline (degree min(3, n-1)) the points control."""
    # A corner repeats its point `degree` times: continuity drops to C0 there, so
    # the curve runs through it with a sharp kink (same as NKD Vector Mask).
    pts = [q for q in pts for _ in range(SPLINE_DEGREE if len(q) > 2 and q[2] else 1)]
    n = len(pts)
    p = min(SPLINE_DEGREE, n - 1)
    inner = n - p
    knots = [0.0] * (p + 1) + [i / inner for i in range(1, inner)] + [1.0] * (p + 1)
    xs, ys = [], []
    for s in range(SPLINE_SAMPLES + 1):
        u = min(s / SPLINE_SAMPLES, 1.0 - 1e-10)
        N = [1.0 if knots[i] <= u < knots[i + 1] else 0.0 for i in range(len(knots) - 1)]
        for d in range(1, p + 1):  # Cox-de Boor
            N = [((u - knots[i]) / (knots[i + d] - knots[i]) * N[i] if knots[i + d] > knots[i] else 0.0)
                 + ((knots[i + d + 1] - u) / (knots[i + d + 1] - knots[i + 1]) * N[i + 1]
                    if knots[i + d + 1] > knots[i + 1] else 0.0)
                 for i in range(len(N) - 1)]
        xs.append(sum(N[i] * pts[i][0] for i in range(n)))
        ys.append(sum(N[i] * pts[i][1] for i in range(n)))
    return xs, ys


def curve_lut(pts, n: int = LUT_SIZE) -> list[float]:
    # x(u) is monotone because the control xs are sorted, so a forward walk finds y(x).
    xs, ys = _bspline_table(pts)
    out, k = [], 0
    for j in range(n):
        x = j / (n - 1)
        if x <= xs[0]:
            out.append(ys[0])
            continue
        if x >= xs[-1]:
            out.append(ys[-1])
            continue
        while x > xs[k + 1]:
            k += 1
        dx = xs[k + 1] - xs[k]
        t = (x - xs[k]) / dx if dx > 0 else 0.0
        out.append(min(max(ys[k] + t * (ys[k + 1] - ys[k]), 0.0), 1.0))
    return out


def _apply_lut(x: torch.Tensor, lut: torch.Tensor) -> torch.Tensor:
    pos = x.clamp(0.0, 1.0) * (lut.shape[0] - 1)
    i0 = pos.floor().long().clamp(max=lut.shape[0] - 2)
    return torch.lerp(lut[i0], lut[i0 + 1], pos - i0)


def apply_curves(rgb: torch.Tensor, curves: dict) -> torch.Tensor:
    """Per-channel curve first, then the RGB master on top (Photoshop order)."""
    luts = {c: torch.tensor(curve_lut(curves[c]), device=rgb.device, dtype=rgb.dtype)
            for c in CHANNELS}
    return torch.stack([_apply_lut(_apply_lut(rgb[..., i], luts[c]), luts["rgb"])
                        for i, c in enumerate(("r", "g", "b"))], dim=-1)


class NKDCurves(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDCurves",
            display_name="😺NKD Curves",
            category="😺NKD Nodes/Basic",
            is_output_node=True,  # runnable on its own → loads the resolved source
                                  # into the live preview (works behind resize/subgraph)
            description=(
                "Brightness, contrast and color balance with tone curves, "
                "like Photoshop: an RGB master curve plus one per channel, "
                "previewed live as you drag."
            ),
            inputs=[
                io.Image.Input("image"),
                io.String.Input("curves", multiline=False, default=_DEFAULT_CURVES,
                                socketless=True,
                                tooltip="The curves, edited above."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — confine the grade to the mask, "
                                      "feathered by its values (soft edges blend in)."),
            ],
            hidden=[io.Hidden.unique_id],
            outputs=[io.Image.Output(display_name="image", tooltip="The graded image.")],
        )

    @classmethod
    def execute(cls, image, curves, mask=None) -> io.NodeOutput:
        rgb = image[..., :3]
        out = apply_curves(rgb, parse_curves(curves))
        if mask is not None:
            b, oh, ow = image.shape[0], image.shape[1], image.shape[2]
            mm = mask if mask.dim() == 3 else mask.unsqueeze(0)
            mfull = _resize_mask(mm.to(rgb.device), ow, oh).clamp(0.0, 1.0)
            fidx = torch.arange(b, device=rgb.device).clamp(max=mfull.shape[0] - 1)
            out = torch.lerp(rgb, out, mfull[fidx].unsqueeze(-1))
        if image.shape[-1] > 3:
            out = torch.cat([out, image[..., 3:]], dim=-1)
        _send_source_to_widget(getattr(getattr(cls, "hidden", None), "unique_id", None),
                               image, event="nkd-curves-source", mask=mask)
        return io.NodeOutput(out)


class NKDCurvesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDCurves]


NODE_CLASS_MAPPINGS = {"NKDCurves": NKDCurves}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDCurves": "😺NKD Curves"}
