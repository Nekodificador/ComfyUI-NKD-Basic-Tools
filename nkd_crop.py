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
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
import torch.nn.functional as F

from comfy_api.latest import ComfyExtension, io
from comfy_api.latest._io import ComfyTypeIO, comfytype
from typing_extensions import override

try:
    from .helpers import _alpha_hardness, _mask_grow, _resize_auto  # ComfyUI (package)
except ImportError:
    from helpers import _alpha_hardness, _mask_grow, _resize_auto   # standalone tests (sys.path)


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


def _parse_angle(region: str) -> float:
    """Degrees, clockwise (screen Y-down), around the box's own center. 0 if absent or
    malformed — an old `region` saved before rotation existed just means "no rotation"."""
    try:
        data = json.loads(region) if region else {}
        a = float(data.get("angle", 0.0))
        return a if math.isfinite(a) else 0.0
    except (ValueError, TypeError, KeyError):
        return 0.0


def _snap_bbox_rotated(x0: int, y0: int, x1: int, y1: int,
                       multiple: int) -> tuple[int, int, int, int]:
    """Grow the box's own width/height to `multiple`, centered — no edge to clamp against
    once it's rotated (its footprint in SOURCE space isn't the axis-aligned `[x0,x1]` range
    any more, so `_snap_bbox`'s clamp doesn't mean anything here)."""
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0

    def grow(v: int) -> int:
        rem = v % multiple
        return v if rem == 0 else v + (multiple - rem)

    w, h = grow(x1 - x0), grow(y1 - y0)
    return round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2)


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


def _contain_rotated_bbox(x0: float, y0: float, x1: float, y1: float, angle: float,
                          width: int, height: int) -> tuple[int, int, int, int]:
    """Crop mode's hard guarantee: the box's ROTATED footprint never leaves
    `[0,width]x[0,height]`. Ported from `containRotatedBox` in `crop.ts` — keep the two in
    lock-step, because the frontend already SHOWED the user this exact box; if this function
    drifts from it, the server silently crops something the editor never displayed.

    Translates first (cheap, keeps the size the user picked), and only shrinks (around the
    box's own center, so containing it doesn't also recenter it) if translating alone can't
    make it fit — a box already close to the full source, rotated. A few iterations because
    shrinking changes the footprint, which can re-open room to translate.
    """
    theta = math.radians(angle)
    cos_a, sin_a = math.cos(theta), math.sin(theta)
    bx0, by0, bx1, by1 = float(x0), float(y0), float(x1), float(y1)
    for _ in range(6):
        cx, cy = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0
        corners = ((bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1))
        rx = [cx + (px - cx) * cos_a - (py - cy) * sin_a for px, py in corners]
        ry = [cy + (px - cx) * sin_a + (py - cy) * cos_a for px, py in corners]
        min_x, max_x, min_y, max_y = min(rx), max(rx), min(ry), max(ry)
        bw, bh = max_x - min_x, max_y - min_y
        if bw > width + 1e-6 or bh > height + 1e-6:
            scale = min(width / bw, height / bh) * 0.999
            bx0, by0 = cx + (bx0 - cx) * scale, cy + (by0 - cy) * scale
            bx1, by1 = cx + (bx1 - cx) * scale, cy + (by1 - cy) * scale
            continue
        dx = dy = 0.0
        if min_x < 0:
            dx = -min_x
        elif max_x > width:
            dx = width - max_x
        if min_y < 0:
            dy = -min_y
        elif max_y > height:
            dy = height - max_y
        if dx == 0.0 and dy == 0.0:
            break
        bx0 += dx; by0 += dy; bx1 += dx; by1 += dy
    return round(bx0), round(by0), round(bx1), round(by1)


def _region_box(region: str, mode: str, width: int, height: int,
                divisible_by: str) -> tuple[int, int, int, int, float]:
    """The final `(x0, y0, x1, y1, angle)`: parsed, grown to the grid if `divisible_by` is
    set, THEN Crop mode's containment as the final, absolute guarantee — same order as
    `finalizeBox` in `crop.ts`. Grid-snapping a rotated box has no edge to clamp against
    (`_snap_bbox_rotated` just grows it, centered), so without this last pass a Crop-mode
    crop that only NEEDED grid alignment could come back out of bounds again — the editor
    showed a contained box, and the render would silently disagree with it. Shared by the
    mask and image/video paths in `execute` so the two can never drift apart.
    """
    outpaint = mode == "Outpaint"
    angle = _parse_angle(region)
    rotated = abs(angle) > 1e-6
    x0, y0, x1, y1 = _parse_region(region, width, height,
                                   allow_outpaint=outpaint or rotated)
    if divisible_by != "disabled":
        div = int(divisible_by)
        if rotated:
            x0, y0, x1, y1 = _snap_bbox_rotated(x0, y0, x1, y1, div)
        else:
            x0, y0, x1, y1 = _snap_bbox(x0, y0, x1, y1, div,
                                        None if outpaint else width, None if outpaint else height)
    if not outpaint and rotated:
        x0, y0, x1, y1 = _contain_rotated_bbox(x0, y0, x1, y1, angle, width, height)
    return x0, y0, x1, y1, angle


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
             fill: str, fill_color: str, angle: float = 0.0) -> tuple[torch.Tensor, torch.Tensor]:
    """Returns `(result, generate_mask)`.

    `result` is `[B, y1-y0, x1-x0, C]`. `generate_mask` is `[B, y1-y0, x1-x0]`, 1.0 where the
    pixel is new (outside the source) and 0.0 where it came from the source — the outpaint
    conditioning mask, ready to wire into an inpaint sampler as-is.

    A non-zero `angle` hands off to `_crop_pad_rotated` entirely: an oriented box can't be
    expressed as a slice, so there is no exact-pixel fast path for it. `angle == 0` (the
    common case) keeps the plain slice-and-pad below, unchanged — that's what
    `test_execute_grid_aligned_crop_is_exact_pixels_not_resampled` pins down.
    """
    if abs(angle) > 1e-6:
        return _crop_pad_rotated(t, x0, y0, x1, y1, angle, fill, fill_color)
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


def _crop_pad_rotated(t: torch.Tensor, x0: int, y0: int, x1: int, y1: int, angle_deg: float,
                      fill: str, fill_color: str) -> tuple[torch.Tensor, torch.Tensor]:
    """`_crop_pad`'s job for a box rotated `angle_deg` (clockwise, screen Y-down) around its
    own center: sample the tilted rectangle out of `t` and land it as an axis-aligned
    `[B, h, w, C]` output, via `grid_sample` instead of a slice.

    Coordinates are treated as a continuous span (pixel 0 occupies `[0, 1)`, matching how
    `x0..x1` are already built in `_parse_region`) rather than exact pixel centers — off by
    at most half a pixel from `grid_sample`'s own `align_corners=False` convention, invisible
    next to the bilinear blur this path already accepts by existing at all.
    """
    B, H, W, C = t.shape
    new_w, new_h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    theta = math.radians(angle_deg)
    cos_a, sin_a = math.cos(theta), math.sin(theta)

    device = t.device
    ys, xs = torch.meshgrid(
        torch.arange(new_h, device=device, dtype=torch.float32),
        torch.arange(new_w, device=device, dtype=torch.float32),
        indexing="ij",
    )
    dx = (xs + 0.5) - new_w / 2.0
    dy = (ys + 0.5) - new_h / 2.0
    src_x = cx + dx * cos_a - dy * sin_a
    src_y = cy + dx * sin_a + dy * cos_a
    gx = (src_x / W) * 2.0 - 1.0
    gy = (src_y / H) * 2.0 - 1.0
    grid = torch.stack((gx, gy), dim=-1).unsqueeze(0).expand(B, -1, -1, -1).to(t.dtype)

    pad_mode = "border" if fill == "edge" else ("reflection" if fill == "reflect" else "zeros")
    chw = t.movedim(-1, 1)
    sampled = F.grid_sample(chw, grid, mode="bilinear", padding_mode=pad_mode,
                            align_corners=False)

    valid2d = ((gx >= -1) & (gx <= 1) & (gy >= -1) & (gy <= 1)).to(t.dtype)
    if pad_mode == "zeros":
        r, g, b = (_hex_to_rgb(fill_color) if fill == "color"
                  else (_FLAT_FILLS.get(fill, 0.0),) * 3)
        colors = (r, g, b, 1.0)
        color = torch.tensor([colors[c] if c < 4 else 0.0 for c in range(C)],
                             device=device, dtype=t.dtype).view(1, C, 1, 1)
        v = valid2d.view(1, 1, new_h, new_w)
        sampled = sampled * v + color * (1 - v)

    out = sampled.movedim(1, -1).clamp(0.0, 1.0)
    mask = (1.0 - valid2d).clamp(0.0, 1.0).view(1, new_h, new_w).expand(B, -1, -1)
    return out, mask


def _crop_pad_mask(t: torch.Tensor, x0: int, y0: int, x1: int, y1: int,
                   fill: str, fill_color: str, angle: float = 0.0) -> torch.Tensor:
    """Same crop+pad, for a `[B, H, W]` MASK tensor (single "channel")."""
    rgb, _generate = _crop_pad(t.unsqueeze(-1).expand(-1, -1, -1, 3), x0, y0, x1, y1,
                               fill, fill_color, angle)
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


# ── Stitch: the inverse of the crop, for 😺NKD Crop / Outpaint Stitch ─────────
# Same family as NKDInpaintCrop/Stitch and NKDFaceCrop/Stitch (`nkd_crop_stitch.py`,
# `nkd_face_crop.py`) — a crop_data cable carries what Stitch needs to composite back — but
# a SEPARATE dataclass/type (`NKD_MANUAL_CROPDATA`, not `NKD_CROPDATA`): those two always
# crop axis-aligned and in-bounds, so their `_uncrop` does a plain slice assignment that
# would silently misbehave (or IndexError) on a rotated or partially-outpainted box. Sharing
# the type string would let the sockets connect and hand `_uncrop` a shape it can't handle.

@dataclass
class NKDManualCropData:
    background: torch.Tensor              # [B, H, W, C] original image, pre-crop (CPU)
    crop_box: Tuple[int, int, int, int]   # (x0, y0, x1, y1) in ORIGINAL pixels; may be
                                          # outside [0, W]x[0, H] (Outpaint) or rotated
    angle: float                          # degrees, clockwise, around the box's own center


@comfytype(io_type="NKD_MANUAL_CROPDATA")
class NKDManualCropDataType(ComfyTypeIO):
    Type = NKDManualCropData


def _uncrop_manual(patch: torch.Tensor, background: torch.Tensor,
                   crop_box: tuple[int, int, int, int], angle: float,
                   feather: int, hardness: float) -> torch.Tensor:
    """Composite `patch` back onto `background` at `crop_box`'s original position and
    rotation — the inverse of `_crop_pad`/`_crop_pad_rotated`.

    Always an inverse WARP over the whole background canvas (one `grid_sample`), never a
    slice assignment: unlike `_uncrop` in `helpers.py`, `crop_box` here can be rotated and/or
    stick out past the background's own bounds (Outpaint), and a slice can express neither.
    `feather`/`hardness` reuse the exact helpers `_uncrop` uses, for the same blend behaviour.

    ponytail: the output canvas is `background`-sized — any patch content that maps outside
    it (an Outpaint crop that grew the canvas) is clipped rather than grown into. Add
    canvas-expansion if that turns out to matter; most stitch-backs land inside the original
    frame or close to it.
    """
    x0, y0, x1, y1 = crop_box
    Bg, H, W, C = background.shape
    crop_w, crop_h = x1 - x0, y1 - y0
    if patch.shape[1] != crop_h or patch.shape[2] != crop_w:
        patch = _resize_auto(patch, crop_w, crop_h)

    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    theta = -math.radians(angle)   # undo the crop's own rotation
    cos_a, sin_a = math.cos(theta), math.sin(theta)

    device = background.device
    ys, xs = torch.meshgrid(
        torch.arange(H, device=device, dtype=torch.float32),
        torch.arange(W, device=device, dtype=torch.float32),
        indexing="ij",
    )
    dx, dy = (xs + 0.5) - cx, (ys + 0.5) - cy
    px = dx * cos_a - dy * sin_a + crop_w / 2.0
    py = dx * sin_a + dy * cos_a + crop_h / 2.0
    gx = (px / crop_w) * 2.0 - 1.0
    gy = (py / crop_h) * 2.0 - 1.0
    grid = torch.stack((gx, gy), dim=-1).unsqueeze(0).expand(Bg, -1, -1, -1).to(background.dtype)

    warped = F.grid_sample(patch.movedim(-1, 1), grid, mode="bilinear",
                           padding_mode="zeros", align_corners=False).movedim(1, -1)
    hard_valid = ((gx >= -1) & (gx <= 1) & (gy >= -1) & (gy <= 1)).to(background.dtype)
    hard_valid = hard_valid.unsqueeze(0).expand(Bg, -1, -1)
    valid = hard_valid
    if feather > 0:
        # `_mask_grow`'s blur is symmetric — it would soften OUTWARD past the patch edge
        # too, and out there `warped` is `padding_mode="zeros"` (pure black, never real
        # content): that bleed is exactly the border Neko saw. Feather has to erode INWARD
        # ONLY, never grow past where the patch actually has anything to blend — hence the
        # min() against the hard edge right after.
        valid = torch.minimum(_mask_grow(valid, 0, feather), hard_valid)
    valid = _alpha_hardness(valid, hardness)

    alpha = valid.unsqueeze(-1)
    return (warped * alpha + background * (1.0 - alpha)).clamp(0.0, 1.0)


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
            category="😺NKD Nodes/Basic",
            description=(
                "Interactive crop on the node itself — drag a rectangle over the connected "
                "image, mask or video, or rotate it with the handle above it. Crop mode "
                "keeps the rectangle inside the source; Outpaint mode lets it extend past "
                "the edge, filling the new area per `fill` and reporting it white in the "
                "output mask (generate here), same polarity as NKD Timeline's coverage "
                "mask. `divisible_by` aligns the crop itself to a pixel grid (no resample "
                "needed) instead of just resizing the result to fit. Connect `crop_data` to "
                "😺NKD Crop / Outpaint Stitch to composite the processed result back."
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
                NKDManualCropDataType.Output(
                    display_name="crop_data",
                    tooltip="Connect to 😺NKD Crop / Outpaint Stitch to composite the "
                            "processed image back. None if the input was a mask."),
            ],
        )

    @classmethod
    def execute(cls, image, region: str = "", fill: str = "edge", fill_color: str = "#000000",
               max_megapixels: float = 0.0, divisible_by: str = "disabled",
               mode: str = "Crop") -> io.NodeOutput:
        if isinstance(image, torch.Tensor):
            if image.ndim == 3:                       # MASK [B,H,W]
                B, H, W = image.shape
                x0, y0, x1, y1, angle = _region_box(region, mode, W, H, divisible_by)
                # Crop mode never shows the fill widgets — any sliver rotation exposes gets
                # a silent, sane default rather than a stale value from a past Outpaint run.
                effective_fill = fill if mode == "Outpaint" else "edge"
                out_mask = _crop_pad_mask(image, x0, y0, x1, y1, effective_fill, fill_color,
                                          angle)
                out_mask = _downscale(out_mask, max_megapixels, divisible_by)
                h, w = out_mask.shape[1], out_mask.shape[2]
                return io.NodeOutput(None, out_mask, w, h, None)
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
        x0, y0, x1, y1, angle = _region_box(region, mode, W, H, divisible_by)
        effective_fill = fill if mode == "Outpaint" else "edge"
        crop_data = NKDManualCropData(background=frames.cpu(), crop_box=(x0, y0, x1, y1),
                                      angle=angle)
        out_image, gen_mask = _crop_pad(frames, x0, y0, x1, y1, effective_fill, fill_color,
                                        angle)
        out_image = _downscale(out_image, max_megapixels, divisible_by)
        gen_mask = _downscale(gen_mask, max_megapixels, divisible_by)
        h, w = out_image.shape[1], out_image.shape[2]
        return io.NodeOutput(out_image, gen_mask, w, h, crop_data)


class NKDCropStitch(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDCropStitch",
            display_name="😺NKD Crop / Outpaint Stitch",
            category="😺NKD Nodes/Basic",
            description=(
                "Composite a processed crop back onto the original image, at 😺NKD Crop / "
                "Outpaint's original position and rotation — the manual counterpart to "
                "😺NKD Inpaint Stitch / 😺NKD Face Stitch."
            ),
            inputs=[
                io.Image.Input("image", tooltip="The processed crop."),
                NKDManualCropDataType.Input("crop_data"),
                io.Int.Input("feather", default=10, min=0, max=256,
                             tooltip="Softens the edge of the pasted area, in pixels."),
                io.Float.Input("edge_hardness", default=0.0, min=0.0, max=1.0, step=0.05,
                               tooltip="Firms up the blend edge to stop the original "
                                       "background from ghosting through as a halo. "
                                       "0 = off, 1 = hard edge."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="Original image with the crop composited back."),
            ],
        )

    @classmethod
    def execute(cls, image, crop_data: NKDManualCropData, feather: int,
               edge_hardness: float) -> io.NodeOutput:
        bg = crop_data.background.to(image.device)
        if bg.shape[0] == 1 and image.shape[0] > 1:
            bg = bg.repeat(image.shape[0], 1, 1, 1)
        out = _uncrop_manual(image, bg, crop_data.crop_box, crop_data.angle,
                             feather, edge_hardness)
        return io.NodeOutput(out)


class NKDCropExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDCrop, NKDCropStitch]


async def comfy_entrypoint() -> NKDCropExtension:
    return NKDCropExtension()
