"""The crop box must always contain the mask, and the render must keep the box's real
aspect. Pure torch — run with: python tests/test_crop_containment.py

Regression for two reports against NKD Inpaint Crop (Automatic 1024/1536, padding 256):
  * a very wide mask: the aspect cap made the box SHRINK below the mask (915 px of a
    4000x1500 image's mask fell outside the box, so that part was never regenerated);
  * a mask spanning a width that is not a multiple of 16 lost its first columns.
"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _bbox_from_mask, _crop_by_mask, _VAE_MULTIPLE  # noqa: E402


def _rect_mask(h, w, x1, y1, x2, y2):
    m = torch.zeros(1, h, w)
    m[:, y1:y2, x1:x2] = 1.0
    return m


def _check(name, h, w, mrect, lo=1024, hi=1536, padding=256):
    image = torch.zeros(1, h, w, 3)
    mask = _rect_mask(h, w, *mrect)
    crop, _cm, (x1, y1, x2, y2), orig = _crop_by_mask(
        image, mask, padding, 1_048_576, longest_side=0, min_side=lo, max_side=hi)
    mx1, my1, mx2, my2 = _bbox_from_mask(mask[0])
    assert orig == (h, w), name
    assert 0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h, f"{name}: box outside image {(x1, y1, x2, y2)}"
    assert x1 <= mx1 and y1 <= my1 and x2 >= mx2 and y2 >= my2, (
        f"{name}: box {(x1, y1, x2, y2)} does not contain the mask {(mx1, my1, mx2, my2)}")
    rh, rw = crop.shape[1], crop.shape[2]
    assert rw % _VAE_MULTIPLE == 0 and rh % _VAE_MULTIPLE == 0, f"{name}: render {rw}x{rh} not /16"
    box_aspect, render_aspect = (x2 - x1) / (y2 - y1), rw / rh
    assert abs(render_aspect - box_aspect) / box_aspect < 0.03, (
        f"{name}: render {rw}x{rh} (aspect {render_aspect:.3f}) vs box aspect {box_aspect:.3f}")
    return (x1, y1, x2, y2), (rw, rh)


def test_very_wide_mask():
    _check("wide 4000x1500", 1500, 4000, (861, 880, 4000, 1351))


def test_very_wide_mask_other_limits():
    _check("wide, 512/2048", 1500, 4000, (861, 880, 4000, 1351), lo=512, hi=2048)


def test_very_tall_mask():
    _check("tall 1500x4000", 4000, 1500, (880, 861, 1351, 4000))


def test_mask_spanning_a_non_multiple_of_16_width():
    box, _ = _check("edge band 2217x1500", 1500, 2217, (0, 205, 2217, 1342))
    assert box[0] == 0 and box[2] == 2217, box


def test_mask_filling_a_short_image_width():
    _check("3000x400 full width", 400, 3000, (0, 100, 3000, 300))


def test_ordinary_masks_keep_their_behaviour():
    """Compact masks: the box grows to the render's aspect, as before."""
    (x1, y1, x2, y2), (rw, rh) = _check("square-ish", 600, 800, (400, 120, 520, 240), lo=512, hi=1536, padding=50)
    assert (x2 - x1) % _VAE_MULTIPLE == 0 and (y2 - y1) % _VAE_MULTIPLE == 0
    _check("big image", 3000, 4000, (1800, 1300, 2300, 1700))


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok  ", name)
            except AssertionError as e:
                failed += 1
                print("FAIL", name, "-", e)
    sys.exit(1 if failed else 0)
