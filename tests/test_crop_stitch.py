"""Self-check for the crop/stitch geometry. Pure torch — run with any python
that has torch installed: python tests/test_crop_stitch.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _crop_by_mask, _mask_grow, _megapixels_to_pixels, _uncrop, _VAE_MULTIPLE


def demo():
    torch.manual_seed(0)
    H, W = 600, 800
    image = torch.rand(1, H, W, 3)

    # Circular mask off-center
    yy, xx = torch.meshgrid(torch.arange(H), torch.arange(W), indexing="ij")
    mask = (((yy - 220) ** 2 + (xx - 550) ** 2) < 60 ** 2).float().unsqueeze(0)

    processed = _mask_grow(mask, 20, 10)
    assert processed.shape == (1, H, W)
    assert processed.max() <= 1.0 and processed.min() >= 0.0
    assert processed.sum() > mask.sum()  # grew outward

    crop, crop_mask, box, orig = _crop_by_mask(image, processed, 50, _megapixels_to_pixels(1.0))
    x1, y1, x2, y2 = box
    assert orig == (H, W)
    assert 0 <= x1 < x2 <= W and 0 <= y1 < y2 <= H
    assert (x2 - x1) % _VAE_MULTIPLE == 0 and (y2 - y1) % _VAE_MULTIPLE == 0
    assert crop.shape[1] % _VAE_MULTIPLE == 0 and crop.shape[2] % _VAE_MULTIPLE == 0
    assert crop_mask.shape[1:] == crop.shape[1:3]
    # Aspect invariant: render aspect ≈ bbox aspect → symmetric restore scale
    assert abs((crop.shape[2] / crop.shape[1]) - ((x2 - x1) / (y2 - y1))) < 0.05

    # Simulate "inpainting": paint the patch solid red, composite back.
    patch = torch.zeros_like(crop)
    patch[..., 0] = 1.0
    out = _uncrop(patch, image, box, orig, processed, feather=10)
    assert out.shape == image.shape

    # Far corner (outside mask+feather) must be untouched.
    assert torch.equal(out[:, :50, :50, :], image[:, :50, :50, :])
    # Mask center must now be red.
    assert out[0, 220, 550, 0] > 0.9 and out[0, 220, 550, 1] < 0.1

    # Batched stitch: 3 samples over 1 background.
    patch3 = patch.repeat(3, 1, 1, 1)
    out3 = _uncrop(patch3, image.repeat(3, 1, 1, 1), box, orig, processed, feather=10)
    assert out3.shape == (3, H, W, 3)

    print("crop/stitch self-check OK — box:", box, "crop:", tuple(crop.shape))


if __name__ == "__main__":
    demo()
