"""Self-check for the spline-node rasterizer and blurs. Pure torch (runs on CPU):
python tests/test_blur_core.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from blur_core import (flow_field, idw_field, img_blur, line_blur,  # noqa: E402
                       parse_items, path_samples, pyramid_blur_lerp, rasterize,
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

    # --- idw_field -------------------------------------------------------
    # A pin sits on a grid point at 101 samples, so that pixel is its own value.
    pins = torch.tensor([[0.5, 0.5], [0.0, 0.0]])
    field = idw_field(pins, torch.tensor([7.0, 1.0]), 101, 101)
    assert abs(float(field[50, 50]) - 7.0) < 1e-3, float(field[50, 50])
    assert abs(float(field[0, 0]) - 1.0) < 1e-3, float(field[0, 0])
    # One pin degenerates to a constant field.
    one = idw_field(torch.tensor([[0.3, 0.7]]), torch.tensor([2.5]), 16, 16)
    assert torch.allclose(one, torch.full_like(one, 2.5)), one

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
