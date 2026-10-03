"""Checks for NKD Alpha Matte. Plain asserts, no framework.

    python tests/test_alpha_matte.py
"""

import os
import sys
import types

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))

import torch  # noqa: E402

_pkg = types.ModuleType("nkdbt")          # nkd_alpha_matte imports `.mask_core`
_pkg.__path__ = [_PACK]
sys.modules["nkdbt"] = _pkg

from nkdbt.nkd_alpha_matte import NKDAlphaMatte, estimate_foreground  # noqa: E402


def _scene():
    # Red subject on a green background; a soft vertical edge in the middle where
    # the plate is a true mix: I = a*red + (1-a)*green.
    h, w = 64, 128
    a = torch.zeros(1, h, w)
    a[:, :, :48] = 1.0
    a[:, :, 48:80] = torch.linspace(1.0, 0.0, 32)
    red = torch.tensor([1.0, 0.0, 0.0])
    green = torch.tensor([0.0, 1.0, 0.0])
    img = a.unsqueeze(-1) * red + (1 - a.unsqueeze(-1)) * green
    return img, a


def test_polarity():
    img, a = _scene()
    run = dict(expand=0, feather=0, smooth_in_time=0, decontaminate=False)
    out, alpha = NKDAlphaMatte.execute(img, a, mask_is_subject=True, **run).result
    assert out.shape == (1, 64, 128, 4)
    assert torch.allclose(out[..., 3], a) and torch.allclose(alpha, a)
    out, _ = NKDAlphaMatte.execute(img, 1 - a, mask_is_subject=False, **run).result
    assert torch.allclose(out[..., 3], a, atol=1e-6)


def test_decontaminate_removes_spill():
    img, a = _scene()
    fg = estimate_foreground(img, a)
    band = (a > 0.05) & (a < 0.95)
    # The plate's green leaks into the edge; the estimate is approximate, but most
    # of the spill must be gone (measured: up to 0.97 in, at most 0.11 out).
    assert img[band][:, 1].max() > 0.9
    assert fg[band][:, 1].max() < 0.15, fg[band][:, 1].max()
    assert fg[band][:, 1].mean() < img[band][:, 1].mean() / 5
    # Opaque pixels are left exactly as they were.
    opaque = a >= 1.0
    assert torch.allclose(fg[opaque], img[opaque], atol=1e-5)


def test_levels_tighten_the_finished_matte():
    img, a = _scene()
    run = dict(mask_is_subject=True, expand=0, smooth_in_time=0, decontaminate=False)
    _, alpha = NKDAlphaMatte.execute(img, a, feather=0, black_point=0.25, white_point=0.75,
                                     **run).result
    assert alpha[a <= 0.25].max() == 0.0 and alpha[a >= 0.75].min() == 1.0
    mid = (a > 0.3) & (a < 0.7)
    assert torch.allclose(alpha[mid], (a[mid] - 0.25) / 0.5, atol=1e-5)
    # After the feather: a feathered edge still comes out tightened.
    _, soft = NKDAlphaMatte.execute(img, a, feather=8, **run).result
    _, hard = NKDAlphaMatte.execute(img, a, feather=8, black_point=0.5, white_point=0.5,
                                    **run).result
    assert ((soft > 0.01) & (soft < 0.99)).any()
    assert set(hard.unique().tolist()) <= {0.0, 1.0}


def test_broadcast_and_resize():
    img = torch.rand(5, 32, 48, 3)
    mask = torch.ones(1, 16, 24)
    out, alpha = NKDAlphaMatte.execute(img, mask, mask_is_subject=True, expand=-2, feather=2,
                                       smooth_in_time=1, decontaminate=True).result
    assert out.shape == (5, 32, 48, 4) and alpha.shape == (5, 32, 48)


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
