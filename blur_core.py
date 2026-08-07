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

# Per-point feather is drawn as a stack of nested outlines (see `_fill_coverage`).
# One ring per pixel of feather, so the gradient never has two levels sharing a
# pixel and there is nothing to band; the ceiling is where a very soft edge stops
# paying for more. Nested rings cost one polygon fill each and no buffer, so 64
# of them run in about the time one did — the count is chosen for how it looks,
# not for what it costs. Mirrored in `splineEditor.rampRings`.
_RAMP_PX_PER_RING = 1
_RAMP_MIN_RINGS, _RAMP_MAX_RINGS = 2, 64

# A pin's reach is stored as a radius; the weighting wants it relative to the
# neutral one, so a field of default pins matches what it rendered before pins
# had a reach at all. Mirrored in `splineEditor.DEFAULT_INFLUENCE`.
NEUTRAL_REACH = 0.25


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


def poly_to_px(poly, width: int, height: int) -> np.ndarray:
    """Normalized 0..1 polyline → (K, 2) float pixel coords. y is down.

    Output pixels, never supersampled ones: per-point feather is a distance in
    output pixels, so the offsetting has to happen in that space and the
    supersample factor is applied last, at the fill.
    """
    a = np.asarray(poly, dtype=np.float64).reshape(-1, 2)
    return a * np.array([width, height], dtype=np.float64)


def ramp_rings(max_px: float) -> int:
    """How many nested outlines a feather that wide needs. Twin of `rampRings`."""
    return int(max(_RAMP_MIN_RINGS,
                   min(_RAMP_MAX_RINGS, round(float(max_px) / _RAMP_PX_PER_RING))))


def ramp_offsets(rings: int) -> np.ndarray:
    """Where to place the nested outlines. Twin of `rampOffsets` in splineEval.ts.

    Evenly spaced rings give a coverage of 1 - q: correct, and ugly. That profile
    has a corner in its slope at both ends, so the eye reads a hard line where
    the softness starts and another where it stops — the softening shows up
    precisely as an edge, which is the one thing it exists to remove.

    Coverage is the fraction of rings outside a point, so the profile is decided
    by where the rings go: place them at the inverse of the profile wanted.
    smoothstep⁻¹ has a closed form, so a smooth falloff costs nothing over a
    straight one.
    """
    x = (np.arange(rings, dtype=np.float64) + 0.5) / rings
    return 0.5 - np.sin(np.arcsin(1.0 - 2.0 * x) / 3.0)


def _area(poly: np.ndarray) -> float:
    """Unsigned shoelace area — only used to tell the two ends of a ring stack apart."""
    nxt = np.roll(poly, -1, axis=0)
    return abs(float(np.sum(poly[:, 0] * nxt[:, 1] - nxt[:, 0] * poly[:, 1]))) / 2.0


def _fill_coverage(rings, width: int, height: int, ss: int) -> torch.Tensor:
    """Mean coverage of a stack of nested polygons, rasterized `ss`× and boxed down.

    One ring is a plain antialiased fill. Several are a gradient: a pixel inside
    j of them has coverage j/K, and `ramp_offsets` chose where they sit so that
    works out to a smoothstep across the band.

    The rings are nested — each one is the outline pushed further along the same
    offsets — so the smallest ring containing a pixel already determines its
    count, and painting them largest-first with an increasing level writes the
    whole gradient in a single buffer. No per-ring image, no accumulation, no
    rounding, and a soft edge costs one polygon fill per ring instead of a fill
    plus a full-resolution resize.

    Which end is largest depends on where the clones were dragged: outward for
    the usual soft edge, inward if they were pulled inside the shape, which
    softens inward instead. Sweeping from whichever end encloses more area
    covers both without the caller having to care.
    """
    from PIL import Image, ImageDraw  # ships with ComfyUI core

    k = len(rings)
    im = Image.new("L", (width * ss, height * ss), 0)
    draw = ImageDraw.Draw(im)
    order = range(k - 1, -1, -1) if _area(rings[-1]) >= _area(rings[0]) else range(k)
    for level, j in enumerate(order, start=1):
        draw.polygon([tuple(p) for p in rings[j] * ss], fill=level)
    # The box downsample and the /K in one pass, in float32 rather than through
    # a uint8 resize — the levels are what the gradient is made of.
    cov = np.asarray(im).reshape(height, ss, width, ss).sum(axis=(1, 3), dtype=np.float32)
    return torch.from_numpy(cov).div_(float(ss * ss * k))


def _shape_rings(shape, poly_px: np.ndarray) -> list:
    """The shape's outline, plus the softened rings its per-point feather asks for.

    `fo` is the per-vertex feather offset in output pixels — a vector, because
    the editor's feather is a clone of the point placed by hand rather than a
    width pushed out along the normal. The editor resolves it from the control
    points onto every vertex of the polyline, so all that happens here is adding
    it: no normals, no winding, no miter, and no geometry written in two
    languages that could drift apart.
    """
    fo = shape.get("fo")
    if not fo or len(fo) != len(poly_px):
        return [poly_px]
    delta = np.asarray(fo, dtype=np.float64).reshape(-1, 2)
    reach = float(np.hypot(delta[:, 0], delta[:, 1]).max())
    if reach <= 0.0:
        return [poly_px]
    return [poly_px + delta * t for t in ramp_offsets(ramp_rings(reach))]


def rasterize(shapes, width: int, height: int) -> torch.Tensor:
    """Composite a list of closed shapes into one [H, W] coverage mask on CPU.

    Each shape is `{poly, op, feather}`. `add` takes the max with what is already
    there, `sub` cuts it out — holes are made with a `sub` shape rather than a
    winding rule, which is both better to work with and avoids depending on how
    PIL's scanline fill treats a self-intersecting polygon.

    Feather comes in two forms and both are per shape, applied *before*
    compositing — which is the whole point of `sub`: a soft cut-out is impossible
    if softening only happens once at the end. `feather` softens the whole edge
    evenly; `fo` carries a per-vertex offset to a hand-placed clone of the
    outline, so the softness can differ at every point and in any direction —
    which is what lets one side of a shape blend away while the other stays crisp.
    """
    acc = torch.zeros(height, width, dtype=torch.float32)
    ss = _SUPERSAMPLE if width * height <= _SUPERSAMPLE_CUTOFF else _SUPERSAMPLE_LARGE

    for shape in shapes:
        poly = shape.get("poly") or []
        if len(poly) < 3:
            continue  # a polygon needs area; PIL raises on fewer than 3 points
        pts = poly_to_px(poly, width, height)
        cov = _fill_coverage(_shape_rings(shape, pts), width, height, ss)

        feather = float(shape.get("feather") or 0.0)
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
              power: float = 2.0, reach: torch.Tensor | None = None) -> torch.Tensor:
    """Inverse-distance weighting of a few scattered values over a grid.

    `pins` is (P, 2) normalized 0..1, `vals` is (P,). Closed form, no
    triangulation, no boundary to extrapolate past — with P in the tens this is
    one broadcast of P distances per pixel and it degenerates correctly at
    P == 1 (a constant field).

    `reach` is an optional (P,) radius per pin, dividing its own distances. A
    wider pin holds ground the ones around it would otherwise take — which is
    how a single sharp pin can keep a whole subject in focus instead of being
    dragged blurry by its neighbours. All at `NEUTRAL_REACH` is the plain form.
    """
    dev = pins.device
    gy, gx = torch.meshgrid(
        torch.linspace(0.0, 1.0, height, device=dev),
        torch.linspace(0.0, 1.0, width, device=dev),
        indexing="ij",
    )
    d2 = (gx[..., None] - pins[:, 0]) ** 2 + (gy[..., None] - pins[:, 1]) ** 2
    if reach is not None:
        d2 = d2 / (reach / NEUTRAL_REACH).clamp(min=1e-4) ** 2
    w = (d2 + 1e-9).pow(-power / 2.0)
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

    A stroke's `speed` is its overall intensity; `sv` is an optional per-vertex
    multiplier on top, resolved by the editor from the per-control-point values
    and carried along the polyline. That is what lets one stroke describe
    something that accelerates, instead of needing a stroke per speed.
    """
    pos, val = [], []
    for p in paths:
        poly = np.asarray(p.get("poly") or [], dtype=np.float64).reshape(-1, 2)
        if len(poly) < 2:
            continue
        speed = abs(float(p.get("speed", 1.0)))
        if speed <= 0.0:
            continue
        sv = p.get("sv")
        sv = (np.maximum(0.0, np.asarray(sv, dtype=np.float64))
              if sv and len(sv) == len(poly) else np.ones(len(poly)))
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
        spd = (speed * np.interp(t, cum, sv))[:, None]
        pos.append(xy)
        val.append(np.concatenate([d * spd, spd], axis=1))
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
