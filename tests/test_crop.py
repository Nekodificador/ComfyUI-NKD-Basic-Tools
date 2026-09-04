"""Checks for NKD Crop / Outpaint's crop+pad math. Plain asserts, no framework.

    python tests/test_crop.py
"""

import json
import os
import sys

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PACK)
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))

import math

import comfy.utils as comfy_utils  # noqa: E402
import torch  # noqa: E402

from nkd_crop import (  # noqa: E402
    NKDCrop, _contain_rotated_bbox, _crop_pad, _crop_pad_mask, _crop_pad_rotated, _parse_angle,
    _parse_region, _region_box, _snap_bbox, _snap_bbox_rotated, _uncrop_manual,
)


def rotated_bounds(x0, y0, x1, y1, angle):
    """Test helper: the rotated box's own axis-aligned bounding extent."""
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    theta = math.radians(angle)
    cos_a, sin_a = math.cos(theta), math.sin(theta)
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    rx = [cx + (px - cx) * cos_a - (py - cy) * sin_a for px, py in corners]
    ry = [cy + (px - cx) * sin_a + (py - cy) * cos_a for px, py in corners]
    return min(rx), max(rx), min(ry), max(ry)


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
    x0, y0, x1, y1, angle = _region_box(region(0.0, 0.0, 0.1, 0.1), "Crop", 100, 100, "32")
    assert angle == 0.0
    assert (x1 - x0) % 32 == 0 and (y1 - y0) % 32 == 0
    assert 0 <= x0 and x1 <= 100 and 0 <= y0 and y1 <= 100


def test_region_box_outpaint_mode_grid_snap_can_exceed_bounds():
    # A box already covering the whole 50x50 source, snapped to a 32 grid: 50 isn't a
    # multiple, so Outpaint mode is allowed to grow past the source to reach it. Crop mode
    # (previous test) never would.
    x0, y0, x1, y1, _angle = _region_box(region(0.0, 0.0, 1.0, 1.0), "Outpaint", 50, 50, "32")
    assert (x1 - x0) % 32 == 0 and (y1 - y0) % 32 == 0
    assert x0 < 0 or x1 > 50 or y0 < 0 or y1 > 50


def test_execute_default_mode_is_crop_and_clamps():
    img = torch.rand(1, 10, 10, 3)
    out = NKDCrop.execute(img, region=region(-0.5, 0.0, 1.0, 1.0))  # mode defaults to "Crop"
    # Clamped to the source: no outpaint strip, so the whole output equals real content.
    assert out.args[3] == 10  # height unchanged
    assert torch.equal(out.args[1], torch.zeros_like(out.args[1]))  # nothing to generate


def test_execute_grid_aligned_crop_is_exact_pixels_not_resampled():
    """When the crop already lands on the grid, `_resize_to_budget` should be a no-op — the
    output must be the untouched source slice, not a resample of it."""
    img = torch.rand(1, 32, 32, 3)
    out = NKDCrop.execute(img, region=region(0.0, 0.0, 0.5, 0.5), mode="Crop",
                          divisible_by="8")
    assert out.args[0].shape == (1, 16, 16, 3)
    assert torch.equal(out.args[0], img[:, :16, :16, :])


def test_execute_max_megapixels_scales_a_small_crop_up_too():
    """Not just a downscale cap — a crop smaller than the target has to reach it too."""
    img = torch.rand(1, 16, 16, 3)
    out = NKDCrop.execute(img, region="", max_megapixels=1.0)   # 16x16 -> ~1024x1024
    h, w = out.args[0].shape[1], out.args[0].shape[2]
    assert h * w > 16 * 16 * 4          # genuinely upscaled, not left alone
    assert abs(h * w - 1024 * 1024) < 1024 * 32   # lands close to the 1MP target


def test_execute_resize_method_is_honoured_for_the_image_but_masks_stay_bilinear():
    real = comfy_utils.common_upscale
    calls = []

    def spy(samples, w, h, mode, crop):
        calls.append(mode)
        return real(samples, w, h, mode, crop)

    comfy_utils.common_upscale = spy
    try:
        img = torch.rand(1, 16, 16, 3)
        NKDCrop.execute(img, region="", max_megapixels=1.0, resize_method="nearest-exact")
    finally:
        comfy_utils.common_upscale = real
    assert "nearest-exact" in calls   # the image resize used the requested filter
    assert "bilinear" in calls        # the mask resize never does, regardless of the setting


# ── Rotation ─────────────────────────────────────────────────────────────────

def test_parse_angle_defaults_to_zero():
    assert _parse_angle("") == 0.0
    assert _parse_angle("not json") == 0.0
    assert _parse_angle(region(0, 0, 1, 1)) == 0.0   # no angle key at all


def test_parse_angle_reads_the_field():
    r = json.dumps({"x": 0, "y": 0, "w": 1, "h": 1, "angle": 42.5})
    assert _parse_angle(r) == 42.5


def test_snap_bbox_rotated_grows_centered_with_no_clamp():
    x0, y0, x1, y1 = _snap_bbox_rotated(0, 0, 10, 10, 16)
    assert (x1 - x0) == 16 and (y1 - y0) == 16
    # Centered on the original box (center at 5,5): grows symmetrically past 0 — exactly
    # what the axis-aligned, edge-clamped `_snap_bbox` would never do.
    assert x0 < 0 and y0 < 0


def test_crop_pad_dispatches_to_the_rotated_path_for_nonzero_angle():
    img = torch.rand(1, 20, 20, 3)
    straight, _m = _crop_pad(img, 5, 5, 15, 15, "black", "#000000", angle=0.0)
    rotated, _m2 = _crop_pad(img, 5, 5, 15, 15, "black", "#000000", angle=45.0)
    assert straight.shape == rotated.shape == (1, 10, 10, 3)
    assert not torch.equal(straight, rotated)


def test_crop_pad_rotated_at_zero_angle_matches_the_exact_slice():
    # Always resamples (no exact-pixel fast path here), so allow bilinear-sized tolerance.
    img = torch.rand(1, 20, 20, 3)
    exact, _m = _crop_pad(img, 5, 5, 15, 15, "black", "#000000")
    rotated, _m2 = _crop_pad_rotated(img, 5, 5, 15, 15, 0.0, "black", "#000000")
    assert torch.allclose(exact, rotated, atol=0.05)


def test_crop_pad_rotated_fully_inside_has_no_generate_mask():
    img = torch.rand(1, 100, 100, 3)
    _out, mask = _crop_pad_rotated(img, 30, 30, 70, 70, 30.0, "edge", "#000000")
    assert mask.max().item() < 1e-6


def test_crop_pad_rotated_flat_fill_entirely_outside_source():
    img = torch.zeros(1, 10, 10, 3)
    out, mask = _crop_pad_rotated(img, -20, -20, -10, -10, 0.0, "color", "#ff0000")
    assert torch.all(mask == 1.0)
    assert torch.allclose(out[..., 0], torch.tensor(1.0))
    assert torch.allclose(out[..., 1], torch.tensor(0.0))


# ── Stitch ───────────────────────────────────────────────────────────────────

def test_uncrop_manual_pastes_the_patch_back_at_the_original_box():
    bg = torch.zeros(1, 40, 40, 3)
    patch = torch.ones(1, 10, 10, 3)
    out = _uncrop_manual(patch, bg, (15, 15, 25, 25), 0.0, feather=0, hardness=0.0)
    assert torch.allclose(out[:, 15:25, 15:25, :], torch.ones(1, 10, 10, 3), atol=0.02)
    assert torch.allclose(out[:, 0:15, 0:15, :], torch.zeros(1, 15, 15, 3))


def test_uncrop_manual_feather_only_erodes_inward_never_bleeds_outside():
    """The bug Neko hit: `_mask_grow`'s blur is symmetric, so it used to soften alpha PAST
    the patch's true edge too — and out there `warped` is pure black (grid_sample's
    `padding_mode="zeros"`, no real content), so a big feather painted a black frame around
    the pasted area. Feather must only erode the patch's OWN edge inward."""
    bg = torch.full((1, 40, 40, 3), 0.5)   # mid-gray, distinguishable from the black bleed
    patch = torch.ones(1, 10, 10, 3)
    out = _uncrop_manual(patch, bg, (15, 15, 25, 25), 0.0, feather=8, hardness=0.0)
    # Well outside the patch box, even with an 8px feather: exactly the background, not a
    # black-tinted blend.
    assert torch.allclose(out[:, 5, 5, :], bg[:, 5, 5, :], atol=1e-4)
    assert torch.allclose(out[:, 35, 35, :], bg[:, 35, 35, :], atol=1e-4)
    # The feather still does something — softens near the INSIDE of the patch edge.
    assert out[:, 20, 15, :].mean().item() < 0.99


def test_crop_then_uncrop_round_trips_at_an_angle():
    # A box rotated 30 degrees, comfortably inside the source: crop it out and paste it
    # straight back — it has to reproduce the original content, up to the blur two
    # round-trip bilinear warps pick up. A SMOOTH gradient, not independent random noise:
    # with per-pixel noise, even the sub-pixel offset between "the nearest patch pixel" and
    # "the true box center" (there is no exact center pixel in a 40-wide array) samples an
    # uncorrelated value and fails for a reason that has nothing to do with the rotation
    # math — caught chasing a false "bug" here before switching the fixture.
    H = W = 80
    ys = torch.linspace(0, 1, H).view(H, 1).expand(H, W)
    xs = torch.linspace(0, 1, W).view(1, W).expand(H, W)
    img = torch.stack([xs, ys, (xs + ys) / 2], dim=-1).unsqueeze(0)
    x0, y0, x1, y1 = 20, 20, 60, 60
    angle = 30.0
    patch, _mask = _crop_pad_rotated(img, x0, y0, x1, y1, angle, "edge", "#000000")
    out = _uncrop_manual(patch, img.clone(), (x0, y0, x1, y1), angle, feather=0, hardness=0.0)
    diff = (out[:, y0:y1, x0:x1, :] - img[:, y0:y1, x0:x1, :]).abs().mean().item()
    assert diff < 0.02


def test_execute_produces_crop_data_for_image_none_for_mask():
    img = torch.rand(1, 16, 16, 3)
    out_img = NKDCrop.execute(img, region="")
    assert out_img.args[4] is not None
    assert out_img.args[4].crop_box == (0, 0, 16, 16)
    assert out_img.args[4].angle == 0.0

    m = torch.rand(1, 16, 16)
    out_mask = NKDCrop.execute(m, region="")
    assert out_mask.args[4] is None


# ── Crop mode containment (rotated) ──────────────────────────────────────────

def test_contain_rotated_bbox_pulls_an_overflowing_box_back_in():
    # A box already spanning nearly the whole 100x100 source: rotating it 30 degrees pushes
    # its footprint well past the edges. Containment must translate/shrink it back inside.
    x0, y0, x1, y1 = _contain_rotated_bbox(5, 5, 95, 95, 30.0, 100, 100)
    min_x, max_x, min_y, max_y = rotated_bounds(x0, y0, x1, y1, 30.0)
    # The final round() to integer pixels is where this tolerance comes from, not slop in
    # the fit itself — four independently-rounded coordinates re-entering a rotation can
    # land a touch past the 0.999 safety factor already baked into the fit.
    assert min_x >= -1.5 and max_x <= 101.5
    assert min_y >= -1.5 and max_y <= 101.5


def test_contain_rotated_bbox_leaves_a_comfortably_inside_box_untouched():
    x0, y0, x1, y1 = _contain_rotated_bbox(30, 30, 70, 70, 45.0, 100, 100)
    assert (x0, y0, x1, y1) == (30, 30, 70, 70)


def test_region_box_crop_mode_rotated_grid_snap_stays_contained():
    """The bug Neko hit: `_snap_bbox_rotated` only GROWS the box (no clamp), so a Crop-mode
    crop that only needed grid alignment could come back out of bounds again after snapping
    — the editor showed a contained box, and the render silently disagreed with it. Stitching
    an unprocessed patch back then pastes that box's own edge fill as a visible frame."""
    x0, y0, x1, y1, angle = _region_box(
        json.dumps({"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.9, "angle": 20.0}),
        "Crop", 200, 200, "32")
    assert angle == 20.0
    min_x, max_x, min_y, max_y = rotated_bounds(x0, y0, x1, y1, angle)
    assert min_x >= -1.5 and max_x <= 201.5
    assert min_y >= -1.5 and max_y <= 201.5


def test_execute_crop_mode_rotated_with_grid_snap_never_pastes_a_fill_border():
    """End-to-end version of the same bug: crop then stitch an UNPROCESSED patch back (as
    if the user tested the round-trip, or a generation step left part of it untouched) and
    the result must equal the original image — no visible frame from a fill sliver the
    editor never showed. A smooth gradient, not independent noise: see
    test_crop_then_uncrop_round_trips_at_an_angle for why noise gives a false failure here."""
    H = W = 200
    ys = torch.linspace(0, 1, H).view(H, 1).expand(H, W)
    xs = torch.linspace(0, 1, W).view(1, W).expand(H, W)
    img = torch.stack([xs, ys, (xs + ys) / 2], dim=-1).unsqueeze(0)
    region = json.dumps({"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.9, "angle": 20.0})
    out = NKDCrop.execute(img, region=region, mode="Crop", divisible_by="32")
    patch, crop_data = out.args[0], out.args[4]
    stitched = _uncrop_manual(patch, img.clone(), crop_data.crop_box, crop_data.angle,
                              feather=0, hardness=0.0)
    # Mean, not a per-pixel allclose: a sharp (feather=0) rotated edge always aliases by up
    # to a pixel right AT the boundary line — real, and irrelevant to the bug this test
    # guards (a whole extra border of fill colour, which would blow up the MEAN, not one
    # boundary pixel).
    assert (stitched - img).abs().mean().item() < 0.01


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
