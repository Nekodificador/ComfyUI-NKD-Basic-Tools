import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import lut, mesh


def demo():
    rng = np.random.default_rng(1)
    img = rng.random((32, 32, 3)).astype(np.float64)

    # identity mesh -> apply is (near) identity
    L = lut.bake(mesh.identity(), size=33)
    out = lut.apply(L, img)
    assert np.abs(out - img).max() < 0.02, np.abs(out - img).max()

    # a +40 saturation-ring push increases saturation of a mid color
    m = mesh.constant(dh=0.0, ds=0.30, dl=0.0)
    L2 = lut.bake(m, size=33)
    from color_core import oklab
    px = np.array([[[0.6, 0.35, 0.35]]])  # muted red
    before = oklab.oklab_to_oklch(oklab.srgb_to_oklab(px))[..., 1]
    after = oklab.oklab_to_oklch(oklab.srgb_to_oklab(lut.apply(L2, px)))[..., 1]
    assert after[0, 0] > before[0, 0], (before, after)

    # output stays in gamut
    assert L2.min() >= 0.0 and L2.max() <= 1.0

    print("lut OK")


if __name__ == "__main__":
    demo()
