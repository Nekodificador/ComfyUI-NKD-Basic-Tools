"""Checks for NKD Merge. Plain asserts, no framework.

    python tests/test_merge.py
"""

import json
import os
import sys
import types

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))

import torch  # noqa: E402

_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_PACK]
sys.modules["nkdbt"] = _pkg

from nkdbt.nkd_merge import NKDMerge, parse_transform  # noqa: E402

RED = torch.tensor([1.0, 0.0, 0.0])


def _merge(bg, fg, fit="fit", opacity=1.0, blend_mode="normal", alpha=None,
           invert_alpha=False, **t):
    tr = json.dumps({"x": 0.5, "y": 0.5, "scale": 1.0, "angle": 0.0, **t})
    r = NKDMerge.execute(bg, fg, fit, opacity, blend_mode, tr, alpha=alpha,
                         invert_alpha=invert_alpha).result
    return r[0], r[1]


def _fg(h=10, w=10, color=(1.0, 0.0, 0.0), a=1.0, frames=1):
    fg = torch.empty(frames, h, w, 4)
    fg[..., :3] = torch.tensor(color)
    fg[..., 3] = a
    return fg


def _red(px):
    return torch.allclose(px, RED, atol=2e-3)


def test_parse_transform_defaults():
    assert parse_transform("") == {"x": 0.5, "y": 0.5, "scale": 1.0, "angle": 0.0}
    assert parse_transform("{bad")["scale"] == 1.0
    assert parse_transform('{"x": 0.1, "scale": "2"}') == \
        {"x": 0.1, "y": 0.5, "scale": 1.0, "angle": 0.0}


def test_default_same_size_aligns_exactly():
    bg = torch.zeros(1, 24, 32, 3)
    out, mask = _merge(bg, _fg(24, 32))
    assert torch.allclose(out, RED.expand(1, 24, 32, 3), atol=2e-3)
    assert mask.min() > 0.99


def test_fit_fill_pixels():
    bg = torch.zeros(1, 200, 200, 3)
    fg = _fg(50, 100)                              # 2:1 on a square
    _, fit = _merge(bg, fg, fit="fit")             # 200x100, centred: rows 50..150
    assert fit[0, 100, 0] > 0.99 and fit[0, 40, 100] < 0.01 and fit[0, 160, 100] < 0.01
    _, fill = _merge(bg, fg, fit="fill")           # 400x200: covers everything
    assert fill.min() > 0.99
    _, px = _merge(bg, fg, fit="pixels")           # 100x50 centred: x 50..150, y 75..125
    assert px[0, 100, 55] > 0.99 and px[0, 100, 45] < 0.01 and px[0, 70, 100] < 0.01


def test_position_and_off_canvas():
    bg = torch.zeros(1, 40, 40, 3)
    out, _ = _merge(bg, _fg(), fit="pixels", x=0.0, y=0.0)   # centre on the corner
    assert _red(out[0, 2, 2]) and out[0, 7, 7].abs().max() == 0
    out, mask = _merge(bg, _fg(), fit="pixels", x=2.0)
    assert torch.equal(out, bg) and mask.max() == 0


def test_rotation_quarter_turn():
    bg = torch.zeros(1, 40, 40, 3)
    _, mask = _merge(bg, _fg(10, 20), fit="pixels", angle=90.0)   # 20 wide -> 20 tall
    assert mask[0, 12, 20] > 0.99 and mask[0, 20, 12] < 0.01


def test_scale_multiplies_fit():
    bg = torch.zeros(1, 40, 40, 3)
    _, mask = _merge(bg, _fg(10, 10), fit="pixels", scale=2.0)    # 20x20 centred
    assert mask[0, 11, 11] > 0.99 and mask[0, 9, 9] < 0.01
    _, mask = _merge(bg, _fg(10, 10), fit="pixels", scale=0.2)    # heavy shrink: 2x2
    assert 2.0 < mask.sum() < 6.0, mask.sum()


def test_transparent_and_half_alpha():
    bg = torch.ones(1, 16, 16, 3)
    out, _ = _merge(bg, _fg(16, 16, a=0.0))
    assert torch.allclose(out, bg)
    # 50% black over white mixes in linear light, so it reads lighter than 0.5 in sRGB.
    half = _merge(bg, _fg(16, 16, color=(0.0, 0.0, 0.0), a=0.5))[0][0, 5, 5, 0]
    assert 0.7 < half < 0.75, half


def test_batch_broadcast():
    out, mask = _merge(torch.zeros(1, 16, 16, 3), _fg(16, 16, frames=7))
    assert out.shape[0] == 7 and mask.shape == (7, 16, 16)
    out, _ = _merge(torch.zeros(5, 16, 16, 3), _fg(16, 16))
    assert out.shape[0] == 5 and _red(out[4, 0, 0])


def test_alpha_input():
    bg = torch.zeros(1, 10, 10, 3)
    alpha = torch.zeros(1, 10, 10)
    alpha[:, :, :5] = 1.0
    out, mask = _merge(bg, torch.ones(1, 10, 10, 3), alpha=alpha)
    assert out[0, 0, 0, 0] > 0.99 and out[0, 0, 8, 0] < 0.01
    assert torch.allclose(mask[0], alpha[0], atol=1e-3)


def test_invert_alpha():
    bg = torch.zeros(1, 10, 10, 3)
    alpha = torch.zeros(1, 10, 10)
    alpha[:, :, :5] = 1.0
    out, mask = _merge(bg, torch.ones(1, 10, 10, 3), alpha=alpha, invert_alpha=True)
    assert out[0, 0, 0, 0] < 0.01 and out[0, 0, 8, 0] > 0.99
    assert torch.allclose(mask[0], 1 - alpha[0], atol=1e-3)
    # the foreground's own alpha flips too
    out, _ = _merge(bg, _fg(a=0.0), invert_alpha=True)
    assert _red(out[0, 5, 5])


def test_rgba_background_and_blend():
    bg = torch.zeros(1, 16, 16, 4)
    out, _ = _merge(bg, _fg(), fit="pixels")
    assert out.shape[-1] == 4 and out[0, 8, 8, 3] > 0.99 and out[0, 0, 0, 3] == 0.0
    gray = torch.full((1, 16, 16, 3), 0.5)
    mult, _ = _merge(gray, _fg(color=(0.0, 0.0, 0.0)), fit="pixels", blend_mode="multiply")
    assert mult[0, 8, 8].max() < 0.01 and torch.allclose(mult[0, 0, 0], gray[0, 0, 0])


def test_normal_matches_core():
    # The torch fast path must give what core's own engine gives for "normal".
    import numpy as np
    from comfy_extras.compositor_blend import (blend_composite, linear_to_srgb, resolve_mode,
                                               srgb_to_linear)
    from nkdbt.nkd_merge import _over
    g = torch.Generator().manual_seed(0)
    bg, fg = torch.rand(24, 24, 4, generator=g), torch.rand(24, 24, 4, generator=g)
    bg[:4, :, 3] = 0.0
    fg[:, :4, 3] = 0.0

    def lin(t):
        a = t.numpy()
        return np.concatenate([srgb_to_linear(a[..., :3]), a[..., 3:]], -1)
    ref = blend_composite(resolve_mode("normal"), lin(bg), lin(fg), 0.7)
    ref = np.concatenate([linear_to_srgb(np.clip(ref[..., :3], 0, 1)), ref[..., 3:]], -1)
    assert np.abs(_over(bg, fg, 0.7).numpy() - ref).max() < 1e-4


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
