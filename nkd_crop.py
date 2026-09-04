"""😺NKD Crop / Outpaint — interactive crop that can extend past the source bounds.

The `region` widget is a JSON box `{x, y, w, h}` in fractions of the SOURCE image, managed
by the on-canvas widget in `src/crop.ts`. Unlike a plain crop, x/y/w/h are not clamped to
[0, 1]: a box that sticks out past the edge is an outpaint request, and the extra pixels are
filled per `fill` while `mask` reports where they landed (white = generate, same polarity as
`coverage`/`generate` in NKD Timeline — a consumer already wired to that convention needs no
adapter here).
"""

from __future__ import annotations

import json
import math
from typing import Optional

import torch
import torch.nn.functional as F

from comfy_api.latest import ComfyExtension, io
from typing_extensions import override


# ── Region parsing ──────────────────────────────────────────────────────────

def _parse_region(region: str, width: int, height: int,
                  allow_outpaint: bool = True) -> tuple[int, int, int, int]:
    """`(x0, y0, x1, y1)` pixel box.

    Falls back to the full image (a no-op passthrough) on anything malformed — the same
    "corrupt input degrades gracefully" rule as `parse_timeline`. With `allow_outpaint=False`
    (mode = "Crop") the box is clamped inside `[0, width]x[0, height]` before it ever becomes
    pixels — same as the plain-crop behaviour `sthao42/Comfyui-reference-loader` had; Outpaint
    mode is what lifts that clamp.
    """
    if width <= 0 or height <= 0:
        return 0, 0, max(1, width), max(1, height)
    try:
        data = json.loads(region) if region else {}
        x = float(data.get("x", 0.0))
        y = float(data.get("y", 0.0))
        w = float(data.get("w", 1.0))
        h = float(data.get("h", 1.0))
        if not all(math.isfinite(v) for v in (x, y, w, h)) or w <= 0 or h <= 0:
            x, y, w, h = 0.0, 0.0, 1.0, 1.0
    except (ValueError, TypeError, KeyError):
        x, y, w, h = 0.0, 0.0, 1.0, 1.0
    if not allow_outpaint:
        x = max(0.0, min(1.0, x))
        y = max(0.0, min(1.0, y))
        w = max(0.0, min(1.0 - x, w))
        h = max(0.0, min(1.0 - y, h))
    x0 = round(x * width)
    y0 = round(y * height)
    x1 = round((x + w) * width)
    y1 = round((y + h) * height)
    if x1 <= x0:
        x1 = x0 + 1
    if y1 <= y0:
        y1 = y0 + 1
    return x0, y0, x1, y1


def _snap_bbox(x0: int, y0: int, x1: int, y1: int, multiple: int,
               clamp_w: Optional[int], clamp_h: Optional[int]) -> tuple[int, int, int, int]:
    """Grow the box so both axes are multiples of `multiple`, centered — the pixel-grid
    alignment KJ's Transform node does, which matters for models that quantise the canvas
    (MiniMax rounds to 32, `nodes_minimax_h3.py:adapt_canvas`). Landing off that grid pays for
    a resize the model would have forced anyway; landing ON it needs none at all.

    Same centered-grow-then-redirect-at-the-edge idea as `_expand_bbox_to_multiple` in NKD
    Klein Tools' `helpers.py` — ported, not imported: that one always clamps to the image
    edge, and here Outpaint mode's whole point is that there isn't one to clamp against
    (`clamp_w`/`clamp_h` are `None` there).
    """
    def grow(a: int, b: int, limit: Optional[int]) -> tuple[int, int]:
        size = b - a
        rem = size % multiple
        if rem == 0:
            return a, b
        extra = multiple - rem
        add_before = extra // 2
        na, nb = a - add_before, b + (extra - add_before)
        if limit is not None:
            if na < 0:
                nb += -na
                na = 0
            if nb > limit:
                na -= (nb - limit)
                nb = limit
            na = max(0, na)
        return na, nb

    nx0, nx1 = grow(x0, x1, clamp_w)
    ny0, ny1 = grow(y0, y1, clamp_h)
    return nx0, ny0, nx1, ny1


def _region_box(region: str, mode: str, width: int, height: int,
                divisible_by: str) -> tuple[int, int, int, int]:
    """The final `(x0, y0, x1, y1)`: parsed, clamped if `mode == "Crop"`, then grown to the
    grid if `divisible_by` is set. Shared by the mask and image/video paths in `execute` so
    the two can never drift apart."""
    outpaint = mode == "Outpaint"
    x0, y0, x1, y1 = _parse_region(region, width, height, allow_outpaint=outpaint)
    if divisible_by != "disabled":
        div = int(divisible_by)
        x0, y0, x1, y1 = _snap_bbox(x0, y0, x1, y1, div,
                                    None if outpaint else width, None if outpaint else height)
    return x0, y0, x1, y1


# ── Fill colours (mirrors NKD Klein Tools' `_outpaint_fill` flat-colour set) ──

_FLAT_FILLS = {"black": 0.0, "white": 1.0, "gray": 0.5}


def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    h = (hex_str or "").lstrip("#")
    if len(h) != 6:
        return 0.0, 0.0, 0.0
    try:
        return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError:
        return 0.0, 0.0, 0.0


# ── Crop + pad, one channel-last tensor [B, H, W, C] at a time ───────────────

def _crop_pad(t: torch.Tensor, x0: int, y0: int, x1: int, y1: int,
             fill: str, fill_color: str) -> tuple[torch.Tensor, torch.Tensor]:
    """Returns `(result, generate_mask)`.

    `result` is `[B, y1-y0, x1-x0, C]`. `generate_mask` is `[B, y1-y0, x1-x0]`, 1.0 where the
    pixel is new (outside the source) and 0.0 where it came from the source — the outpaint
    conditioning mask, ready to wire into an inpaint sampler as-is.
    """
    B, H, W, C = t.shape
    new_w, new_h = x1 - x0, y1 - y0

    # The part of the requested box that actually overlaps the source.
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(W, x1), min(H, y1)
    has_overlap = cx1 > cx0 and cy1 > cy0
    crop = t[:, cy0:cy1, cx0:cx1, :] if has_overlap else t[:, 0:0, 0:0, :]

    pad_left, pad_top = cx0 - x0, cy0 - y0
    pad_right, pad_bottom = x1 - cx1, y1 - cy1

    mask = torch.ones((B, new_h, new_w), dtype=t.dtype, device=t.device)
    if has_overlap:
        mask[:, pad_top:pad_top + crop.shape[1], pad_left:pad_left + crop.shape[2]] = 0.0

    if not has_overlap:
        # Nothing to replicate/reflect from — content-derived fills degrade to a flat one.
        fill = "black" if fill in ("edge", "reflect") else fill

    chw = crop.movedim(-1, 1)  # [B, C, h, w]

    if fill in ("edge", "reflect"):
        mode = "replicate" if fill == "edge" else "reflect"
        ch, cw = chw.shape[2], chw.shape[3]
        # torch.nn.functional.pad requires reflect padding to stay smaller than the source
        # dimension on that side; degrade to edge-replicate for whichever side overflows it.
        if mode == "reflect" and (pad_left >= cw or pad_right >= cw
                                  or pad_top >= ch or pad_bottom >= ch):
            mode = "replicate"
        padded = F.pad(chw, (pad_left, pad_right, pad_top, pad_bottom), mode=mode)
    else:
        r, g, b = (_hex_to_rgb(fill_color) if fill == "color"
                  else (_FLAT_FILLS.get(fill, 0.0),) * 3)
        canvas = torch.empty((B, C, new_h, new_w), dtype=t.dtype, device=t.device)
        for c in range(C):
            canvas[:, c] = (r, g, b, 1.0)[c] if c < 4 else 0.0
        if has_overlap:
            canvas[:, :, pad_top:pad_top + chw.shape[2], pad_left:pad_left + chw.shape[3]] = chw
        padded = canvas

    return padded.movedim(1, -1).clamp(0.0, 1.0), mask.clamp(0.0, 1.0)


def _crop_pad_mask(t: torch.Tensor, x0: int, y0: int, x1: int, y1: int,
                   fill: str, fill_color: str) -> torch.Tensor:
    """Same crop+pad, for a `[B, H, W]` MASK tensor (single "channel")."""
    rgb, _generate = _crop_pad(t.unsqueeze(-1).expand(-1, -1, -1, 3), x0, y0, x1, y1,
                               fill, fill_color)
    return rgb[..., 0]


# ── Downstream downscale (megapixels + grid snap) ─────────────────────────────
# Same shape as `LoadImageCrop` in sthao42/Comfyui-reference-loader: crop first, THEN scale
# to a pixel budget and snap to a model's grid. Kept as a separate pass so the crop/pad math
# above stays about placement, not resampling.

def _downscale(t: torch.Tensor, max_megapixels: float, divisible_by: str) -> torch.Tensor:
    height, width = t.shape[1], t.shape[2]
    new_w, new_h = width, height

    if max_megapixels > 0:
        target = max_megapixels * 1024 * 1024
        current = width * height
        if current > target:
            scale = (target / current) ** 0.5
            new_w = max(1, round(width * scale))
            new_h = max(1, round(height * scale))

    if divisible_by != "disabled":
        div = int(divisible_by)
        new_w = max(div, round(new_w / div) * div)
        new_h = max(div, round(new_h / div) * div)

    if new_w == width and new_h == height:
        return t
    import comfy.utils
    is_mask = t.ndim == 3
    samples = (t.unsqueeze(1) if is_mask else t.movedim(-1, 1))
    mode = "bilinear" if is_mask else "lanczos"
    samples = comfy.utils.common_upscale(samples, new_w, new_h, mode, "disabled")
    return (samples.squeeze(1) if is_mask else samples.movedim(1, -1)).clamp(0.0, 1.0)


# ── The node ───────────────────────────────────────────────────────────────

FILL_MODES = ["edge", "reflect", "black", "white", "gray", "color"]
DIVISIBLE_BY = ["disabled", "8", "16", "32", "64"]
MODES = ["Crop", "Outpaint"]


class NKDCrop(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDCrop",
            display_name="😺NKD Crop / Outpaint",
            category="😺NKD Nodes/Preview",
            description=(
                "Interactive crop on the node itself — drag a rectangle over the connected "
                "image, mask or video. Crop mode keeps the rectangle inside the source; "
                "Outpaint mode lets it extend past the edge, filling the new area per `fill` "
                "and reporting it white in the output mask (generate here), same polarity as "
                "NKD Timeline's coverage mask. `divisible_by` aligns the crop itself to a "
                "pixel grid (no resample needed) instead of just resizing the result to fit."
            ),
            inputs=[
                io.MultiType.Input("image", [io.Image, io.Mask, io.Video]),
                io.String.Input(
                    "region", default="", multiline=False, socketless=True,
                    tooltip="Managed by the crop editor on the node — no need to edit by hand."),
                io.Combo.Input(
                    "fill", options=FILL_MODES, default="edge",
                    tooltip="How the outpainted area is filled before generation: edge "
                            "replicates the border pixel, reflect mirrors it, or pick a flat "
                            "colour."),
                io.Color.Input(
                    "fill_color", default="#000000",
                    tooltip="Colour used when fill = color."),
                io.Float.Input(
                    "max_megapixels", default=0.0, min=0.0, max=128.0, step=0.01,
                    tooltip="Downscale the result to this many megapixels if larger. "
                            "0 disables."),
                io.Combo.Input(
                    "divisible_by", options=DIVISIBLE_BY, default="disabled",
                    tooltip="Align the crop rectangle itself to a multiple of 8/16/32/64 "
                            "(grown, not resized) — the pixel grid models like MiniMax need. "
                            "Also snaps the final size after a megapixel downscale."),
                io.Combo.Input(
                    "mode", options=MODES, default="Crop",
                    tooltip="Crop: the rectangle stays inside the source. Outpaint: it can "
                            "extend past the edge to grow the canvas."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="The cropped/outpainted image (or video frames). "
                                        "None if the input was a mask."),
                io.Mask.Output(display_name="mask",
                               tooltip="Input was image/video: white = outpainted area "
                                       "(generate here). Input was a mask: the cropped/"
                                       "outpainted mask itself."),
                io.Int.Output(display_name="width"),
                io.Int.Output(display_name="height"),
            ],
        )

    @classmethod
    def execute(cls, image, region: str = "", fill: str = "edge", fill_color: str = "#000000",
               max_megapixels: float = 0.0, divisible_by: str = "disabled",
               mode: str = "Crop") -> io.NodeOutput:
        if isinstance(image, torch.Tensor):
            if image.ndim == 3:                       # MASK [B,H,W]
                B, H, W = image.shape
                x0, y0, x1, y1 = _region_box(region, mode, W, H, divisible_by)
                out_mask = _crop_pad_mask(image, x0, y0, x1, y1, fill, fill_color)
                out_mask = _downscale(out_mask, max_megapixels, divisible_by)
                h, w = out_mask.shape[1], out_mask.shape[2]
                return io.NodeOutput(None, out_mask, w, h)
            frames = image                              # IMAGE [B,H,W,C]
        else:
            # VIDEO, duck-typed like `classify()` in nkd_timeline.py. Decoded whole in one
            # shot rather than Timeline's windowed `decode_fitted` — this node runs once per
            # crop, not per-frame-of-a-multi-clip-render, so the simpler path is the lazy one.
            # ponytail: no windowed decode; revisit if someone crops a very long clip.
            if not (hasattr(image, "get_components") and hasattr(image, "save_to")):
                raise ValueError("😺NKD Crop got something that is not an image, mask or video.")
            frames = image.get_components().images

        B, H, W, C = frames.shape
        x0, y0, x1, y1 = _region_box(region, mode, W, H, divisible_by)
        out_image, gen_mask = _crop_pad(frames, x0, y0, x1, y1, fill, fill_color)
        out_image = _downscale(out_image, max_megapixels, divisible_by)
        gen_mask = _downscale(gen_mask, max_megapixels, divisible_by)
        h, w = out_image.shape[1], out_image.shape[2]
        return io.NodeOutput(out_image, gen_mask, w, h)


class NKDCropExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDCrop]


async def comfy_entrypoint() -> NKDCropExtension:
    return NKDCropExtension()
