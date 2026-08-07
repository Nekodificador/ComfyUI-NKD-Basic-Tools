"""Self-check for the spline-node rasterizer and blurs. Pure torch (runs on CPU):
python tests/test_blur_core.py"""
import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from blur_core import (NEUTRAL_REACH, flow_field, idw_field, img_blur,  # noqa: E402
                       line_blur, parse_items, path_samples,
                       pyramid_blur_lerp, ramp_offsets, ramp_rings, rasterize,
                       splat_field)

LEFT_HALF = [[0.0, 0.0], [0.5, 0.0], [0.5, 1.0], [0.0, 1.0]]


def demo():
    # --- rasterize -------------------------------------------------------
    # Half the frame is half the coverage. The boundary lands on a pixel edge,
    # so the only slack is PIL filling its last column inclusively.
    cov = rasterize([{"poly": LEFT_HALF, "op": "add"}], 100, 100)
    assert cov.shape == (100, 100), cov.shape
    assert abs(float(cov.sum()) - 5000.0) < 50.0, float(cov.sum())

    # Cutting out what was just added leaves only the antialiased seam.
    both = rasterize([{"poly": LEFT_HALF, "op": "add"},
                      {"poly": LEFT_HALF, "op": "sub"}], 100, 100)
    assert float(both.sum()) < 50.0, float(both.sum())

    # Degenerate shapes are skipped, not raised on.
    assert float(rasterize([{"poly": [[0.1, 0.1], [0.9, 0.9]]}], 32, 32).sum()) == 0.0

    # --- per-point feather -----------------------------------------------
    # `fo` is a per-vertex OFFSET, in output pixels: the editor places a clone of
    # the point by hand and resolves it onto every vertex, so all that happens
    # here is adding the vectors. Only the two vertices on the right edge are
    # pushed out — moving all four would be a translation, not a feather — so
    # that edge becomes a ramp and the other three stay hard. Total coverage
    # grows by about half the band (the profile averages ½ across it) and no
    # pixel exceeds 1.
    RIGHT_EDGE = [[0.0, 0.0], [20.0, 0.0], [20.0, 0.0], [0.0, 0.0]]
    soft = rasterize([{"poly": LEFT_HALF, "op": "add", "fo": RIGHT_EDGE}], 100, 100)
    assert float(soft.max()) <= 1.0 + 1e-5, float(soft.max())
    assert float(soft.sum()) > float(cov.sum()), (float(soft.sum()), float(cov.sum()))
    # Deep inside stays solid; well outside the band stays empty.
    assert float(soft[50, 20]) > 0.99, float(soft[50, 20])
    assert float(soft[50, 85]) < 0.01, float(soft[50, 85])
    # Across the feathered edge the coverage must fall monotonically.
    band = soft[50, 48:73]
    assert (band[1:] - band[:-1] <= 1e-3).all(), band
    # …and it must be SMOOTH, not a straight ramp. A linear falloff has a corner
    # in its slope at both ends, and that corner is exactly what the eye reads as
    # an edge — which is the thing feathering exists to remove. So the profile is
    # a smoothstep: flat where it meets the solid interior, flat where it dies
    # out, steepest in the middle.
    #
    # Measured on a bigger frame, because the test is about the shape of the
    # falloff and 20 px of band is too few samples to say anything about shape.
    wide_soft = rasterize([{"poly": LEFT_HALF, "op": "add",
                            "fo": [[0.0, 0.0], [60.0, 0.0],
                                   [60.0, 0.0], [0.0, 0.0]]}], 400, 400)
    prof = wide_soft[200, 200:262]
    slope = (prof[:-1] - prof[1:]).abs()
    n = len(slope)
    ends = float(torch.cat([slope[:n // 5], slope[-n // 5:]]).mean())
    middle = float(slope[2 * n // 5:3 * n // 5].mean())
    # A straight ramp would put this ratio at 1. A smoothstep is nowhere near it.
    assert ends < 0.55 * middle, (ends, middle)
    # A clone left sitting on its own point is no feather at all — the shape
    # comes back exactly as it was, which is what shift-clicking one away does.
    assert torch.allclose(
        rasterize([{"poly": LEFT_HALF, "fo": [[0.0, 0.0]] * 4}], 100, 100), cov)
    # A wrong-length fo is ignored rather than raising or half-applied.
    assert torch.allclose(rasterize([{"poly": LEFT_HALF, "fo": [[20.0, 0.0]]}], 100, 100), cov)

    # Each clone is placed on its own, so the softness varies ALONG an edge —
    # which is the thing a single width cannot express, and the reason the clone
    # is dragged rather than scrubbed. Wide at the top of the right edge, narrow
    # at the bottom.
    taper = rasterize([{"poly": LEFT_HALF, "op": "add",
                        "fo": [[0.0, 0.0], [40.0, 0.0],
                               [8.0, 0.0], [0.0, 0.0]]}], 100, 100)
    top = float((taper[5] > 0.02).sum())
    bot = float((taper[95] > 0.02).sum())
    assert top > bot + 15, (top, bot)

    # Dragging the clones INWARD softens inward instead of silently doing
    # nothing: the interior fades toward the edge and the outside stays empty.
    inward = rasterize([{"poly": LEFT_HALF, "op": "add",
                         "fo": [[0.0, 0.0], [-30.0, 0.0],
                                [-30.0, 0.0], [0.0, 0.0]]}], 100, 100)
    assert 0.2 < float(inward[50, 40]) < 0.8, float(inward[50, 40])
    assert float(inward[50, 10]) > 0.99, float(inward[50, 10])
    assert float(inward[50, 60]) < 0.01, float(inward[50, 60])
    # Ring count tracks the width, and is bounded at both ends.
    assert ramp_rings(0.0) == 2 and ramp_rings(1.0) == 2
    assert ramp_rings(30.0) == 30 and ramp_rings(9999.0) == 64

    # --- the shape-wide feather is CONTINUOUS -----------------------------
    # A box kernel must be an odd number of pixels to stay centred, so the widths
    # available are 1, 3, 5… and a radius used to snap to them: 4 and 5 gave the
    # same result and most of the feather slider's travel did nothing at all.
    # Blending the two kernels either side is what makes a fraction of a pixel a
    # real difference, which is the whole point of a fine-adjust drag.
    import mask_core  # noqa: E402  (same import dance as blur_core's)

    edge = torch.zeros(1, 96, 96)
    edge[:, :, :48] = 1.0
    radii = [1.0 + i / 20.0 for i in range(221)]          # 1.00 … 12.00 by 0.05
    outs = [mask_core.blur(edge.clone(), r) for r in radii]
    steps = [float((b - a).abs().mean()) for a, b in zip(outs, outs[1:])]
    assert all(s > 1e-9 for s in steps), \
        f"{sum(1 for s in steps if s <= 1e-9)} of {len(steps)} steps do nothing"
    # Monotone, and no kink where it crosses from one kernel pair to the next.
    # Measured as distance from the hard edge, NOT as the sum: a symmetric blur
    # conserves mass, so the sum barely moves and would call anything monotone.
    soft = [float((o - edge).abs().sum()) for o in outs]
    assert all(b >= a - 1e-4 for a, b in zip(soft, soft[1:])), "feather is not monotone"
    assert soft[-1] > 100.0, soft[-1]                     # and it does something
    assert max(steps) < 6.0 * (sum(steps) / len(steps)), \
        f"a step jumps far more than its neighbours: {max(steps)}"
    # The exact odd radii still take the single-pass path, unchanged.
    for k in (3, 5, 9):
        assert torch.allclose(mask_core.blur(edge.clone(), float(k)),
                              mask_core._box3(edge.clone(), k), atol=1e-6)
    # Below one pixel there is no kernel to build, and never was.
    assert torch.equal(mask_core.blur(edge.clone(), 0.4), edge)

    # --- ramp_offsets ----------------------------------------------------
    # Sorted, inside the band, and clustered toward the middle — that clustering
    # IS the smoothstep, since coverage is just the fraction of rings outside.
    off = ramp_offsets(16)
    assert len(off) == 16 and (np.diff(off) > 0).all(), off
    assert 0.0 < off[0] and off[-1] < 1.0, off
    assert abs(off.mean() - 0.5) < 1e-6, off.mean()          # symmetric
    gaps = np.diff(off)
    assert gaps[len(gaps) // 2] < gaps[0] * 0.6, gaps        # dense in the middle
    # Twin of rampOffsets in splineEval.ts — these two are the parity case, and
    # the same numbers are asserted there. smoothstep⁻¹(¼) = ½ - sin(10°).
    assert abs(ramp_offsets(1)[0] - 0.5) < 1e-12, ramp_offsets(1)
    assert abs(ramp_offsets(2)[0] - (0.5 - np.sin(np.pi / 18))) < 1e-12, ramp_offsets(2)

    # --- idw_field -------------------------------------------------------
    # A pin sits on a grid point at 101 samples, so that pixel is its own value.
    pins = torch.tensor([[0.5, 0.5], [0.0, 0.0]])
    field = idw_field(pins, torch.tensor([7.0, 1.0]), 101, 101)
    assert abs(float(field[50, 50]) - 7.0) < 1e-3, float(field[50, 50])
    assert abs(float(field[0, 0]) - 1.0) < 1e-3, float(field[0, 0])
    # One pin degenerates to a constant field.
    one = idw_field(torch.tensor([[0.3, 0.7]]), torch.tensor([2.5]), 16, 16)
    assert torch.allclose(one, torch.full_like(one, 2.5)), one

    # --- per-pin reach ---------------------------------------------------
    # Everything at the neutral reach is the plain weighting, unchanged.
    flat_reach = torch.full((2,), NEUTRAL_REACH)
    assert torch.allclose(idw_field(pins, torch.tensor([7.0, 1.0]), 65, 65, reach=flat_reach),
                          idw_field(pins, torch.tensor([7.0, 1.0]), 65, 65), atol=1e-5)
    # Widening the sharp pin pushes its value further out — the whole point:
    # a zero-blur pin can then hold a larger area against its neighbours.
    vals = torch.tensor([0.0, 1.0])
    near = idw_field(pins, vals, 65, 65, reach=flat_reach)
    wide = idw_field(pins, vals, 65, 65, reach=torch.tensor([1.0, NEUTRAL_REACH]))
    assert float(wide.mean()) < float(near.mean()), (float(wide.mean()), float(near.mean()))
    # …and each pin still owns its own location whatever the reaches are.
    assert abs(float(wide[32, 32])) < 1e-3, float(wide[32, 32])

    # --- splat_field -----------------------------------------------------
    # A sample landing exactly on a pixel deposits all its weight there.
    out = splat_field(torch.tensor([[3.0, 2.0]]), torch.tensor([[5.0, -5.0]]), 8, 8)
    assert out.shape == (3, 8, 8), out.shape
    assert abs(float(out[2, 2, 3]) - 1.0) < 1e-5, float(out[2, 2, 3])
    assert abs(float(out[0, 2, 3]) - 5.0) < 1e-5, float(out[0, 2, 3])
    # Half a pixel over, the weight splits evenly between the two columns.
    half = splat_field(torch.tensor([[3.5, 2.0]]), torch.tensor([[1.0]]), 8, 8)
    assert abs(float(half[1, 2, 3]) - 0.5) < 1e-5, float(half[1, 2, 3])
    assert abs(float(half[1].sum()) - 1.0) < 1e-5, float(half[1].sum())

    # --- img_blur --------------------------------------------------------
    # The mask twin clamps to [0,1]; this one must not.
    flat = torch.full((1, 3, 16, 16), 1.5)
    assert torch.allclose(img_blur(flat, 5), flat, atol=1e-5), img_blur(flat, 5).amax()
    # Channels stay independent (grouped conv, not a shared kernel).
    rgb = torch.zeros(1, 3, 16, 16)
    rgb[:, 1] = 1.0
    blurred = img_blur(rgb, 3)
    assert float(blurred[:, 0].abs().max()) < 1e-6, float(blurred[:, 0].abs().max())
    assert abs(float(blurred[:, 1].mean()) - 1.0) < 1e-5, float(blurred[:, 1].mean())

    # --- pyramid_blur_lerp ----------------------------------------------
    # Radius 0 is level 0 is the untouched image.
    img = torch.rand(1, 3, 32, 32)
    zero = pyramid_blur_lerp(img, torch.zeros(1, 1, 32, 32))
    assert torch.allclose(zero, img, atol=1e-6), (zero - img).abs().max()
    # Tent weights sum to 1, so a flat image keeps its value at any radius.
    flat = torch.full((1, 3, 48, 48), 0.4)
    for r in (1.0, 3.0, 7.0, 30.0, 200.0):
        got = pyramid_blur_lerp(flat, torch.full((1, 1, 48, 48), r))
        assert torch.allclose(got, flat, atol=1e-4), (r, float(got.mean()))

    # --- line_blur -------------------------------------------------------
    # No flow is no change.
    still = line_blur(img, torch.zeros(1, 2, 32, 32), 9)
    assert torch.allclose(still, img, atol=1e-5), (still - img).abs().max()
    # A horizontal sweep smears horizontally and leaves columns constant.
    stripe = torch.zeros(1, 1, 16, 16)
    stripe[..., 8] = 1.0                     # one bright column
    flow = torch.zeros(1, 2, 16, 16)
    flow[:, 0] = 6.0                         # 6 px along x
    smeared = line_blur(stripe, flow, 13)
    assert float(smeared[0, 0, :, 8].std()) < 1e-6, float(smeared[0, 0, :, 8].std())
    assert float(smeared.max()) < 0.5, float(smeared.max())
    assert abs(float(smeared.sum()) - float(stripe.sum())) < 0.5, float(smeared.sum())

    # --- parse_items -----------------------------------------------------
    # A mangled widget value must read as "nothing drawn", never raise.
    assert parse_items("", "shapes") == []
    assert parse_items("not json at all", "shapes") == []
    assert parse_items('{"v":1}', "shapes") == []
    assert parse_items('{"shapes":[{"op":"add"}]}', "shapes") == [{"op": "add"}]

    # --- path_samples ----------------------------------------------------
    # A horizontal stroke across half a 200px frame: ~100 samples, unit +x.
    horiz = [{"poly": [[0.25, 0.5], [0.75, 0.5]], "speed": 1.0}]
    pos, val = path_samples(horiz, 200, 200)
    assert 99 <= len(pos) <= 102, len(pos)
    assert abs(val[:, 0].mean() - 1.0) < 1e-6, val[:, 0].mean()
    assert abs(val[:, 1].mean()) < 1e-6, val[:, 1].mean()
    # Per-vertex speed rides the polyline: same stroke, 0 at one end and 2 at
    # the other, so the mean is unchanged but the two halves are not.
    ramped = path_samples([{"poly": [[0.25, 0.5], [0.75, 0.5]], "speed": 1.0,
                            "sv": [0.0, 2.0]}], 200, 200)[1]
    assert abs(ramped[:, 2].mean() - 1.0) < 0.02, ramped[:, 2].mean()
    assert ramped[0, 2] < 0.05 and ramped[-1, 2] > 1.95, (ramped[0, 2], ramped[-1, 2])
    # It multiplies the stroke's own speed rather than replacing it.
    doubled = path_samples([{"poly": [[0.25, 0.5], [0.75, 0.5]], "speed": 2.0,
                             "sv": [1.0, 1.0]}], 200, 200)[1]
    assert abs(doubled[:, 2].mean() - 2.0) < 1e-6, doubled[:, 2].mean()
    # A wrong-length sv is ignored, not half-applied.
    assert abs(path_samples([{"poly": [[0.25, 0.5], [0.75, 0.5]], "sv": [3.0]}],
                            200, 200)[1][:, 2].mean() - 1.0) < 1e-6
    # Degenerate strokes drop out instead of producing NaNs.
    assert path_samples([{"poly": [[0.5, 0.5]]}], 200, 200)[0] is None
    assert path_samples([{"poly": [[0, 0], [1, 1]], "speed": 0.0}], 200, 200)[0] is None

    # --- flow_field ------------------------------------------------------
    d, sp, conf = flow_field(horiz, 128, 128, 0.15)
    assert d.shape == (1, 2, 128, 128) and conf.shape == (1, 1, 128, 128)
    assert torch.isfinite(d).all() and torch.isfinite(conf).all()
    # On the stroke: pointing along +x, full speed, full confidence.
    assert abs(float(d[0, 0, 64, 64]) - 1.0) < 0.05, float(d[0, 0, 64, 64])
    assert abs(float(sp[0, 0, 64, 64]) - 1.0) < 0.05, float(sp[0, 0, 64, 64])
    assert float(conf[0, 0, 64, 64]) > 0.9, float(conf[0, 0, 64, 64])
    # The far corner is what the pyramid exists for: still a finite unit
    # direction (no division blow-up) but confidence has decayed to nothing.
    assert abs(float(d[0, :, 0, 0].norm()) - 1.0) < 1e-3, float(d[0, :, 0, 0].norm())
    assert float(conf[0, 0, 0, 0]) < 0.15, float(conf[0, 0, 0, 0])
    # Reversing the stroke reverses the field.
    back = flow_field([{"poly": [[0.75, 0.5], [0.25, 0.5]], "speed": 1.0}], 128, 128, 0.15)
    assert float(back[0][0, 0, 64, 64]) < -0.9, float(back[0][0, 0, 64, 64])
    assert flow_field([], 64, 64, 0.15) is None

    print("blur_core ok")


if __name__ == "__main__":
    demo()
