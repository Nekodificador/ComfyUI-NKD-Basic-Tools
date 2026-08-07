"""Geometry → pixels for the spline nodes: Vector Mask, Path Blur, Field Blur.

Sibling of `mask_core`, same contract: torch in, torch out, batch stays on the
accelerator. Three ideas carry the three nodes:

* **No spline math lives here.** The editor flattens every curve — Bezier or
  B-spline — to a dense polyline before it serialises, so Python only ever sees
  points. That is what keeps two curve types from costing two evaluators in two
  languages plus the parity fixtures to keep them honest (see the Sigmas Curve
  pack for what the alternative looks like).
* **Scattered values become dense fields two different ways, on purpose.**
  A handful of pins (Field Blur) is cheapest as a closed-form inverse-distance
  weighting: every pixel against every pin is one broadcast. Thousands of
  polyline samples (Path Blur) is not — that becomes a splat into value and
  weight buffers, blurred and divided (normalized convolution), which costs the
  same no matter how many strokes are drawn.
* **A variable-radius blur is a pyramid, not a loop.** Blurring each pixel by
  its own radius has no separable form, so instead a handful of fixed-radius
  blurs are computed once and each pixel picks its place between two of them.
  Tent weights over the levels sum to 1, so it neither brightens nor darkens.
"""
from __future__ import annotations

import json

import numpy as np
import torch
import torch.nn.functional as F

try:
    from . import mask_core                      # ComfyUI (package)
except ImportError:  # pragma: no cover - standalone tests (sys.path)
    import mask_core

# Coverage is computed by filling a binary polygon at N× and box-downsampling it;
# the average over each output pixel's block *is* its antialiased coverage. 4× at
# up to 4 Mpx keeps the biggest intermediate at 64 Mpx (64 MB as uint8).
_SUPERSAMPLE = 4
_SUPERSAMPLE_LARGE = 2
_SUPERSAMPLE_CUTOFF = 4 << 20

# Coarser levels of the flow field's normalized convolution, and how much less
# each one counts than the level above it. The last one is a single cell — the
# global mean — and it is not optional: at 4×4 a corner cell can still contain
# no samples at all, and then the direction there is 0/0.
_PYRAMID = (64, 16, 4, 1)
_LEVEL_FALLOFF = 1e-2


# ---------------------------------------------------------------------------
# Rasterizing polylines
# ---------------------------------------------------------------------------

def parse_items(payload: str, key: str) -> list:
    """Tolerant read of the editor's JSON widget → the list under `key`.

    Never raises. A widget value that has been hand-edited into nonsense should
    render as "nothing drawn", not fail the graph half an hour into a batch.
    """
    if not payload:
        return []
    try:
        data = json.loads(payload)
    except Exception:
        return []
    items = data.get(key) if isinstance(data, dict) else data
    return items if isinstance(items, list) else []


def poly_to_px(poly, width: int, height: int, scale: int = 1) -> np.ndarray:
    """Normalized 0..1 polyline → (K, 2) float pixel coords. y is down."""
    a = np.asarray(poly, dtype=np.float64).reshape(-1, 2)
    return a * np.array([width * scale, height * scale], dtype=np.float64)


def rasterize(shapes, width: int, height: int) -> torch.Tensor:
    """Composite a list of closed shapes into one [H, W] coverage mask on CPU.

    Each shape is `{poly, op, feather}`. `add` takes the max with what is already
    there, `sub` cuts it out — holes are made with a `sub` shape rather than a
    winding rule, which is both better to work with and avoids depending on how
    PIL's scanline fill treats a self-intersecting polygon.

    Feather is per shape and applied *before* compositing, which is the whole
    point of `sub`: a soft cut-out is impossible if softening only happens once
    at the end.
    """
    from PIL import Image, ImageDraw  # ships with ComfyUI core

    acc = torch.zeros(height, width, dtype=torch.float32)
    ss = _SUPERSAMPLE if width * height <= _SUPERSAMPLE_CUTOFF else _SUPERSAMPLE_LARGE

    for shape in shapes:
        poly = shape.get("poly") or []
        if len(poly) < 3:
            continue  # a polygon needs area; PIL raises on fewer than 3 points
        pts = poly_to_px(poly, width, height, ss)
        im = Image.new("L", (width * ss, height * ss), 0)
        ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
        cov = torch.from_numpy(
            np.array(im.resize((width, height), Image.BOX), dtype=np.uint8)
        ).float().div_(255.0)

        feather = int(shape.get("feather") or 0)
        if feather > 0:
            cov = mask_core.blur(cov[None, None], feather)[0, 0]

        if str(shape.get("op", "add")) == "sub":
            acc = torch.minimum(acc, 1.0 - cov)
        else:
            acc = torch.maximum(acc, cov)

    return acc


# ---------------------------------------------------------------------------
# Scattered values → dense fields
# ---------------------------------------------------------------------------

def splat_field(xy: torch.Tensor, vals: torch.Tensor, height: int, width: int) -> torch.Tensor:
    """Bilinear scatter-add of `vals` at float pixel positions `xy`.

    Returns [C+1, H, W]: the accumulated values followed by the accumulated
    weight. Dividing the first by the last gives a weighted average wherever
    anything landed — the numerator of a normalized convolution.
    """
    xy = xy.to(torch.float32)
    vals = vals.to(torch.float32).reshape(xy.shape[0], -1)
    out = torch.zeros(vals.shape[1] + 1, height * width, device=xy.device, dtype=torch.float32)

    x0 = xy[:, 0].floor()
    y0 = xy[:, 1].floor()
    fx = xy[:, 0] - x0
    fy = xy[:, 1] - y0
    x0 = x0.long()
    y0 = y0.long()

    for dy in (0, 1):
        for dx in (0, 1):
            w = (fx if dx else 1.0 - fx) * (fy if dy else 1.0 - fy)
            xi = (x0 + dx).clamp(0, width - 1)
            yi = (y0 + dy).clamp(0, height - 1)
            src = torch.cat([vals * w[:, None], w[:, None]], dim=1).t().contiguous()
            out.index_add_(1, yi * width + xi, src)

    return out.reshape(-1, height, width)


def idw_field(pins: torch.Tensor, vals: torch.Tensor, height: int, width: int,
              power: float = 2.0) -> torch.Tensor:
    """Inverse-distance weighting of a few scattered values over a grid.

    `pins` is (P, 2) normalized 0..1, `vals` is (P,). Closed form, no
    triangulation, no boundary to extrapolate past — with P in the tens this is
    one broadcast of P distances per pixel and it degenerates correctly at
    P == 1 (a constant field).
    """
    dev = pins.device
    gy, gx = torch.meshgrid(
        torch.linspace(0.0, 1.0, height, device=dev),
        torch.linspace(0.0, 1.0, width, device=dev),
        indexing="ij",
    )
    d2 = (gx[..., None] - pins[:, 0]) ** 2 + (gy[..., None] - pins[:, 1]) ** 2 + 1e-9
    w = d2.pow(-power / 2.0)
    return (w * vals).sum(-1) / w.sum(-1)


# ---------------------------------------------------------------------------
# Blurs
# ---------------------------------------------------------------------------

def img_blur(x: torch.Tensor, radius: int) -> torch.Tensor:
    """Three box passes per axis on a [B, C, H, W] image — `mask_core.blur`'s twin.

    The difference that matters: no clamp to [0, 1]. The mask version ends on
    one, so running it over an image quietly crushes anything out of range.
    """
    if radius <= 0:
        return x
    c = x.shape[1]
    k = int(radius) | 1
    pad = k // 2
    box = torch.ones(c, 1, 1, k, device=x.device, dtype=x.dtype) / k
    box_v = box.transpose(2, 3).contiguous()

    def run(t):
        for kern, pads in ((box, (pad, pad, 0, 0)), (box_v, (0, 0, pad, pad))):
            for _ in range(3):
                t = F.conv2d(F.pad(t, pads, mode="replicate"), kern, groups=c)
        return t

    return mask_core._map_frames(run, x)


def pyramid_blur_lerp(img: torch.Tensor, radius_px: torch.Tensor,
                      levels: int = 6, base: float = 2.0) -> torch.Tensor:
    """Blur every pixel by its own radius, via a few fixed blurs and a lerp.

    Level k is a blur of radius `base·(2^k - 1)`, so level 0 is the untouched
    image and a radius of 0 costs nothing. Each pixel lands between two levels
    and takes tent weights that sum to 1. Levels no pixel reaches are skipped, so
    a gentle field never pays for the wide blurs.

    ponytail: this is a variable *gaussian*, not bokeh — no iris shape, no
    highlight bloom. Upgrade path is a per-pixel-radius box blur off a summed-area
    table (exact radius, O(1) per pixel), but float32 cumsum over a few Mpx loses
    too much precision to do naively. Not until someone complains.
    """
    lvl = torch.log2(radius_px.clamp(min=0.0) / base + 1.0).clamp(0.0, levels - 1)
    out = torch.zeros_like(img)
    for k in range(levels):
        w = (1.0 - (lvl - k).abs()).clamp(0.0, 1.0)
        if float(w.max()) <= 0.0:
            continue
        level = img if k == 0 else img_blur(img, int(round(base * (2 ** k - 1))))
        out = out + level * w
    return out


def path_samples(paths, width: int, height: int):
    """Strokes → (K,2) pixel positions and (K,3) [dir_x, dir_y, speed] values.

    Resampled to about one sample per pixel of arc length, which is what makes
    the splatted weight a density `flow_field`'s confidence term can calibrate
    against without a tuned constant.
    """
    pos, val = [], []
    for p in paths:
        poly = np.asarray(p.get("poly") or [], dtype=np.float64).reshape(-1, 2)
        if len(poly) < 2:
            continue
        speed = abs(float(p.get("speed", 1.0)))
        if speed <= 0.0:
            continue
        pts = poly * np.array([width, height], dtype=np.float64)
        seg = np.hypot(*np.diff(pts, axis=0).T)
        total = float(seg.sum())
        if total < 1.0:
            continue
        t = np.linspace(0.0, total, int(total) + 1)
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        xy = np.stack([np.interp(t, cum, pts[:, 0]), np.interp(t, cum, pts[:, 1])], axis=1)
        d = np.gradient(xy, axis=0)
        d /= (np.hypot(d[:, 0], d[:, 1]) + 1e-9)[:, None]
        pos.append(xy)
        val.append(np.concatenate([d * speed, np.full((len(xy), 1), speed)], axis=1))
    if not pos:
        return None, None
    return np.concatenate(pos), np.concatenate(val)


def flow_field(paths, height: int, width: int, spread: float, device=None):
    """Strokes → (direction [1,2,H,W], speed [1,1,H,W], confidence [1,1,H,W]).

    Normalized convolution over a pyramid. The pyramid is not an optimization:
    a single blur leaves the weight at essentially zero far from every stroke,
    and dividing by that turns the direction into amplified noise. Each coarser
    level counts `_LEVEL_FALLOFF` times less than the one above, so it only
    speaks where the finer levels have nothing to say.

    Confidence is the fine weight measured against its median value *on the
    strokes*. Without it the direction field is unit length everywhere and the
    whole frame smears, including the parts nobody drew near.
    """
    pos, val = path_samples(paths, width, height)
    if pos is None:
        return None
    device = device or torch.device("cpu")

    splat = splat_field(torch.from_numpy(pos).to(device),
                        torch.from_numpy(val).to(device), height, width)
    num = splat[:3][None]                                    # dir·speed, speed
    den = splat[3:][None]                                    # sample density

    radius = max(3, int(spread * max(height, width)))
    fine_n, fine_d = img_blur(num, radius), img_blur(den, radius)

    acc_n, acc_d, k = fine_n, fine_d, _LEVEL_FALLOFF
    up = dict(size=(height, width), mode="bilinear", align_corners=False)
    for size in _PYRAMID:
        if size >= min(height, width):
            continue
        r = max(1, size // 8)
        cn = img_blur(F.adaptive_avg_pool2d(num, size), r)
        cd = img_blur(F.adaptive_avg_pool2d(den, size), r)
        acc_n = acc_n + F.interpolate(cn, **up) * k
        acc_d = acc_d + F.interpolate(cd, **up) * k
        k *= _LEVEL_FALLOFF

    field = acc_n / (acc_d + 1e-12)
    vec = field[:, :2]
    direction = vec / (vec.norm(dim=1, keepdim=True) + 1e-9)
    speed = field[:, 2:3].clamp(min=0.0)

    yi = torch.from_numpy(pos[:, 1]).to(device).round().long().clamp(0, height - 1)
    xi = torch.from_numpy(pos[:, 0]).to(device).round().long().clamp(0, width - 1)
    ref = fine_d[0, 0][yi, xi].median()
    conf = (fine_d / (ref + 1e-12)).clamp(0.0, 1.0)
    conf = conf * conf * (3.0 - 2.0 * conf)                  # smoothstep

    return direction, speed, conf


def line_blur(img: torch.Tensor, flow_px: torch.Tensor, taps: int) -> torch.Tensor:
    """Average `taps` samples of `img` swept along `flow_px` — the motion blur.

    `flow_px` is [B, 2, H, W], the *total* displacement in pixels; samples are
    centred on the pixel (±half the vector). Cost is one full-frame bilinear
    gather per tap, and only one accumulator is ever held.
    """
    b, c, h, w = img.shape
    dev, dt = img.device, img.dtype
    yy, xx = torch.meshgrid(
        torch.linspace(-1.0, 1.0, h, device=dev, dtype=dt),
        torch.linspace(-1.0, 1.0, w, device=dev, dtype=dt),
        indexing="ij",
    )
    base = torch.stack((xx, yy), dim=-1)[None]                       # [1,H,W,2]
    scale = torch.tensor([2.0 / max(w - 1, 1), 2.0 / max(h - 1, 1)], device=dev, dtype=dt)
    flow = flow_px.permute(0, 2, 3, 1) * scale                       # [B,H,W,2]

    taps = max(1, int(taps))
    if taps == 1:
        return img
    acc = torch.zeros_like(img)
    for k in range(taps):
        t = k / (taps - 1) - 0.5
        acc += F.grid_sample(img, base + t * flow, mode="bilinear",
                             padding_mode="border", align_corners=True)
    return acc / taps
