from __future__ import annotations
from typing import Optional, Tuple
import numpy as np
import torch
import torch.nn.functional as F


def _probe(module_name: str) -> bool:
    import importlib.util
    return importlib.util.find_spec(module_name) is not None


_HAS_CV2 = _probe("cv2")


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
    if expand <= 0 and blur <= 0:
        return mask.float()

    # ComfyUI hands masks over on CPU; morphology + separable blur at native
    # resolution there takes seconds on large images. Hop to the GPU for the
    # heavy passes and return on the original device.
    orig_device = mask.device
    work_device = orig_device
    if orig_device.type == "cpu" and torch.cuda.is_available():
        work_device = torch.device("cuda")

    m = mask.to(work_device).unsqueeze(1).float()

    if expand > 0:
        # Chunked max-pool dilation: ~log(expand) passes instead of `expand`
        # iterations of a 3×3 kernel. Square structuring element either way.
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
        box = torch.ones(1, 1, 1, k, device=m.device, dtype=m.dtype) / k
        for _ in range(3):
            m = F.pad(m, (pad, pad, 0, 0), mode="replicate")
            m = F.conv2d(m, box, padding=0)
        box_v = box.transpose(2, 3)
        for _ in range(3):
            m = F.pad(m, (0, 0, pad, pad), mode="replicate")
            m = F.conv2d(m, box_v, padding=0)
        m = m.clamp(0.0, 1.0)

    return m.squeeze(1).to(orig_device)


def _separate_regions(mask: torch.Tensor, min_area_frac: float, max_regions: int,
                      order: str) -> list:
    """Split a mask into individual region masks for chained detailing.

    mask [B, H, W]: B > 1 is treated as pre-separated regions (e.g. the
    per-object batch from NKD Segment Map); B == 1 is split by 8-connected
    components. Soft values are preserved within each component. Regions
    smaller than min_area_frac (fraction of image area) are dropped; the rest
    are sorted by `order` and capped at max_regions."""
    if mask.shape[0] > 1:
        comps = [mask[i] for i in range(mask.shape[0])]
    else:
        from scipy.ndimage import label  # ships with ComfyUI core
        binary = (mask[0] > 0.5).cpu().numpy()
        labeled, n = label(binary, structure=np.ones((3, 3)))
        comps = []
        for i in range(1, n + 1):
            comp = torch.from_numpy(labeled == i).to(mask.device)
            comps.append(mask[0] * comp)

    h, w = mask.shape[1], mask.shape[2]
    min_px = max(1.0, min_area_frac * h * w)
    stats = []
    for c in comps:
        binary = c > 0.5
        area = int(binary.sum().item())
        if area < min_px:
            continue
        ys, xs = torch.nonzero(binary, as_tuple=True)
        stats.append((c, area, float(xs.float().mean()), float(ys.float().mean())))
    if not stats:
        return []
    if order == "Left to Right":
        stats.sort(key=lambda s: s[2])
    elif order == "Top to Bottom":
        stats.sort(key=lambda s: s[3])
    else:  # Largest First
        stats.sort(key=lambda s: -s[1])
    return [s[0] for s in stats[:max_regions]]


def _mask_fill_holes(mask: torch.Tensor) -> torch.Tensor:
    """Fill fully-enclosed holes in the mask (regions of 0 not connected to the
    border). Soft edge values are preserved — only the holes are set to 1."""
    from scipy.ndimage import binary_fill_holes  # ships with ComfyUI core
    if mask.dim() == 2:
        mask = mask.unsqueeze(0)
    binary = (mask > 0.5).cpu().numpy()
    out = mask.clone()
    for i in range(binary.shape[0]):
        filled = torch.from_numpy(binary_fill_holes(binary[i])).to(mask.device)
        out[i] = torch.maximum(out[i], filled.to(out.dtype))
    return out


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


def _pick_render_dims_longest(
    bbox_w: int, bbox_h: int, longest: int, multiple: int = _VAE_MULTIPLE,
) -> Tuple[int, int]:
    """Pick (render_w, render_h), both /multiple, where the longest side equals
    `longest` (snapped to /multiple) and the aspect follows the bbox. Same
    contract as _pick_render_dims: the caller grows the bbox to the render's
    exact aspect afterwards."""
    if bbox_w <= 0 or bbox_h <= 0:
        return multiple, multiple
    L = max(multiple, int(round(longest / multiple)) * multiple)
    if bbox_w >= bbox_h:
        render_w = L
        render_h = max(multiple, int(round(L * bbox_h / bbox_w / multiple)) * multiple)
    else:
        render_h = L
        render_w = max(multiple, int(round(L * bbox_w / bbox_h / multiple)) * multiple)
    return render_w, render_h


def _pick_render_dims_auto(
    bbox_w: int, bbox_h: int, min_side: int, max_side: int,
    multiple: int = _VAE_MULTIPLE,
) -> Tuple[int, int]:
    """Only rescale when needed: native 1:1 while the bbox fits inside
    [min_side, max_side]; upscale the short side to min_side or downscale the
    long side to max_side otherwise. Extreme aspect ratios are capped to
    max×min (the caller grows the bbox to match, adding context)."""
    if bbox_w <= 0 or bbox_h <= 0:
        return multiple, multiple
    lo = max(multiple, int(round(min_side / multiple)) * multiple)
    hi = max(lo, int(round(max_side / multiple)) * multiple)

    aspect = bbox_w / bbox_h
    limit = hi / lo
    if aspect > limit:
        return hi, lo
    if aspect < 1.0 / limit:
        return lo, hi

    short, long = min(bbox_w, bbox_h), max(bbox_w, bbox_h)
    if short >= lo and long <= hi:
        return bbox_w, bbox_h  # native — no resample
    scale = (lo / short) if short < lo else (hi / long)
    render_w = max(multiple, int(round(bbox_w * scale / multiple)) * multiple)
    render_h = max(multiple, int(round(bbox_h * scale / multiple)) * multiple)
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

    # Placement: only the SIZE needs grid alignment (the VAE cares about the
    # crop dimensions, not its offset). Free offsets let the box hug the image
    # edges exactly on non-aligned image sizes, and containment comes first:
    # cover the original bbox, centre the leftover, clamp to bounds.
    def _place(a1: int, a2: int, size: int, limit: int) -> int:
        p = (a1 + a2) // 2 - size // 2
        p = min(p, a1)          # cover the bbox start
        p = max(p, a2 - size)   # cover the bbox end (wins when size < bbox)
        return max(0, min(p, limit - size))

    nx1 = _place(x1, x2, new_w, img_w)
    ny1 = _place(y1, y2, new_h, img_h)
    return nx1, ny1, nx1 + new_w, ny1 + new_h


def _crop_by_mask(
    image: torch.Tensor,
    mask: Optional[torch.Tensor],
    padding: int,
    target_pixels: int,
    longest_side: int = 0,
    min_side: int = 0,
    max_side: int = 0,
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

    # Native mode: no resample at all — the bbox is taken 1:1 (already /multiple),
    # guaranteeing the composite fast path (pixel-perfect restore).
    if target_pixels <= 0 and longest_side <= 0 and max_side <= 0:
        return image[:, y1:y2, x1:x2, :], full_mask[:, y1:y2, x1:x2], (x1, y1, x2, y2), (oh, ow)

    def _render_dims(bw: int, bh: int) -> Tuple[int, int]:
        if max_side > 0:
            return _pick_render_dims_auto(bw, bh, min_side, max_side)
        if longest_side > 0:
            return _pick_render_dims_longest(bw, bh, longest_side)
        return _pick_render_dims(bw, bh, target_pixels)

    crop_w, crop_h = x2 - x1, y2 - y1
    render_w, render_h = _render_dims(crop_w, crop_h)
    target_aspect = render_w / render_h
    x1, y1, x2, y2 = _grow_bbox_to_aspect(x1, y1, x2, y2, target_aspect, ow, oh)
    crop_w, crop_h = x2 - x1, y2 - y1
    # If the bbox couldn't grow to the target aspect (image too small on one
    # axis), recompute the render to match the FINAL bbox aspect — the
    # invariant we need is render_aspect == bbox_aspect.
    final_aspect = crop_w / crop_h
    if abs(final_aspect - target_aspect) > 1e-6:
        render_w, render_h = _render_dims(crop_w, crop_h)

    cropped_raw = image[:, y1:y2, x1:x2, :]
    mask_raw = full_mask[:, y1:y2, x1:x2]

    # Fast path: bbox already at render size → no resize, patch composites 1:1.
    if render_w == crop_w and render_h == crop_h:
        return cropped_raw, mask_raw, (x1, y1, x2, y2), (oh, ow)

    cropped = _resize_auto(cropped_raw, render_w, render_h)
    cm = _resize_mask(mask_raw, render_w, render_h)
    return cropped, cm, (x1, y1, x2, y2), (oh, ow)


def _box_preview(image: torch.Tensor, mask: Optional[torch.Tensor],
                 boxes, max_side: int = 768) -> torch.Tensor:
    """Render an in-node preview: original with the mask tinted in the NKD
    accent color, everything outside the crop box(es) dimmed, and each box
    outlined. First batch item only, downscaled to keep the payload small."""
    if isinstance(boxes, tuple):
        boxes = [boxes]
    img = image[:1, :, :, :3].clone()
    _, h, w, _ = img.shape
    accent = torch.tensor([0.29, 0.706, 1.0], device=img.device, dtype=img.dtype)

    if mask is not None:
        m = mask if mask.dim() == 3 else mask.unsqueeze(0)
        a = (m[0].to(img.device, img.dtype).clamp(0, 1) * 0.85).unsqueeze(-1)
        img[0] = img[0] * (1.0 - a) + accent * a

    dim = torch.full((h, w, 1), 0.45, device=img.device, dtype=img.dtype)
    for x1, y1, x2, y2 in boxes:
        dim[y1:y2, x1:x2] = 1.0
    img[0] = img[0] * dim

    t = max(2, min(h, w) // 300)
    for x1, y1, x2, y2 in boxes:
        img[0, y1:min(y1 + t, h), x1:x2] = accent
        img[0, max(y2 - t, 0):y2, x1:x2] = accent
        img[0, y1:y2, x1:min(x1 + t, w)] = accent
        img[0, y1:y2, max(x2 - t, 0):x2] = accent

    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        img = _resize_auto(img, max(1, int(w * scale)), max(1, int(h * scale)))
    return img


def _alpha_hardness(alpha: torch.Tensor, hardness: float) -> torch.Tensor:
    """Histogram remap on the alpha (LayerStyle-style black/white point):
    raises the black point and lowers the white point symmetrically, collapsing
    the low-alpha fringe where the original background bleeds through as a halo.
    0 = identity, 1 = hard cut at 0.5."""
    if hardness <= 0.0:
        return alpha
    bp = min(hardness * 0.5, 0.499)
    wp = 1.0 - bp
    return ((alpha - bp) / (wp - bp)).clamp(0.0, 1.0)


def _uncrop(
    patch: torch.Tensor,
    background: torch.Tensor,
    crop_box: Tuple[int, int, int, int],
    original_size: Tuple[int, int],
    mask: Optional[torch.Tensor],
    feather: int,
    hardness: float = 0.0,
) -> Tuple[torch.Tensor, torch.Tensor]:
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
        # The mask can arrive already region-sized (chained detail bundles) or
        # in background coords — slice only in the latter case, and resize only
        # if the shapes still disagree (defensive).
        if m.shape[1] == crop_h and m.shape[2] == crop_w:
            region_mask = m
        else:
            region_mask = m[:, y1:y2, x1:x2]
            if region_mask.shape[1] != crop_h or region_mask.shape[2] != crop_w:
                region_mask = _resize_mask(region_mask, crop_w, crop_h)
        if feather > 0:
            region_mask = _mask_grow(region_mask, 0, feather)
        region_mask = _alpha_hardness(region_mask, hardness)
        alpha = region_mask.unsqueeze(-1)
    else:
        region_mask = torch.ones(patch_resized.shape[0], crop_h, crop_w,
                                 device=patch_resized.device)
        alpha = region_mask.unsqueeze(-1)

    bg[:, y1:y2, x1:x2, :] = patch_resized * alpha + bg[:, y1:y2, x1:x2, :] * (1.0 - alpha)
    return bg, region_mask


# ---------------------------------------------------------------------------
# Post blend — color match (Reinhard, LAB) + optional Poisson seamless clone.
# Ported from NKD Klein Postsampling. LAB conversion stays in float32 numpy
# (cv2's COLOR_RGB2LAB rounds through uint8 and loses precision).
# ---------------------------------------------------------------------------

def _rgb_to_lab(rgb):
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ], dtype=np.float32)
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    delta = (6.0 / 29.0)
    delta3 = delta ** 3

    def f(t):
        return np.where(t > delta3, np.cbrt(t), t / (3.0 * delta * delta) + 4.0 / 29.0)

    fx, fy, fz = f(xyz[..., 0]), f(xyz[..., 1]), f(xyz[..., 2])
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=-1).astype(np.float32)


def _lab_to_rgb(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16.0) / 116.0
    fx = a / 500.0 + fy
    fz = fy - b / 200.0
    delta = 6.0 / 29.0

    def f_inv(t):
        return np.where(t > delta, t ** 3, 3.0 * delta * delta * (t - 4.0 / 29.0))

    xyz = np.stack([
        f_inv(fx) * 0.95047,
        f_inv(fy) * 1.0,
        f_inv(fz) * 1.08883,
    ], axis=-1)
    M_inv = np.array([
        [3.2404542, -1.5371385, -0.4985314],
        [-0.9692660, 1.8760108, 0.0415560],
        [0.0556434, -0.2040259, 1.0572252],
    ], dtype=np.float32)
    lin = np.clip(xyz @ M_inv.T, 0.0, None)
    rgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * (lin ** (1.0 / 2.4)) - 0.055)
    return np.clip(rgb, 0.0, 1.0).astype(np.float32)


def _reinhard_match(orig_rgb, gen_rgb, mask, strength):
    """Match gen's color statistics to orig using only background pixels.
    Returns gen unchanged when the background is too small to be reliable —
    matching on the edit region itself would just propagate the shift."""
    if strength <= 0.0:
        return gen_rgb
    bg = mask < 0.05
    if bg.sum() < 100:
        return gen_rgb
    orig_lab = _rgb_to_lab(orig_rgb)
    gen_lab = _rgb_to_lab(gen_rgb)
    o_mean = orig_lab[bg].mean(axis=0)
    o_std = orig_lab[bg].std(axis=0) + 1e-5
    g_mean = gen_lab[bg].mean(axis=0)
    g_std = gen_lab[bg].std(axis=0) + 1e-5
    matched = (gen_lab - g_mean) / g_std * o_std + o_mean
    matched_rgb = _lab_to_rgb(matched)
    blended = matched_rgb * strength + gen_rgb * (1.0 - strength)
    return np.clip(blended, 0.0, 1.0)


def _seamless_clone(orig_rgb, gen_rgb, mask):
    """Poisson blend gen onto orig inside `mask`. The clamped-edge guard on the
    binary mask prevents the OpenCV crash you get when the mask touches the
    image boundary, and the bounding-rect centre matches what seamlessClone
    computes internally — using numpy min/max instead shifts the result by 1px."""
    import cv2
    o_u8 = (np.clip(orig_rgb, 0, 1) * 255).astype(np.uint8)
    g_u8 = (np.clip(gen_rgb, 0, 1) * 255).astype(np.uint8)
    binary = (mask > 0.1).astype(np.uint8) * 255
    binary[0, :] = 0; binary[-1, :] = 0
    binary[:, 0] = 0; binary[:, -1] = 0
    m3 = mask[..., np.newaxis]
    x, y, w, h = cv2.boundingRect(binary)
    if w == 0 or h == 0:
        return np.clip(orig_rgb * (1.0 - m3) + gen_rgb * m3, 0, 1)
    center = (x + w // 2, y + h // 2)
    try:
        cloned = cv2.seamlessClone(g_u8, o_u8, binary, center, cv2.NORMAL_CLONE)
        cloned = cloned.astype(np.float32) / 255.0
        return np.clip(orig_rgb * (1.0 - m3) + cloned * m3, 0, 1)
    except Exception:
        return np.clip(orig_rgb * (1.0 - m3) + gen_rgb * m3, 0, 1)


def _post_blend(orig: torch.Tensor, composite: torch.Tensor, mask: torch.Tensor,
                match_strength: float, seamless: bool) -> torch.Tensor:
    """Re-blend composite over orig with Reinhard color match + optional Poisson.
    `mask` is the full-res alpha [B, H, W]. Per-item loop: cv2/numpy domain.
    An empty mask returns the composite unchanged so seamlessClone never hits a
    zero rect."""
    out = composite.clone()
    for i in range(composite.shape[0]):
        m = mask[min(i, mask.shape[0] - 1)].detach().clamp(0, 1).cpu().numpy().astype(np.float32)
        if m.sum() < 1:
            continue
        o = orig[min(i, orig.shape[0] - 1), :, :, :3].detach().clamp(0, 1).cpu().numpy().astype(np.float32)
        c = composite[i, :, :, :3].detach().clamp(0, 1).cpu().numpy().astype(np.float32)
        matched = _reinhard_match(o, c, m, match_strength)
        if seamless:
            res = _seamless_clone(o, matched, m)
        else:
            m3 = m[..., np.newaxis]
            res = np.clip(o * (1.0 - m3) + matched * m3, 0, 1)
        out[i, :, :, :3] = torch.from_numpy(np.ascontiguousarray(res)).to(
            device=composite.device, dtype=composite.dtype)
    return out
