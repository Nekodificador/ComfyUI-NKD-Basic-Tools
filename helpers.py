from __future__ import annotations
from typing import Optional, Tuple
import torch
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Image / mask resize
# ---------------------------------------------------------------------------

def _resize(image: torch.Tensor, width: int, height: int, mode: str = "bilinear") -> torch.Tensor:
    if image.shape[1] == height and image.shape[2] == width:
        return image
    x = image.permute(0, 3, 1, 2)
    # `area` does not accept align_corners; bicubic/bilinear do.
    if mode == "area":
        x = F.interpolate(x, size=(height, width), mode="area")
    else:
        x = F.interpolate(x, size=(height, width), mode=mode, align_corners=False)
    if mode == "bicubic":
        x = x.clamp(0.0, 1.0)
    return x.permute(0, 2, 3, 1)


def _resize_auto(image: torch.Tensor, width: int, height: int) -> torch.Tensor:
    """Pick the right filter based on direction: area for downscale, bicubic for upscale."""
    if image.shape[1] == height and image.shape[2] == width:
        return image
    src_pixels = image.shape[1] * image.shape[2]
    dst_pixels = height * width
    if dst_pixels < src_pixels:
        return _resize(image, width, height, mode="area")
    return _resize(image, width, height, mode="bicubic")


def _resize_mask(mask: torch.Tensor, width: int, height: int) -> torch.Tensor:
    if mask.dim() == 2:
        mask = mask.unsqueeze(0)
    if mask.shape[1] == height and mask.shape[2] == width:
        return mask
    x = mask.unsqueeze(1).float()
    x = F.interpolate(x, size=(height, width), mode="bilinear", align_corners=False)
    return x.squeeze(1)


# ---------------------------------------------------------------------------
# MaskGrow — morphological dilation + blur on mask edges
# ---------------------------------------------------------------------------

def _mask_grow(mask: torch.Tensor, expand: int, blur: int) -> torch.Tensor:
    if mask.dim() == 2:
        mask = mask.unsqueeze(0)

    m = mask.unsqueeze(1).float()

    if expand > 0:
        try:
            import kornia.morphology as morph
            # 3×3 dilation kernel iterated expand times — GPU-accelerated via kornia.
            kernel = torch.ones(3, 3, device=mask.device, dtype=m.dtype)
            for _ in range(expand):
                m = morph.dilation(m, kernel)
        except ImportError:
            # Fallback: chunked max-pool — still much faster than a single huge conv kernel
            remaining = expand
            for k in (32, 8, 2, 1):
                while remaining >= k:
                    m = F.pad(m, (k, k, k, k), mode="replicate")
                    m = F.max_pool2d(m, kernel_size=2 * k + 1, stride=1, padding=0)
                    remaining -= k
        m = m.clamp(0.0, 1.0)

    if blur > 0:
        # Box blur ×3 passes per axis approximates a gaussian, separable and fast.
        k = blur | 1
        pad = k // 2
        box = torch.ones(1, 1, 1, k, device=mask.device, dtype=m.dtype) / k
        for _ in range(3):
            m = F.pad(m, (pad, pad, 0, 0), mode="replicate")
            m = F.conv2d(m, box, padding=0)
        box_v = box.transpose(2, 3)
        for _ in range(3):
            m = F.pad(m, (0, 0, pad, pad), mode="replicate")
            m = F.conv2d(m, box_v, padding=0)
        m = m.clamp(0.0, 1.0)

    return m.squeeze(1)


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------

def _megapixels_to_pixels(value) -> int:
    return int(float(value) * 1_048_576)


# Modern VAEs compress by /8 or /16 per spatial axis. Any dimension that isn't
# aligned gets truncated by the encoder — the decoded patch is then smaller
# than expected, forcing _uncrop to resize by ~1.01× and introducing visible
# scale drift on composite. Round everything to /16 (also a multiple of 8) to
# keep the pixel grid aligned through the VAE roundtrip.
# ponytail: fixed 16 covers SD/SDXL/Flux/Wan; expose a widget if a /32 model shows up.
_VAE_MULTIPLE = 16


# ---------------------------------------------------------------------------
# Crop / uncrop
# ---------------------------------------------------------------------------

def _bbox_from_mask(mask: torch.Tensor) -> Tuple[int, int, int, int]:
    if mask.dim() == 3:
        mask = mask[0]
    nonzero = torch.nonzero(mask > 0.5, as_tuple=False)
    if nonzero.numel() == 0:
        h, w = mask.shape
        return 0, 0, w, h
    y1 = int(nonzero[:, 0].min().item())
    y2 = int(nonzero[:, 0].max().item()) + 1
    x1 = int(nonzero[:, 1].min().item())
    x2 = int(nonzero[:, 1].max().item()) + 1
    return x1, y1, x2, y2


def _expand_bbox_to_multiple(
    x1: int, y1: int, x2: int, y2: int,
    img_w: int, img_h: int,
    multiple: int = _VAE_MULTIPLE,
) -> Tuple[int, int, int, int]:
    """Grow bbox so width/height are multiples of `multiple`, centered when possible.
    Falls back to shifting against the image edge if the grown bbox would clip out."""
    def _grow(a: int, b: int, limit: int) -> Tuple[int, int]:
        size = b - a
        rem = size % multiple
        if rem == 0:
            return a, b
        extra = multiple - rem
        add_before = extra // 2
        add_after = extra - add_before
        new_a = a - add_before
        new_b = b + add_after
        if new_a < 0:
            new_b += -new_a
            new_a = 0
        if new_b > limit:
            new_a -= (new_b - limit)
            new_b = limit
        new_a = max(0, new_a)
        return new_a, new_b

    nx1, nx2 = _grow(x1, x2, img_w)
    ny1, ny2 = _grow(y1, y2, img_h)
    return nx1, ny1, nx2, ny2


def _pick_render_dims(
    bbox_w: int, bbox_h: int, target_pixels: int, multiple: int = _VAE_MULTIPLE,
) -> Tuple[int, int]:
    """Pick (render_w, render_h), both /multiple, close to target_pixels and
    matching the bbox aspect ratio as closely as `multiple` quantisation allows.

    The render is computed independently (not as a scalar multiple of the bbox),
    so its aspect ratio may drift up to one `multiple` per axis vs the bbox.
    The caller (_crop_by_mask) compensates by GROWING the bbox to match the
    render's aspect exactly — this is what keeps the _uncrop resize symmetric."""
    if bbox_w <= 0 or bbox_h <= 0:
        return multiple, multiple
    aspect = bbox_w / bbox_h
    render_h_ideal = (target_pixels / aspect) ** 0.5
    render_w_ideal = render_h_ideal * aspect
    render_w = max(multiple, int(round(render_w_ideal / multiple)) * multiple)
    render_h = max(multiple, int(round(render_h_ideal / multiple)) * multiple)
    return render_w, render_h


def _grow_bbox_to_aspect(
    x1: int, y1: int, x2: int, y2: int,
    target_aspect: float,
    img_w: int, img_h: int,
    multiple: int = _VAE_MULTIPLE,
) -> Tuple[int, int, int, int]:
    """Grow the bbox so its aspect ratio matches `target_aspect` while staying
    /multiple-aligned, centred on the original bbox, clamped to image bounds.

    If the requested grow would exceed the image on the growing axis, we cap
    that axis to the image size and SHRINK the other axis instead so the final
    bbox still matches target_aspect AND fits inside the image."""
    cur_w = x2 - x1
    cur_h = y2 - y1
    cur_aspect = cur_w / cur_h

    max_w = (img_w // multiple) * multiple
    max_h = (img_h // multiple) * multiple

    if cur_aspect < target_aspect:
        # bbox too tall → try to widen first
        new_w_ideal = cur_h * target_aspect
        new_w = max(cur_w, int((new_w_ideal + multiple - 1) // multiple) * multiple)
        new_h = cur_h
        if new_w > max_w:
            new_w = max_w
            new_h = max(multiple, int(new_w / target_aspect / multiple) * multiple)
            if new_h > max_h:
                new_h = max_h
                new_w = max(multiple, int(new_h * target_aspect / multiple) * multiple)
    else:
        # bbox too wide → try to grow taller first
        new_h_ideal = cur_w / target_aspect
        new_h = max(cur_h, int((new_h_ideal + multiple - 1) // multiple) * multiple)
        new_w = cur_w
        if new_h > max_h:
            new_h = max_h
            new_w = max(multiple, int(new_h * target_aspect / multiple) * multiple)
            if new_w > max_w:
                new_w = max_w
                new_h = max(multiple, int(new_w / target_aspect / multiple) * multiple)

    new_w = min(new_w, max_w)
    new_h = min(new_h, max_h)

    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    nx1 = (cx - new_w // 2) // multiple * multiple
    ny1 = (cy - new_h // 2) // multiple * multiple
    if nx1 < 0:
        nx1 = 0
    if ny1 < 0:
        ny1 = 0
    if nx1 + new_w > img_w:
        nx1 = max(0, (img_w - new_w) // multiple * multiple)
    if ny1 + new_h > img_h:
        ny1 = max(0, (img_h - new_h) // multiple * multiple)
    return nx1, ny1, nx1 + new_w, ny1 + new_h


def _crop_by_mask(
    image: torch.Tensor,
    mask: Optional[torch.Tensor],
    padding: int,
    target_pixels: int,
) -> Tuple[torch.Tensor, torch.Tensor, Tuple[int, int, int, int], Tuple[int, int]]:
    """Crop image+mask around the mask bbox and resample to the MP budget.

    Strategy:
      1. Derive raw bbox from the mask + user padding.
      2. Snap bbox to /_VAE_MULTIPLE.
      3. Pick render dims close to target_pixels with bbox-aware aspect ratio.
      4. GROW the bbox so its aspect matches the render exactly (still /multiple,
         centred on original, clamped to image). This single-axis growth is the
         key invariant: render_w/bbox_w == render_h/bbox_h, so _uncrop applies
         a single symmetric scale factor on both axes — no aspect drift, no
         asymmetric sub-pixel offset.
      5. Crop the (grown) bbox directly from the source.
      6. Resize the crop to render dims (bicubic for upscale, area for downscale).

    The fast path (no resize) triggers when render dims match bbox dims."""
    b, oh, ow, _ = image.shape

    if mask is None:
        full_mask = torch.ones(b, oh, ow, device=image.device)
        x1, y1, x2, y2 = 0, 0, ow, oh
    else:
        m = mask if mask.dim() == 3 else mask.unsqueeze(0)
        x1, y1, x2, y2 = _bbox_from_mask(m[0])
        full_mask = m

    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(ow, x2 + padding)
    y2 = min(oh, y2 + padding)

    x1, y1, x2, y2 = _expand_bbox_to_multiple(x1, y1, x2, y2, ow, oh, multiple=_VAE_MULTIPLE)

    crop_w, crop_h = x2 - x1, y2 - y1
    render_w, render_h = _pick_render_dims(crop_w, crop_h, target_pixels)
    target_aspect = render_w / render_h
    x1, y1, x2, y2 = _grow_bbox_to_aspect(x1, y1, x2, y2, target_aspect, ow, oh)
    crop_w, crop_h = x2 - x1, y2 - y1
    # If the bbox couldn't grow to the target aspect (image too small on one
    # axis), recompute the render to match the FINAL bbox aspect — the
    # invariant we need is render_aspect == bbox_aspect.
    final_aspect = crop_w / crop_h
    if abs(final_aspect - target_aspect) > 1e-6:
        render_w, render_h = _pick_render_dims(crop_w, crop_h, target_pixels)

    cropped_raw = image[:, y1:y2, x1:x2, :]
    mask_raw = full_mask[:, y1:y2, x1:x2]

    # Fast path: bbox already at render size → no resize, patch composites 1:1.
    if render_w == crop_w and render_h == crop_h:
        return cropped_raw, mask_raw, (x1, y1, x2, y2), (oh, ow)

    cropped = _resize_auto(cropped_raw, render_w, render_h)
    cm = _resize_mask(mask_raw, render_w, render_h)
    return cropped, cm, (x1, y1, x2, y2), (oh, ow)


def _uncrop(
    patch: torch.Tensor,
    background: torch.Tensor,
    crop_box: Tuple[int, int, int, int],
    original_size: Tuple[int, int],
    mask: Optional[torch.Tensor],
    feather: int,
) -> torch.Tensor:
    x1, y1, x2, y2 = crop_box
    crop_h, crop_w = y2 - y1, x2 - x1

    # Fast path: when the patch already matches the crop_box dimensions (crop
    # took the bbox 1:1 with no resample), skip the resize entirely. This is what
    # eliminates the sub-pixel "bevel" on the composite — the patch's pixel grid
    # is 1:1 with the source region.
    if patch.shape[1] == crop_h and patch.shape[2] == crop_w:
        patch_resized = patch
    else:
        patch_resized = _resize_auto(patch, crop_w, crop_h)
    bg = background.clone()

    if mask is not None:
        m = mask if mask.dim() == 3 else mask.unsqueeze(0)
        # The mask is already in background coords — slice directly and avoid a
        # second resize. Only resize if the slice shape disagrees (defensive).
        region_mask = m[:, y1:y2, x1:x2]
        if region_mask.shape[1] != crop_h or region_mask.shape[2] != crop_w:
            region_mask = _resize_mask(region_mask, crop_w, crop_h)
        if feather > 0:
            region_mask = _mask_grow(region_mask, 0, feather)
        alpha = region_mask.unsqueeze(-1)
    else:
        alpha = torch.ones(patch_resized.shape[0], crop_h, crop_w, 1,
                           device=patch_resized.device)

    bg[:, y1:y2, x1:x2, :] = patch_resized * alpha + bg[:, y1:y2, x1:x2, :] * (1.0 - alpha)
    return bg
