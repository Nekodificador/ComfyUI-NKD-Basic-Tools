"""Bake a mesh into a 3D LUT and apply it (numpy only, trilinear).

C_REF normalizes OKLCh chroma to the grid's 0..1 saturation radius. It is a
calibration constant (~max sRGB OKLCh chroma). Out-of-gamut results are mapped
back by compressing chroma toward the gray axis at constant L and hue (binary
search for the gamut boundary) — per-channel RGB clamping would drift hue/L.
# ponytail: trilinear interp is the validated baseline; tetrahedral is a later
# quality pass. Gamut clip is hard (to the boundary); soft knee is a refinement.
"""
import numpy as np
from . import oklab, mesh as _mesh

C_REF = 0.35
_GAMUT_EPS = 1e-9
_GAMUT_ITERS = 22  # binary-search steps; keep in sync with colorCore.ts


def _compress_to_gamut(lab):
    """Scale (a,b) of out-of-gamut OKLab colors to the sRGB boundary, keeping
    L and hue. Requires L already in [0,1] (gray axis is always in gamut)."""
    lin = oklab.oklab_to_linear(lab)
    oog = np.any((lin < -_GAMUT_EPS) | (lin > 1 + _GAMUT_EPS), axis=-1)
    if not np.any(oog):
        return lab
    L = lab[..., 0][oog]
    a = lab[..., 1][oog]
    b = lab[..., 2][oog]
    lo = np.zeros_like(L)
    hi = np.ones_like(L)
    for _ in range(_GAMUT_ITERS):
        mid = 0.5 * (lo + hi)
        t = oklab.oklab_to_linear(np.stack([L, a * mid, b * mid], axis=-1))
        ok = np.all((t >= -_GAMUT_EPS) & (t <= 1 + _GAMUT_EPS), axis=-1)
        lo = np.where(ok, mid, lo)
        hi = np.where(ok, hi, mid)
    lab[..., 1][oog] = a * lo
    lab[..., 2][oog] = b * lo
    return lab


def bake(mesh_dict, size=33):
    g = np.linspace(0.0, 1.0, size)
    r, gr, b = np.meshgrid(g, g, g, indexing="ij")
    rgb = np.stack([r, gr, b], axis=-1)  # (size,size,size,3)

    lch = oklab.oklab_to_oklch(oklab.srgb_to_oklab(rgb))
    L, C, h = lch[..., 0], lch[..., 1], lch[..., 2]
    sat = C / C_REF

    dh, ds, dl = _mesh.sample(mesh_dict, h, sat)
    h2 = (h + dh) % 360.0
    sat2 = np.clip(sat + ds, 0.0, None)
    C2 = sat2 * C_REF
    L2 = np.clip(L + dl, 0.0, 1.0)

    lch2 = np.stack([L2, C2, h2], axis=-1)
    lab2 = oklab.oklch_to_oklab(lch2)
    na, nb = mesh_dict.get("neutral", (0.0, 0.0))
    if na or nb:  # global neutral cast (draggable centre node)
        lab2[..., 1] += na
        lab2[..., 2] += nb
    lab2 = _compress_to_gamut(lab2)
    out = oklab.oklab_to_srgb(lab2)
    return np.clip(out, 0.0, 1.0)


def apply(lut, img):
    """Trilinear apply. lut: (N,N,N,3); img: (...,3) in [0,1]. red=axis0."""
    lut = np.asarray(lut, dtype=np.float64)
    N = lut.shape[0]
    img = np.clip(np.asarray(img, dtype=np.float64), 0.0, 1.0)
    p = img * (N - 1)
    i0 = np.floor(p).astype(int)
    i0 = np.clip(i0, 0, N - 2)
    f = p - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]

    def g(dr, dg, db):
        return lut[r0 + dr, g0 + dg, b0 + db]

    c00 = g(0, 0, 0) * (1 - fr) + g(1, 0, 0) * fr
    c01 = g(0, 0, 1) * (1 - fr) + g(1, 0, 1) * fr
    c10 = g(0, 1, 0) * (1 - fr) + g(1, 1, 0) * fr
    c11 = g(0, 1, 1) * (1 - fr) + g(1, 1, 1) * fr
    c0 = c00 * (1 - fg) + c10 * fg
    c1 = c01 * (1 - fg) + c11 * fg
    return c0 * (1 - fb) + c1 * fb
