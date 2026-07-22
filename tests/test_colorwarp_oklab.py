import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import oklab


def demo():
    rng = np.random.default_rng(0)
    rgb = rng.random((256, 3)).astype(np.float64)

    # sRGB -> OKLab -> sRGB round-trips
    lab = oklab.srgb_to_oklab(rgb)
    back = oklab.oklab_to_srgb(lab)
    assert np.allclose(rgb, back, atol=1e-6), np.abs(rgb - back).max()

    # OKLab <-> OKLCh round-trips
    lch = oklab.oklab_to_oklch(lab)
    lab2 = oklab.oklch_to_oklab(lch)
    assert np.allclose(lab, lab2, atol=1e-9)

    # Known anchors: pure red hue is small-ish, green ~140, blue ~260 (deg)
    reds = oklab.oklab_to_oklch(oklab.srgb_to_oklab(np.array([[1.0, 0, 0]])))
    assert 20 < reds[0, 2] < 45, reds[0, 2]

    # HSL round-trip
    hsl = oklab.srgb_to_hsl(rgb)
    rgb2 = oklab.hsl_to_srgb(hsl)
    assert np.allclose(rgb, rgb2, atol=1e-6), np.abs(rgb - rgb2).max()
    # HSL hue of pure red is 0, green 120, blue 240
    prim = oklab.srgb_to_hsl(np.array([[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]))
    assert np.allclose(prim[:, 0], [0, 120, 240], atol=1e-3), prim[:, 0]

    print("oklab OK")


if __name__ == "__main__":
    demo()
