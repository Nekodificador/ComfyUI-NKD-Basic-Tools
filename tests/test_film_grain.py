"""Self-check for the film grain core. python tests/test_film_grain.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _film_grain

CPU = torch.device("cpu")


def demo():
    torch.manual_seed(0)
    img = torch.rand(4, 48, 64, 3)  # 4-frame "video"

    # Shape + range preserved, actually changed the image
    out = _film_grain(img, amount=40, size=25, roughness=50, color=0, seed=7, device=CPU)
    assert out.shape == img.shape
    assert out.min() >= 0.0 and out.max() <= 1.0
    assert not torch.allclose(out, img)

    # Deterministic: same seed → same result
    out2 = _film_grain(img, amount=40, size=25, roughness=50, color=0, seed=7, device=CPU)
    assert torch.allclose(out, out2)

    # Different seed → different grain
    out3 = _film_grain(img, amount=40, size=25, roughness=50, color=0, seed=8, device=CPU)
    assert not torch.allclose(out, out3)

    # amount=0 → identity (no grain)
    zero = _film_grain(img, amount=0, size=25, roughness=50, color=0, seed=7, device=CPU)
    assert torch.allclose(zero, img)

    # animate=True → each frame's grain differs; False → identical grain per frame
    flat = torch.full((3, 32, 32, 3), 0.5)
    anim = _film_grain(flat, amount=60, size=10, roughness=50, color=0, seed=1,
                       animate=True, device=CPU)
    assert not torch.allclose(anim[0], anim[1])          # frames differ
    static = _film_grain(flat, amount=60, size=10, roughness=50, color=0, seed=1,
                         animate=False, device=CPU)
    assert torch.allclose(static[0], static[1])          # same grain each frame

    # Mono grain is (near) neutral: the 3 channels of the added grain match.
    g = anim - flat
    assert torch.allclose(g[..., 0], g[..., 1], atol=1e-6)

    # Color > 0 breaks channel symmetry (dye-cloud color grain)
    col = _film_grain(flat, amount=60, size=10, roughness=50, color=80, seed=1,
                      animate=True, device=CPU)
    gc = col - flat
    assert not torch.allclose(gc[..., 0], gc[..., 2], atol=1e-6)

    # Alpha channel is passed through untouched
    rgba = torch.cat([img, torch.rand(4, 48, 64, 1)], dim=-1)
    outa = _film_grain(rgba, amount=40, size=25, roughness=50, color=0, seed=7, device=CPU)
    assert torch.allclose(outa[..., 3], rgba[..., 3])
    assert outa.shape[-1] == 4

    # Bigger Size → coarser grain → lower per-pixel variance of the grain field
    fine = _film_grain(flat, amount=60, size=5, roughness=0, color=0, seed=3, device=CPU) - flat
    coarse = _film_grain(flat, amount=60, size=90, roughness=0, color=0, seed=3, device=CPU) - flat
    # coarse grain varies more smoothly between neighbours → smaller mean abs diff
    d_fine = (fine[:, 1:, :, 0] - fine[:, :-1, :, 0]).abs().mean()
    d_coarse = (coarse[:, 1:, :, 0] - coarse[:, :-1, :, 0]).abs().mean()
    assert d_coarse < d_fine

    # Mask confines grain: zero where mask=0, full where mask=1, untouched image
    m = torch.zeros(1, 32, 32)
    m[:, :, 16:] = 1.0  # right half on
    masked = _film_grain(flat, amount=80, size=10, roughness=50, color=0, seed=5,
                         animate=True, mask=m, device=CPU)
    assert torch.allclose(masked[:, :, :16, :], flat[:, :, :16, :])   # left half untouched
    assert not torch.allclose(masked[:, :, 16:, :], flat[:, :, 16:, :])  # right half grained

    # Mask is resized to the image when shapes differ (no crash)
    big = _film_grain(flat, amount=80, size=10, roughness=50, color=0, seed=5,
                      animate=True, mask=torch.rand(1, 8, 8), device=CPU)
    assert big.shape == flat.shape

    print("film grain self-check OK")


if __name__ == "__main__":
    demo()
