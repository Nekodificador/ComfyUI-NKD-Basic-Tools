"""Self-check for frequency separate/combine. Pure torch:
python tests/test_frequency.py"""
import os
import sys

import torch

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PACK)
# comfy_api lives at the ComfyUI root (custom_nodes/<pack> -> up two)
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))
from nkd_frequency import NKDFrequencySeparate, NKDFrequencyCombine
from helpers import _srgb_to_linear, _linear_to_srgb, _luminance


def _sep(img, **kw):
    p = dict(method="Guided", radius=6, edge_threshold=0.1, mode="Divide",
             detail="Luminance", linear=True)
    p.update(kw)
    out = NKDFrequencySeparate.execute(img, **p)
    return out.result[0], out.result[1]


def _comb(hf, lf, **kw):
    p = dict(mode="Divide", linear=True, detail_strength=1.0)
    p.update(kw)
    return NKDFrequencyCombine.execute(hf, lf, **p).result[0]


def _chroma(img):
    """Per-pixel chromaticity (R,G,B)/(R+G+B) — hue+saturation signature."""
    s = img[..., :3].sum(-1, keepdim=True) + 1e-8
    return img[..., :3] / s


def demo():
    torch.manual_seed(0)
    img = torch.rand(1, 48, 64, 3)

    # 1. sRGB<->linear round-trips
    assert torch.allclose(_linear_to_srgb(_srgb_to_linear(img)), img, atol=1e-4)

    # 2. Divide/Luminance: chroma-safe by design, so it does NOT reconstruct
    #    per-channel color. What it DOES guarantee: luminance is restored
    #    exactly onto the base (luma(lf) * luma(img)/luma(lf) = luma(img)).
    hf, lf = _sep(img)
    back = _comb(hf, lf)
    lb = _luminance(_srgb_to_linear(back))
    li = _luminance(_srgb_to_linear(img))
    assert torch.allclose(lb, li, atol=3e-3), (lb - li).abs().max()

    # 3. RGB divide round-trip too
    hf, lf = _sep(img, detail="RGB")
    assert torch.allclose(_comb(hf, lf), img, atol=2e-3)

    # 4. Subtract round-trip
    hf, lf = _sep(img, mode="Subtract", detail="RGB")
    assert torch.allclose(_comb(hf, lf, mode="Subtract"), img, atol=2e-3)

    # 5. CHROMA-SAFE: transfer luminance detail from `img` onto a differently
    #    colored target. The target's chromaticity must be preserved EXACTLY
    #    (a scalar multiply in linear can't move hue/saturation).
    target = torch.rand(1, 48, 64, 3) * 0.6  # headroom so most pixels don't clip
    hf, _ = _sep(img, detail="Luminance", mode="Divide")
    result = _comb(hf, target, mode="Divide")
    # compare chromaticity in linear (where the invariance holds). Exact except
    # where a channel clipped at 0/1 (physically unrepresentable) — exclude those.
    unclipped = ((result > 1e-3) & (result < 1.0 - 1e-3)).all(-1)
    c_target = _chroma(_srgb_to_linear(target))[unclipped]
    c_result = _chroma(_srgb_to_linear(result))[unclipped]
    assert torch.allclose(c_target, c_result, atol=1e-3), (c_target - c_result).abs().max()

    # 6. strength=0 -> no detail, output equals the (clamped) base
    hf, lf = _sep(img)
    base_only = _comb(hf, lf, detail_strength=0.0)
    lf_srgb = _linear_to_srgb(_srgb_to_linear(lf[..., :3])).clamp(0, 1)
    assert torch.allclose(base_only, lf_srgb, atol=2e-3)

    # 7. mask=0 leaves the base untouched; mask=1 restores detail
    hf, lf = _sep(img)
    m0 = torch.zeros(1, 48, 64)
    m1 = torch.ones(1, 48, 64)
    assert torch.allclose(_comb(hf, lf, mask=m1), _comb(hf, lf), atol=2e-3)
    out0 = _comb(hf, lf, mask=m0)
    lf_srgb = _linear_to_srgb(_srgb_to_linear(lf[..., :3])).clamp(0, 1)
    assert torch.allclose(out0, lf_srgb, atol=2e-3)

    # 8. Third output high_frequency_masked: with no mask it equals the full
    #    HF; with a mask it is full inside, neutral (1.0 for Divide) outside.
    out = NKDFrequencySeparate.execute(
        img, method="Guided", radius=6, edge_threshold=0.1, mode="Divide",
        detail="Luminance", linear=True)
    assert len(out.result) == 3
    assert torch.allclose(out.result[0], out.result[2])  # no mask -> same as full

    half = torch.zeros(1, 48, 64)
    half[:, :, :32] = 1.0
    out = NKDFrequencySeparate.execute(
        img, method="Guided", radius=6, edge_threshold=0.1, mode="Divide",
        detail="Luminance", linear=True, mask=half)
    full_hf, _, masked_hf = out.result
    assert torch.allclose(masked_hf[:, :, :32], full_hf[:, :, :32], atol=1e-4)  # inside
    assert torch.allclose(masked_hf[:, :, 32:], torch.ones_like(masked_hf[:, :, 32:]),
                          atol=1e-4)  # outside -> neutral 1.0

    print("ok — all frequency separation self-checks passed")


if __name__ == "__main__":
    demo()
