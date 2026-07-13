"""Self-check for the crop/stitch geometry. Pure torch — run with any python
that has torch installed: python tests/test_crop_stitch.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import (_alpha_hardness, _box_preview, _crop_by_mask, _mask_fill_holes,
                     _mask_grow, _megapixels_to_pixels, _post_blend, _uncrop,
                     _VAE_MULTIPLE)


def demo():
    torch.manual_seed(0)
    H, W = 600, 800
    image = torch.rand(1, H, W, 3)

    # Circular mask off-center
    yy, xx = torch.meshgrid(torch.arange(H), torch.arange(W), indexing="ij")
    dist2 = (yy - 220) ** 2 + (xx - 550) ** 2
    mask = (dist2 < 60 ** 2).float().unsqueeze(0)

    # Fill holes: a ring (donut) must become a full disc; borders untouched.
    ring = ((dist2 < 60 ** 2) & (dist2 > 30 ** 2)).float().unsqueeze(0)
    filled = _mask_fill_holes(ring)
    assert filled[0, 220, 550] == 1.0        # hole center filled
    assert filled[0, 0, 0] == 0.0            # outside untouched
    assert torch.equal(_mask_fill_holes(mask), mask)  # no holes → identity

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

    # Native mode (megapixels=0): crop taken 1:1, no resample.
    ncrop, _, nbox, _ = _crop_by_mask(image, processed, 50, 0)
    nx1, ny1, nx2, ny2 = nbox
    assert ncrop.shape[1] == ny2 - ny1 and ncrop.shape[2] == nx2 - nx1
    assert torch.equal(ncrop, image[:, ny1:ny2, nx1:nx2, :])

    # Alpha hardness remap: identity at 0, collapses fringe, keeps core solid.
    soft = torch.linspace(0, 1, 11)
    assert torch.equal(_alpha_hardness(soft, 0.0), soft)
    hard = _alpha_hardness(soft, 0.8)
    assert hard[1] == 0.0 and hard[-2] == 1.0 and abs(hard[5] - soft[5]) < 1e-5

    # Longest-side mode: longest render side == requested, aspect ≈ bbox aspect.
    lcrop, _, lbox, _ = _crop_by_mask(image, processed, 50, 0, longest_side=512)
    assert max(lcrop.shape[1], lcrop.shape[2]) == 512
    assert lcrop.shape[1] % _VAE_MULTIPLE == 0 and lcrop.shape[2] % _VAE_MULTIPLE == 0
    lx1, ly1, lx2, ly2 = lbox
    assert abs((lcrop.shape[2] / lcrop.shape[1]) - ((lx2 - lx1) / (ly2 - ly1))) < 0.05

    # Box preview: right shape, downscaled, border painted in the accent color.
    prev = _box_preview(image, processed, box, max_side=400)
    assert prev.shape[0] == 1 and prev.shape[-1] == 3
    assert max(prev.shape[1], prev.shape[2]) <= 400
    assert prev.min() >= 0.0 and prev.max() <= 1.0

    # Simulate "inpainting": paint the patch solid red, composite back.
    patch = torch.zeros_like(crop)
    patch[..., 0] = 1.0
    out, alpha = _uncrop(patch, image, box, orig, processed, feather=10)
    assert out.shape == image.shape
    assert alpha.shape == (1, box[3] - box[1], box[2] - box[0])

    # Far corner (outside mask+feather) must be untouched.
    assert torch.equal(out[:, :50, :50, :], image[:, :50, :50, :])
    # Mask center must now be red.
    assert out[0, 220, 550, 0] > 0.9 and out[0, 220, 550, 1] < 0.1

    # Batched stitch: 3 samples over 1 background.
    patch3 = patch.repeat(3, 1, 1, 1)
    out3, _ = _uncrop(patch3, image.repeat(3, 1, 1, 1), box, orig, processed, feather=10)
    assert out3.shape == (3, H, W, 3)

    # Color match: a green-tinted patch pulled toward the original's statistics.
    tinted = (image * torch.tensor([0.8, 1.2, 0.8])).clamp(0, 1)
    comp, alpha_r = _uncrop(tinted[:, box[1]:box[3], box[0]:box[2], :], image, box, orig,
                            processed, feather=10)
    alpha_full = torch.zeros(1, H, W)
    alpha_full[:, box[1]:box[3], box[0]:box[2]] = alpha_r
    matched = _post_blend(image, comp, alpha_full, 1.0, False)
    assert matched.shape == comp.shape
    assert matched.min() >= 0.0 and matched.max() <= 1.0
    # The tint inside the mask must have moved toward the original.
    region = (slice(None), 220, 550, slice(None))
    err_before = (comp[region] - image[region]).abs().sum()
    err_after = (matched[region] - image[region]).abs().sum()
    assert err_after < err_before

    print("crop/stitch self-check OK — box:", box, "crop:", tuple(crop.shape))


if __name__ == "__main__":
    demo()
