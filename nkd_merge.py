"""😺NKD Merge — a cut-out placed over a background, frame by frame.

Core has the pieces but none of them does this for video: Porter-Duff trims the
result to the shortest input (a still background under an 81-frame cut-out gives
one frame), Image Composite Masked ignores the source's own alpha and can't place
it past the top or left edge, and Create Layered Image turns a batch into stacked
layers rather than frames.

Placement lives in the hidden `transform` widget, edited by dragging in the node
(`src/merge.ts`): `{x, y, scale, angle}`, with x/y the foreground's CENTRE as a
fraction of the background, so a placement survives a change of resolution. `fit`
decides what scale 1 means. `place_matrix` is the one definition of that mapping;
`merge.ts` mirrors it, keep the two in lock-step.

The blending is core's own (`comfy_extras.compositor_blend`, the engine behind
Create Layered Image), so modes look the same in both places: colours are mixed
in linear light and converted back to sRGB at the end. That engine is numpy on
the CPU, about a second per 1080p frame, so plain "normal" (nearly every
composite) runs the same over math in torch on the GPU instead.
"""
from __future__ import annotations

import base64
import io as _io
import json
import math

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from comfy_extras.compositor_blend import (_LAYER_MODES, blend_composite, linear_to_srgb,
                                           resolve_mode, srgb_to_linear)

from . import mask_core
from .helpers import _linear_to_srgb, _srgb_to_linear, node_id

FITS = ("fit", "fill", "pixels")
DEFAULT_TRANSFORM = {"x": 0.5, "y": 0.5, "scale": 1.0, "angle": 0.0}
# Frames sent to the editor: enough to scrub a clip and check the framing holds,
# small enough to travel over the websocket on every run.
_PREVIEW_FRAMES = 12
_PREVIEW_SIDE = 384


def parse_transform(text: str) -> dict:
    """The widget's JSON, with defaults for anything missing or malformed."""
    try:
        data = json.loads(text) if text else {}
    except (ValueError, TypeError):
        data = {}
    out = dict(DEFAULT_TRANSFORM)
    if isinstance(data, dict):
        for k in out:
            v = data.get(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
                out[k] = float(v)
    return out


def base_scale(fit: str, bg_w: int, bg_h: int, fg_w: int, fg_h: int) -> float:
    """What scale 1 means: the foreground fitted inside, covering, or at its own pixels."""
    if fit == "fit":
        return min(bg_w / fg_w, bg_h / fg_h)
    if fit == "fill":
        return max(bg_w / fg_w, bg_h / fg_h)
    return 1.0


def place_matrix(t: dict, fit: str, bg_w: int, bg_h: int, fg_w: int, fg_h: int) -> np.ndarray:
    """3x3 matrix taking a background pixel to the foreground pixel that lands on it.
    Pixel coordinates are continuous, (0, 0) at the top-left corner of the first pixel;
    the angle turns clockwise on screen."""
    s = base_scale(fit, bg_w, bg_h, fg_w, fg_h) * t["scale"]
    a = math.radians(t["angle"])
    c, sn = math.cos(a), math.sin(a)
    to_centre = np.array([[1, 0, -t["x"] * bg_w], [0, 1, -t["y"] * bg_h], [0, 0, 1]])
    unrotate = np.array([[c, sn, 0], [-sn, c, 0], [0, 0, 1]])
    unscale = np.diag([1 / s, 1 / s, 1])
    to_corner = np.array([[1, 0, fg_w / 2], [0, 1, fg_h / 2], [0, 0, 1]])
    return to_corner @ unscale @ unrotate @ to_centre


def place(fg: torch.Tensor, m: np.ndarray, bg_w: int, bg_h: int) -> torch.Tensor:
    """Warp `fg` [h, w, 4] (straight alpha) onto a transparent bg-sized canvas.
    Resampled premultiplied, so edges don't pick up the colour of the transparent
    pixels around them."""
    fg_h, fg_w = fg.shape[:2]
    # The scale the matrix shrinks by: past 2x down, bilinear sampling skips pixels and
    # aliases, so pre-shrink with a proper filter and fold the factor into the matrix.
    shrink = 1.0 / math.hypot(m[0, 0], m[0, 1])
    a = fg[..., 3:4]
    pre = torch.cat([fg[..., :3] * a, a], dim=-1).movedim(-1, 0).unsqueeze(0)
    if shrink < 0.5:
        size = (max(1, round(fg_h * shrink)), max(1, round(fg_w * shrink)))
        pre = F.interpolate(pre, size=size, mode="bilinear", antialias=True)
        m = np.diag([size[1] / fg_w, size[0] / fg_h, 1]) @ m
        fg_h, fg_w = size
    # affine_grid speaks normalised coordinates (-1..1 across each image, align_corners
    # False), so wrap the pixel matrix between the two conversions.
    out_to_px = np.array([[bg_w / 2, 0, bg_w / 2], [0, bg_h / 2, bg_h / 2], [0, 0, 1]])
    px_to_in = np.array([[2 / fg_w, 0, -1], [0, 2 / fg_h, -1], [0, 0, 1]])
    theta = torch.tensor((px_to_in @ m @ out_to_px)[:2], dtype=pre.dtype, device=pre.device)
    grid = F.affine_grid(theta.unsqueeze(0), [1, 4, bg_h, bg_w], align_corners=False)
    # Sampled with the edge pixels repeated, then cut by the foreground's exact outline
    # with a one-pixel soft edge. Zero padding instead blends half a pixel of nothing into
    # every border, so a foreground fitted exactly to the frame came out 75% opaque along
    # its edges.
    out = F.grid_sample(pre, grid, mode="bilinear", padding_mode="border",
                        align_corners=False)[0].movedim(0, -1)
    px = (grid[0] + 1) / 2 * torch.tensor([fg_w, fg_h], dtype=grid.dtype, device=grid.device)
    inside = torch.minimum(px, torch.tensor([fg_w, fg_h], dtype=px.dtype, device=px.device) - px)
    step = math.hypot(m[0, 0], m[0, 1])          # foreground px per background px
    cov = (inside / step + 0.5).clamp(0.0, 1.0).prod(dim=-1, keepdim=True)
    out = (out * cov).clamp(0.0, 1.0)
    a = out[..., 3:4]
    rgb = torch.where(a > 1e-6, out[..., :3] / a.clamp_min(1e-6), torch.zeros_like(out[..., :3]))
    return torch.cat([rgb.clamp(0.0, 1.0), a], dim=-1)


def _over(bg: torch.Tensor, fg: torch.Tensor, opacity: float) -> torch.Tensor:
    """Core's "normal" (union) composite, in torch. sRGB straight alpha in and out."""
    ia, la = bg[..., 3:4], fg[..., 3:4] * opacity
    na = la + (1 - la) * ia
    i, l = _srgb_to_linear(bg[..., :3]), _srgb_to_linear(fg[..., :3])
    rgb = torch.where(na > 0, (la * l + (1 - la) * ia * i) / na.clamp_min(1e-12), i)
    return torch.cat([_linear_to_srgb(rgb.clamp(0.0, 1.0)), na.clamp(0.0, 1.0)], dim=-1)


def _linear(rgba: np.ndarray) -> np.ndarray:
    return np.concatenate([srgb_to_linear(rgba[..., :3]), rgba[..., 3:4]], axis=-1)


def blend(bg: torch.Tensor, fg: torch.Tensor, opacity: float, blend_mode: str) -> torch.Tensor:
    """Composite two same-size sRGB straight-alpha frames."""
    if blend_mode == "normal":
        return _over(bg, fg, opacity)
    mixed = blend_composite(resolve_mode(blend_mode), _linear(bg.cpu().numpy()),
                            _linear(fg.cpu().numpy()), opacity)
    mixed = np.concatenate([linear_to_srgb(np.clip(mixed[..., :3], 0.0, 1.0)),
                            np.clip(mixed[..., 3:4], 0.0, 1.0)], axis=-1)
    return torch.from_numpy(mixed).to(bg)


def _rgba(image: torch.Tensor) -> torch.Tensor:
    if image.shape[-1] == 4:
        return image
    return torch.cat([image[..., :3], torch.ones_like(image[..., :1])], dim=-1)


def _webp(frame: torch.Tensor) -> str:
    h, w = frame.shape[:2]
    k = min(1.0, _PREVIEW_SIDE / max(h, w))
    arr = (frame.float().clamp(0, 1) * 255).round().byte().cpu().numpy()
    img = Image.fromarray(arr, "RGBA" if arr.shape[-1] == 4 else "RGB")
    if k < 1.0:
        img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.BILINEAR)
    buf = _io.BytesIO()
    img.save(buf, "WEBP", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def preview_indices(frames: int) -> list[int]:
    return sorted({round(i * (frames - 1) / max(1, _PREVIEW_FRAMES - 1))
                   for i in range(min(frames, _PREVIEW_FRAMES))})


# Last preview each node sent, oldest dropped first: the push rides on execution, and after a
# page reload a node whose inputs did not change is served from the executor's cache and
# never runs again. The editor fetches this instead of asking for a re-render. Small:
# a dozen <=384px webp frames of each input per node.
_SOURCE_CACHE: dict = {}
_SOURCE_CACHE_MAX = 8

try:
    from server import PromptServer as _PS
    from aiohttp import web as _web

    @_PS.instance.routes.get("/nkd/merge/source")
    async def _nkd_merge_source(request):
        payload = _SOURCE_CACHE.get(request.rel_url.query.get("node_id", ""))
        if payload is None:
            return _web.Response(status=404, text="no preview for that node yet")
        return _web.json_response(payload)
except Exception:  # not inside ComfyUI (unit tests import this module bare)
    pass


def push_preview(unique_id, bg: list, fg: list, bg_size, fg_size) -> None:
    """Send the editor the sampled frames of both inputs. Never raises: a missing
    preview must not fail a render."""
    if unique_id is None:
        return
    try:
        from server import PromptServer
        payload = {
            "node": str(unique_id),
            "bg": [_webp(f) for f in bg],
            "fg": [_webp(f) for f in fg],
            "bg_size": list(bg_size),
            "fg_size": list(fg_size),
        }
        _SOURCE_CACHE[str(unique_id)] = payload
        while len(_SOURCE_CACHE) > _SOURCE_CACHE_MAX:
            _SOURCE_CACHE.pop(next(iter(_SOURCE_CACHE)))
        PromptServer.instance.send_sync("nkd-merge-source", payload)
    except Exception:
        pass


class NKDMerge(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDMerge",
            display_name="😺NKD Merge",
            category="😺NKD Nodes/Compositing",
            search_aliases=["merge", "composite", "over", "overlay", "layer", "blend", "paste"],
            description=(
                "Places a transparent cut-out over a background, frame by frame. A still "
                "background works under a video cut-out and the other way round. Run once, "
                "then drag the cut-out in the node to move, scale and rotate it."
            ),
            inputs=[
                io.Image.Input("background", tooltip="Image or frames. Sets the output size."),
                io.Image.Input("foreground",
                               tooltip="RGBA cut-out, as Alpha Matte makes. An RGB image "
                                       "is treated as fully opaque."),
                io.Mask.Input("alpha", optional=True,
                              tooltip="Optional matte for the foreground, 1 = opaque. "
                                      "Replaces the foreground's own alpha."),
                io.Combo.Input("fit", options=list(FITS), default="fit",
                               tooltip="What scale 1 means. fit: the whole foreground fits "
                                       "inside the background. fill: it covers the "
                                       "background, overflow cropped. pixels: its own size "
                                       "in pixels."),
                io.Float.Input("opacity", default=1.0, min=0.0, max=1.0, step=0.01),
                io.Combo.Input("blend_mode", options=list(_LAYER_MODES), default="normal",
                               tooltip="Same modes as core's Create Layered Image."),
                io.String.Input("transform", default=json.dumps(DEFAULT_TRANSFORM),
                                multiline=False, socketless=True,
                                tooltip="Position, scale and rotation, set by dragging in "
                                        "the node."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="As many frames as the longer input; the shorter "
                                        "one loops. RGBA only if the background was RGBA."),
                io.Mask.Output(display_name="mask",
                               tooltip="The foreground's matte where it landed on the "
                                       "background, 1 = foreground. For working on the "
                                       "subject alone afterwards."),
            ],
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    def execute(cls, background, foreground, fit, opacity, blend_mode, transform,
                alpha=None) -> io.NodeOutput:
        if blend_mode not in _LAYER_MODES:
            raise ValueError(f"Unknown blend mode: {blend_mode}")
        if fit not in FITS:
            raise ValueError(f"Unknown fit: {fit}")
        device = mask_core._work_device(background)
        fg = _rgba(foreground).to(device, torch.float32)
        if alpha is not None:
            if alpha.dim() == 2:
                alpha = alpha.unsqueeze(0)
            alpha = alpha.to(device, torch.float32)
            if alpha.shape[-2:] != fg.shape[1:3]:
                alpha = F.interpolate(alpha.unsqueeze(1), size=fg.shape[1:3],
                                      mode="bilinear").squeeze(1)
        bg = _rgba(background).to(device, torch.float32)
        bg_h, bg_w = bg.shape[1:3]
        fg_h, fg_w = fg.shape[1:3]
        m = place_matrix(parse_transform(transform), fit, bg_w, bg_h, fg_w, fg_h)

        frames = max(bg.shape[0], fg.shape[0], 0 if alpha is None else alpha.shape[0])
        sampled = set(preview_indices(frames))
        images, mattes, prev_bg, prev_fg = [], [], [], []
        for i in range(frames):
            b, f = bg[i % bg.shape[0]], fg[i % fg.shape[0]]
            if alpha is not None:
                f = torch.cat([f[..., :3], alpha[i % alpha.shape[0]].unsqueeze(-1)], -1)
            placed = place(f, m, bg_w, bg_h)
            images.append(blend(b, placed, opacity, blend_mode))
            mattes.append(placed[..., 3])
            if i in sampled:
                prev_bg.append(b)
                prev_fg.append(f)

        push_preview(node_id(cls), prev_bg, prev_fg, (bg_w, bg_h), (fg_w, fg_h))
        out = torch.stack(images).to(device=background.device, dtype=background.dtype)
        mask = torch.stack(mattes).to(device=background.device, dtype=background.dtype)
        return io.NodeOutput(out if background.shape[-1] == 4 else out[..., :3], mask)


class NKDMergeExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMerge]


async def comfy_entrypoint() -> NKDMergeExtension:
    return NKDMergeExtension()


NODE_CLASS_MAPPINGS = {"NKDMerge": NKDMerge}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDMerge": "😺NKD Merge"}
