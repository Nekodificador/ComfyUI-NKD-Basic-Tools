"""OKLab/OKLCh/HSL color math (numpy only, host-agnostic).

Ottosson's OKLab: https://bjornottosson.com/blog/posts/oklab/
Arrays are (..., 3), sRGB gamma-encoded in [0, 1].
"""
import numpy as np

_M1 = np.array([  # linear sRGB -> LMS
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
])
_M2 = np.array([  # LMS' -> OKLab
    [0.2104542553,  0.7936177850, -0.0040720468],
    [1.9779984951, -2.4285922050,  0.4505937099],
    [0.0259040371,  0.7827717662, -0.8086757660],
])
_M1_INV = np.linalg.inv(_M1)
_M2_INV = np.linalg.inv(_M2)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)


def srgb_to_oklab(rgb):
    lin = srgb_to_linear(rgb)
    lms = lin @ _M1.T
    lms_ = np.cbrt(lms)
    return lms_ @ _M2.T


def oklab_to_linear(lab):
    """OKLab -> linear sRGB (no gamma, no clamp). May leave [0,1] out of gamut."""
    lms_ = np.asarray(lab, dtype=np.float64) @ _M2_INV.T
    lms = lms_ ** 3
    return lms @ _M1_INV.T


def oklab_to_srgb(lab):
    return linear_to_srgb(oklab_to_linear(lab))


def oklab_to_oklch(lab):
    lab = np.asarray(lab, dtype=np.float64)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a)) % 360.0
    return np.stack([L, C, h], axis=-1)


def oklch_to_oklab(lch):
    lch = np.asarray(lch, dtype=np.float64)
    L, C, h = lch[..., 0], lch[..., 1], lch[..., 2]
    r = np.radians(h)
    return np.stack([L, C * np.cos(r), C * np.sin(r)], axis=-1)


def srgb_to_hsl(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.max(rgb, axis=-1)
    mn = np.min(rgb, axis=-1)
    d = mx - mn
    L = (mx + mn) / 2.0
    S = np.where(d == 0, 0.0, d / (1 - np.abs(2 * L - 1) + 1e-12))
    h = np.zeros_like(L)
    nz = d != 0
    # per-channel max branches
    rmax = nz & (mx == r)
    gmax = nz & (mx == g) & ~rmax
    bmax = nz & (mx == b) & ~rmax & ~gmax
    h = np.where(rmax, ((g - b) / (d + 1e-12)) % 6, h)
    h = np.where(gmax, ((b - r) / (d + 1e-12)) + 2, h)
    h = np.where(bmax, ((r - g) / (d + 1e-12)) + 4, h)
    h = (h * 60.0) % 360.0
    return np.stack([h, S, L], axis=-1)


def hsl_to_srgb(hsl):
    hsl = np.asarray(hsl, dtype=np.float64)
    h, s, L = hsl[..., 0] % 360.0, hsl[..., 1], hsl[..., 2]
    c = (1 - np.abs(2 * L - 1)) * s
    x = c * (1 - np.abs((h / 60.0) % 2 - 1))
    m = L - c / 2.0
    z = np.zeros_like(h)
    seg = (h / 60.0).astype(int) % 6
    rp = np.select([seg == 0, seg == 1, seg == 2, seg == 3, seg == 4, seg == 5],
                   [c, x, z, z, x, c])
    gp = np.select([seg == 0, seg == 1, seg == 2, seg == 3, seg == 4, seg == 5],
                   [x, c, c, x, z, z])
    bp = np.select([seg == 0, seg == 1, seg == 2, seg == 3, seg == 4, seg == 5],
                   [z, z, x, c, c, x])
    return np.stack([rp + m, gp + m, bp + m], axis=-1)
