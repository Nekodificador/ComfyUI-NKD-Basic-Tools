"""Checks for NKD Crop / Outpaint's crop+pad math. Plain asserts, no framework.

    python tests/test_crop.py
"""

import json
import os
import sys

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PACK)
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))

import torch  # noqa: E402

from nkd_crop import (  # noqa: E402
    NKDCrop, _crop_pad, _crop_pad_mask, _parse_region, _region_box, _snap_bbox,
)


def region(x, y, w, h):
    return json.dumps({"x": x, "y": y, "w": w, "h": h})


def test_parse_region_defaults_to_full_image():
    assert _parse_region("", 100, 50) == (0, 0, 100, 50)
    assert _parse_region("not json", 100, 50) == (0, 0, 100, 50)


def test_parse_region_allows_negative_and_overflow():
    x0, y0, x1, y1 = _parse_region(region(-0.1, 0.0, 1.2, 1.0), 100, 50)
    assert (x0, y0, x1, y1) == (-10, 0, 110, 50)


def test_plain_crop_no_padding():
    img = torch.rand(1, 20, 20, 3)
    out, mask = _crop_pad(img, 5, 5, 15, 15, "black", "#000000")
    assert out.shape == (1, 10, 10, 3)
    assert torch.equal(out, img[:, 5:15, 5:15, :])
    assert mask.sum().item() == 0.0  # entirely inside the source -> nothing to generate


def test_outpaint_black_fill_and_mask():
    img = torch.full((1, 10, 10, 3), 0.7)
    # Extend 4px past the right edge.
    out, mask = _crop_pad(img, 0, 0, 14, 10, "black", "#000000")
    assert out.shape == (1, 10, 14, 3)
    assert torch.equal(out[:, :, :10, :], img)
    assert torch.all(out[:, :, 10:, :] == 0.0)
    # Mask: 0 over the original content, 1 over the new strip.
    assert torch.all(mask[:, :, :10] == 0.0)
    assert torch.all(mask[:, :, 10:] == 1.0)


def test_outpaint_edge_replicates_border():
    img = torch.zeros(1, 10, 10, 3)
    img[:, :, 9, :] = 1.0  # rightmost column is white
    out, _mask = _crop_pad(img, 0, 0, 13, 10, "edge", "#000000")
    assert torch.all(out[:, :, 10:, :] == 1.0)  # replicated the white edge


def test_outpaint_color_fill():
    img = torch.zeros(1, 10, 10, 3)
    out, _mask = _crop_pad(img, -2, 0, 10, 10, "color", "#ff0000")
    assert torch.allclose(out[:, :, 0, 0], torch.tensor(1.0))   # R
    assert torch.allclose(out[:, :, 0, 1], torch.tensor(0.0))   # G
    assert torch.allclose(out[:, :, 0, 2], torch.tensor(0.0))   # B


def test_entirely_outside_source_degrades_to_black():
    img = torch.rand(1, 10, 10, 3)
    out, mask = _crop_pad(img, 100, 100, 110, 110, "edge", "#000000")
    assert torch.all(out == 0.0)
    assert torch.all(mask == 1.0)


def test_mask_crop_pad_matches_image_path():
    m = torch.full((1, 10, 10), 0.3)
    out = _crop_pad_mask(m, 0, 0, 12, 10, "white", "#000000")
    assert out.shape == (1, 10, 12)
    assert torch.allclose(out[:, :, :10], m)
    assert torch.all(out[:, :, 10:] == 1.0)


def test_execute_image_passthrough_on_empty_region():
    img = torch.rand(1, 8, 8, 3)
    out = NKDCrop.execute(img, region="", fill="edge")
    assert torch.equal(out.args[0], img)
    assert out.args[2] == 8 and out.args[3] == 8


def test_execute_mask_returns_none_image():
    m = torch.rand(1, 8, 8)
    out = NKDCrop.execute(m, region="")
    assert out.args[0] is None
    assert out.args[1].shape == (1, 8, 8)


def test_parse_region_crop_mode_clamps_to_bounds():
    # Same request as test_parse_region_allows_negative_and_overflow, but mode = "Crop"
    # (allow_outpaint=False) has to stay inside the source instead of extending past it.
    x0, y0, x1, y1 = _parse_region(region(-0.1, 0.0, 1.2, 1.0), 100, 50, allow_outpaint=False)
    assert (x0, y0, x1, y1) == (0, 0, 100, 50)


def test_snap_bbox_grows_to_grid_centered():
    # 10px wide, multiple of 8 -> needs 6 more, split 3/3.
    x0, y0, x1, y1 = _snap_bbox(10, 10, 20, 26, 8, None, None)
    assert (x1 - x0) % 8 == 0 and (y1 - y0) % 8 == 0
    assert (x0, x1) == (7, 23)          # centered: 3px added each side
    assert (y0, y1) == (10, 26)         # already a multiple of 8 -> untouched


def test_snap_bbox_clamped_redirects_growth_at_the_edge():
    # Box sits flush against the left edge (x0=0): can't grow left, so the whole deficit
    # goes right instead of leaving the source.
    x0, y0, x1, y1 = _snap_bbox(0, 0, 10, 10, 16, 100, 100)
    assert x0 == 0 and x1 == 16
    assert y0 == 0 and y1 == 16


def test_region_box_crop_mode_stays_on_grid_and_in_bounds():
    x0, y0, x1, y1 = _region_box(region(0.0, 0.0, 0.1, 0.1), "Crop", 100, 100, "32")
    assert (x1 - x0) % 32 == 0 and (y1 - y0) % 32 == 0
    assert 0 <= x0 and x1 <= 100 and 0 <= y0 and y1 <= 100


def test_region_box_outpaint_mode_grid_snap_can_exceed_bounds():
    # A box already covering the whole 50x50 source, snapped to a 32 grid: 50 isn't a
    # multiple, so Outpaint mode is allowed to grow past the source to reach it. Crop mode
    # (previous test) never would.
    x0, y0, x1, y1 = _region_box(region(0.0, 0.0, 1.0, 1.0), "Outpaint", 50, 50, "32")
    assert (x1 - x0) % 32 == 0 and (y1 - y0) % 32 == 0
    assert x0 < 0 or x1 > 50 or y0 < 0 or y1 > 50


def test_execute_default_mode_is_crop_and_clamps():
    img = torch.rand(1, 10, 10, 3)
    out = NKDCrop.execute(img, region=region(-0.5, 0.0, 1.0, 1.0))  # mode defaults to "Crop"
    # Clamped to the source: no outpaint strip, so the whole output equals real content.
    assert out.args[3] == 10  # height unchanged
    assert torch.equal(out.args[1], torch.zeros_like(out.args[1]))  # nothing to generate


def test_execute_grid_aligned_crop_is_exact_pixels_not_resampled():
    """When the crop already lands on the grid, `_downscale` should be a no-op — the output
    must be the untouched source slice, not a resample of it."""
    img = torch.rand(1, 32, 32, 3)
    out = NKDCrop.execute(img, region=region(0.0, 0.0, 0.5, 0.5), mode="Crop",
                          divisible_by="8")
    assert out.args[0].shape == (1, 16, 16, 3)
    assert torch.equal(out.args[0], img[:, :16, :16, :])


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
