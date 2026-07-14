"""Self-check for the fractal (value-noise fBm) generator.
python tests/test_noise.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _fractal_noise, _h32


def _gen(**kw):
    base = dict(width=48, height=48, frames=1, scale=5, detail=4, roughness=0.5,
                lacunarity=2.0, distortion=0.0, contrast=1.0, brightness=0.0,
                evolution=0.0, loop=False, offset_x=0.0, offset_y=0.0, seed=7)
    base.update(kw)
    return _fractal_noise(**base)


def _ref_h32(x):
    """Plain-int reference of the hash — the exact algorithm the JS preview
    mirrors. Validates the torch tensor version's shifts/masks."""
    m = 0xFFFFFFFF
    x &= m
    x ^= x >> 16
    x = (x * 0x7feb352d) & m
    x ^= x >> 15
    x = (x * 0x846ca68b) & m
    x ^= x >> 16
    return x & m


def demo():
    # torch hash matches the scalar reference (⇒ matches the JS preview)
    for v in (0, 1, 42, 255, 65535, 123456, 0xFFFFFFFF):
        assert int(_h32(torch.tensor([v], dtype=torch.int64))[0]) == _ref_h32(v)

    a = _gen()
    assert a.shape == (1, 48, 48)
    assert a.min() >= 0.0 and a.max() <= 1.0
    assert torch.allclose(a, _gen())                 # deterministic
    assert not torch.allclose(a, _gen(seed=8))       # seed changes the field

    # Smooth: neighbouring pixels are close (value noise, not white noise)
    d = _gen(detail=1)[0]
    assert (d[1:, :] - d[:-1, :]).abs().mean() < 0.1

    # Animation: consecutive frames differ; static (evolution 0) frames match
    anim = _gen(frames=3, evolution=60)
    assert not torch.allclose(anim[0], anim[1])
    stat = _gen(frames=3, evolution=0)
    assert torch.allclose(stat[0], stat[1])

    # Loop is seamless: a frame depends on time only through theta = 2π·t/frames,
    # so equal theta ⇒ equal frame, and t=0 vs t=frames (theta 0 vs 2π) match.
    # frames=4,t=1 and frames=8,t=2 both give theta=π/2.
    gA = _fractal_noise(32, 32, 4, 5, 3, 0.5, 2.0, 0.0, 1.0, 0.0, 60, True, 0, 0, 1)
    gB = _fractal_noise(32, 32, 8, 5, 3, 0.5, 2.0, 0.0, 1.0, 0.0, 60, True, 0, 0, 1)
    assert torch.allclose(gA[0], gB[0], atol=1e-6)   # theta 0
    assert torch.allclose(gA[1], gB[2], atol=1e-6)   # theta π/2 ⇒ seamless wrap

    # Distortion changes the field; higher contrast widens the histogram
    assert not torch.allclose(_gen(distortion=6), a)
    lo = _gen(contrast=0.3); hi = _gen(contrast=3.0)
    assert hi.std() > lo.std()

    # Brightness shifts the mean up
    assert _gen(brightness=0.3).mean() > a.mean()

    print("noise self-check OK")


if __name__ == "__main__":
    demo()
