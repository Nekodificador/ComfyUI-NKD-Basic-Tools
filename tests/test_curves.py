"""Checks for NKD Curves. Plain asserts, no framework.

    python tests/test_curves.py
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

from nkdbt.nkd_curves import NKDCurves, _DEFAULT_CURVES, curve_lut, parse_curves  # noqa: E402


def test_identity():
    img = torch.rand(2, 16, 16, 4)
    out = NKDCurves.execute(img, _DEFAULT_CURVES).args[0]
    assert torch.allclose(out, img, atol=1e-5)


def test_no_belly():
    # The case that bellies out with an interpolating spline: the curve must stay
    # inside the control polygon, never sag below it.
    pts = [(0.0, 0.03), (0.92, 0.83), (1.0, 1.0)]
    lut = curve_lut(pts, 1001)
    for j, y in enumerate(lut):
        x = j / 1000
        poly = (0.03 + x / 0.92 * 0.80) if x <= 0.92 else (0.83 + (x - 0.92) / 0.08 * 0.17)
        assert y >= poly - 1e-6, (x, y, poly)
    assert abs(lut[0] - 0.03) < 1e-6 and abs(lut[-1] - 1.0) < 1e-6
    assert all(b >= a - 1e-9 for a, b in zip(lut, lut[1:]))


def test_flat_beyond_endpoints():
    lut = curve_lut([(0.2, 0.3), (0.8, 0.7)], 101)
    assert all(abs(v - 0.3) < 1e-6 for v in lut[:21])
    assert all(abs(v - 0.7) < 1e-6 for v in lut[80:])


def test_channel_then_master():
    curves = json.dumps({"rgb": [[0, 0], [1, 0.5]], "r": [[0, 1], [1, 0]],
                         "g": [[0, 0], [1, 1]], "b": [[0, 0], [1, 1]]})
    img = torch.zeros(1, 2, 2, 3)
    out = NKDCurves.execute(img, curves).args[0]
    assert torch.allclose(out[0, 0, 0], torch.tensor([0.5, 0.0, 0.0]), atol=1e-4)


def test_mask_confines():
    curves = json.dumps({"rgb": [[0, 1], [1, 1]]})
    img = torch.zeros(1, 4, 4, 3)
    mask = torch.zeros(1, 4, 4)
    mask[:, :, 2:] = 1.0
    out = NKDCurves.execute(img, curves, mask).args[0]
    assert out[0, :, :2].max() == 0 and out[0, :, 2:].min() > 0.999


def test_bad_json_falls_back():
    assert parse_curves("nope")["rgb"] == [(0.0, 0.0, False), (1.0, 1.0, False)]
    assert parse_curves('{"r": [[0.5, 0.5]]}')["r"] == [(0.0, 0.0, False), (1.0, 1.0, False)]


def test_corner_hits_its_point():
    smooth = curve_lut([(0, 0), (0.5, 0.8), (1, 1)], 1001)
    corner = curve_lut(parse_curves('{"rgb": [[0, 0], [0.5, 0.8, 1], [1, 1]]}')["rgb"], 1001)
    assert abs(corner[500] - 0.8) < 1e-3 and smooth[500] < 0.75
    # straight segments either side of the kink
    assert abs(corner[250] - 0.4) < 1e-3 and abs(corner[750] - 0.9) < 1e-3


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
