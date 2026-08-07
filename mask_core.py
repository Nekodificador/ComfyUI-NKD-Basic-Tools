"""GPU mask morphology — the engine behind 😺NKD Mask Ops.

Everything here takes a `[B, H, W]` (or `[B, 1, H, W]`) float mask, runs on the
accelerator, and processes the whole batch in one go. That's the point: mask
work on video is a batch of frames, and the usual implementations (core's
GrowMask, KJ's GrowMaskWithBlur, scipy `binary_fill_holes`) loop frame by frame
on the CPU with an O(expand) chain of 3×3 kernels, which is where the seconds go.

Three ideas do the heavy lifting:

* **Separable flat morphology.** A square structuring element is separable, so
  dilation by radius r is a `1×(2r+1)` max-pool followed by a `(2r+1)×1` one:
  O(4r) work per pixel instead of O(4r²). Erosion is the same pass on the
  complement, so there is exactly one primitive.
* **Geodesic reconstruction** instead of open/close for the two ops where shape
  matters. Despeckle erodes to find which blobs survive and then regrows them to
  their *original* outline, so thin protrusions of the subject are not shaved
  off; hole filling is the same reconstruction run on the complement seeded from
  the border. One primitive, two features, no scipy and no CPU round-trip.
* **Time is just another pooling axis.** Reshaped to `[1, 1, T, H·W]`, a temporal
  max or moving average is a 2-D pool with a `(2n+1, 1)` kernel — the same
  kernels, no per-frame python.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F

# Frames are processed in chunks so the padded intermediates of a big dilation
# stay bounded. 32 Mpx ≈ 128 MB per float32 buffer.
_CHUNK_PIXELS = 32 << 20
# Largest single pooling pass. Dilation by a+b == dilation by a then b for a flat
# structuring element, so a big radius is split into repeats of this.
_MAX_STEP = 32


def _work_device(x: torch.Tensor) -> torch.device:
    if x.device.type != "cpu":
        return x.device
    try:
        import comfy.model_management as mm
        return mm.get_torch_device()
    except Exception:
        return torch.device("cuda") if torch.cuda.is_available() else x.device


def _map_frames(fn, x: torch.Tensor) -> torch.Tensor:
    """Run `fn` over the batch in chunks that fit _CHUNK_PIXELS."""
    per_frame = x.shape[-1] * x.shape[-2]
    step = max(1, _CHUNK_PIXELS // max(1, per_frame))
    if x.shape[0] <= step:
        return fn(x)
    return torch.cat([fn(x[i:i + step]) for i in range(0, x.shape[0], step)], dim=0)


# ---------------------------------------------------------------------------
# Primitives — [B, 1, H, W]
# ---------------------------------------------------------------------------

def dilate(x: torch.Tensor, radius: int) -> torch.Tensor:
    """Grayscale dilation by a square of the given radius, separable."""
    if radius <= 0:
        return x

    def once(t, r):
        t = F.pad(t, (r, r, 0, 0), mode="replicate")
        t = F.max_pool2d(t, (1, 2 * r + 1), stride=1)
        t = F.pad(t, (0, 0, r, r), mode="replicate")
        return F.max_pool2d(t, (2 * r + 1, 1), stride=1)

    def run(t):
        left = radius
        while left > 0:
            step = min(left, _MAX_STEP)
            t = once(t, step)
            left -= step
        return t

    return _map_frames(run, x)


def erode(x: torch.Tensor, radius: int) -> torch.Tensor:
    if radius <= 0:
        return x
    return 1.0 - dilate(1.0 - x, radius)


def _box3(x: torch.Tensor, k: int) -> torch.Tensor:
    """Three box passes per axis at kernel `k` — a gaussian for the eye, at conv cost."""
    if k <= 1:
        return x
    pad = k // 2
    box = torch.ones(1, 1, 1, k, device=x.device, dtype=x.dtype) / k
    box_v = box.transpose(2, 3)

    def run(t):
        for kern, pads in ((box, (pad, pad, 0, 0)), (box_v, (0, 0, pad, pad))):
            for _ in range(3):
                t = F.conv2d(F.pad(t, pads, mode="replicate"), kern)
        return t.clamp(0.0, 1.0)

    return _map_frames(run, x)


def blur(x: torch.Tensor, radius: float) -> torch.Tensor:
    """Soften by `radius` pixels — continuously, including fractions of one.

    A box kernel has to be an odd number of pixels to stay centred, so the widths
    available are 1, 3, 5, … and a radius is otherwise quantized to every *second*
    pixel: 4 and 5 came out identical, and half the travel of a feather slider did
    nothing at all. Blending the two kernels either side makes the radius
    continuous, which is what lets a feather be dialled to a fraction of a pixel
    instead of snapped to the nearest odd one.

    The cost is two blurs rather than one, and only when the radius actually falls
    between two kernels — the exact odd values still take a single pass.
    """
    r = float(radius)
    if r <= 1.0:
        return x                               # a 1-px box is the identity
    lo = int(r) | 1                            # nearest odd at or below r
    if lo > r:
        lo -= 2
    t = (r - lo) / 2.0                         # kernels are 2 px apart
    if t <= 1e-6:
        return _box3(x, lo)
    a = _box3(x, lo)
    b = _box3(x, lo + 2)
    return a + (b - a) * t


def reconstruct(seed: torch.Tensor, guide: torch.Tensor, max_iter: int = 32) -> torch.Tensor:
    """Geodesic dilation of `seed` under `guide` until it stops growing.

    `seed <= guide` is assumed. Propagation has to advance one pixel at a time —
    a bigger dilation step would jump across a thin barrier in the guide, which
    is exactly the barrier the reconstruction exists to respect. One pixel per
    iteration across a 1080p frame is far too many iterations, so the work is
    done on a pyramid: the guide is coarsened with a *min* pool (a coarse cell
    counts as open only if all of it is), which makes the coarse solution a
    guaranteed subset of the true one, and each level only has to finish what
    the level below it could not resolve — normally one or two passes.
    """
    h, w = seed.shape[-2:]
    if min(h, w) > 32:
        guide_c = -F.max_pool2d(-guide, 2, 2, ceil_mode=True)
        seed_c = torch.minimum(F.max_pool2d(seed, 2, 2, ceil_mode=True), guide_c)
        coarse = F.interpolate(reconstruct(seed_c, guide_c, max_iter), size=(h, w), mode="nearest")
        seed = torch.minimum(torch.maximum(seed, coarse), guide)

    prev = -1.0
    for _ in range(max_iter):
        seed = torch.minimum(dilate(seed, 1), guide)
        total = float(seed.sum())
        if total == prev:
            break
        prev = total
    return seed


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

def levels(x: torch.Tensor, black: float, white: float) -> torch.Tensor:
    """Remap [black, white] onto [0, 1]. black >= white binarizes at black."""
    if black <= 0.0 and white >= 1.0:
        return x
    if white <= black:
        return (x >= black).to(x.dtype)
    return ((x - black) / (white - black)).clamp(0.0, 1.0)


def despeckle(x: torch.Tensor, radius: int) -> torch.Tensor:
    """Drop blobs thinner than ~2·radius, keeping the survivors' exact outline.

    Opening by reconstruction: a plain opening would round off every corner and
    eat thin protrusions of the subject (fingers, hair), which is why cleanup
    with `open` looks like it damaged the mask.
    """
    if radius <= 0:
        return x
    binary = (x > 0.5).to(x.dtype)
    keep = reconstruct(erode(binary, radius), binary)
    return x * keep


def fill_holes(x: torch.Tensor) -> torch.Tensor:
    """Fill background regions not connected to the image border.

    Soft edges are preserved: only the holes are raised to 1.
    """
    binary = (x > 0.5).to(x.dtype)
    background = 1.0 - binary
    seed = torch.zeros_like(background)
    seed[..., 0, :] = background[..., 0, :]
    seed[..., -1, :] = background[..., -1, :]
    seed[..., :, 0] = background[..., :, 0]
    seed[..., :, -1] = background[..., :, -1]
    outside = reconstruct(seed, background)
    return torch.maximum(x, background - outside)


def close_gaps(x: torch.Tensor, radius: int) -> torch.Tensor:
    """Bridge cracks and notches narrower than ~2·radius without growing the mask."""
    if radius <= 0:
        return x
    return erode(dilate(x, radius), radius)


def expand(x: torch.Tensor, amount: int) -> torch.Tensor:
    if amount > 0:
        return dilate(x, amount)
    if amount < 0:
        return erode(x, -amount)
    return x


def blockify(x: torch.Tensor, size: int, threshold: float) -> torch.Tensor:
    """Quantize the mask to a `size`×`size` grid aligned with the image origin.

    threshold 0 keeps each block's coverage as a gray value; above 0 a block is
    fully on once that fraction of it is covered. Matching `size` to the VAE
    stride (8 or 16) gives a mask that survives latent-space downsampling
    without any pixel bleeding into the neighbouring latent.
    """
    if size <= 1:
        return x
    b, _, h, w = x.shape
    pad_h = (-h) % size
    pad_w = (-w) % size
    t = F.pad(x, (0, pad_w, 0, pad_h), mode="replicate") if (pad_h or pad_w) else x
    t = F.avg_pool2d(t, size, stride=size)
    if threshold > 0.0:
        t = (t >= threshold).to(x.dtype)
    t = t.repeat_interleave(size, dim=-1).repeat_interleave(size, dim=-2)
    return t[:, :, :h, :w]


def blockify_time(x: torch.Tensor, groups: torch.Tensor) -> torch.Tensor:
    """Quantize along time to the frame groups a video VAE collapses into one
    latent. `groups[t]` is the latent index frame t lands in.

    The reduction is a max: if any frame of a group is masked, the whole group
    is. A latent that covers four frames can only be denoised as a unit, so
    covering all four is the only answer that doesn't leave part of the edit
    unpainted — the same call MaskVidExperiments makes reducing to latent space.
    """
    if x.shape[0] < 2:
        return x
    # A VAE's frame→latent mapping is monotonic, so the groups are consecutive
    # runs and a split by run length says everything (and avoids the beta
    # index_reduce, which warns on every call).
    counts = torch.bincount(groups.cpu()).tolist()
    pooled = torch.stack([seg.amax(0) for seg in torch.split(x, counts)])
    return pooled.repeat_interleave(torch.tensor(counts, device=x.device), dim=0)


def _temporal(x: torch.Tensor, frames: int, op: str) -> torch.Tensor:
    """Pool along the batch axis, treating it as time. [B,1,H,W] in and out."""
    if frames <= 0 or x.shape[0] < 2:
        return x
    k = 2 * frames + 1
    t = x.reshape(1, 1, x.shape[0], -1)
    t = F.pad(t, (0, 0, frames, frames), mode="replicate")
    t = F.max_pool2d(t, (k, 1), stride=1) if op == "max" else F.avg_pool2d(t, (k, 1), stride=1)
    return t.reshape(x.shape)


def temporal_expand(x: torch.Tensor, frames: int) -> torch.Tensor:
    """Each frame also covers what the mask covered ±frames away in time.

    The cheap fix for a segmentation that lags the subject: the mask leads the
    motion instead of trailing it, so an inpaint never has to repaint a spot the
    old mask missed by two frames.
    """
    return _temporal(x, frames, "max")


def temporal_smooth(x: torch.Tensor, frames: int) -> torch.Tensor:
    """Moving average over ±frames — kills per-frame flicker in the mask edge."""
    return _temporal(x, frames, "mean")


def latent_grid(vae, frames: int):
    """(spatial stride, frame→latent index) for a VAE, straight from its own API.

    The spatial stride is 8, 16 or 32 depending on the model. The temporal side
    is asked rather than assumed: a video VAE carries its frame-count mapping as
    a callable in `downscale_ratio`, so evaluating it per frame gives the exact
    grouping — including the uneven group at the end that a fixed "every 4
    frames" rule gets wrong. Returns (stride, None) for image VAEs.
    """
    stride = int(vae.spacial_compression_encode())
    ratio = getattr(vae, "downscale_ratio", None)
    fn = ratio[0] if isinstance(ratio, (tuple, list)) and callable(ratio[0]) else None
    if fn is None or frames < 2:
        return stride, None
    groups = torch.tensor([max(0, int(fn(t + 1)) - 1) for t in range(frames)], dtype=torch.long)
    return stride, (groups if int(groups.max()) + 1 < frames else None)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def process(mask: torch.Tensor, *, invert: bool = False,
            black_point: float = 0.0, white_point: float = 1.0,
            despeckle_px: int = 0, fill: bool = False, close_px: int = 0,
            temporal_expand_frames: int = 0, temporal_smooth_frames: int = 0,
            expand_px: int = 0, blockify_px: int = 0, blockify_threshold: float = 0.0,
            time_groups: "torch.Tensor | None" = None,
            feather_px: int = 0) -> torch.Tensor:
    """Run the whole mask pipeline in one trip to the accelerator.

    The order is fixed and deliberate: clean the source (levels → despeckle →
    fill → close) before anything is grown, stabilize over time while the mask
    is still sharp, then shape it (expand → blockify) and only soften at the
    very end, so a feathered edge is never re-hardened by a later stage.
    """
    if mask.dim() == 2:
        mask = mask.unsqueeze(0)
    src_device, src_dtype = mask.device, mask.dtype

    def run(device):
        x = mask.to(device=device, dtype=torch.float32).unsqueeze(1)
        if invert:
            x = 1.0 - x
        x = levels(x, black_point, white_point)
        x = despeckle(x, despeckle_px)
        if fill:
            x = fill_holes(x)
        x = close_gaps(x, close_px)
        x = temporal_expand(x, temporal_expand_frames)
        x = temporal_smooth(x, temporal_smooth_frames)
        x = expand(x, expand_px)
        x = blockify(x, blockify_px, blockify_threshold)
        if time_groups is not None:
            x = blockify_time(x, time_groups)
        x = blur(x, feather_px)
        return x.squeeze(1).clamp(0.0, 1.0)

    device = _work_device(mask)
    try:
        out = run(device)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        out = run(torch.device("cpu"))
    return out.to(device=src_device, dtype=src_dtype)
