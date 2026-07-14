"""Self-check for the handle-based gradient position field. Pure python +
torch: python tests/test_gradient_generate.py"""
import json
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from nkd_color_ramp import (
    _DEFAULT_HANDLES,
    _parse_handles,
    _parse_interp,
    _position_field,
    _sample_ramp,
    _warp_position,
)


def demo():
    # Default handles parse to a full horizontal sweep, neutral midpoint
    p0, p1, mid = _parse_handles(_DEFAULT_HANDLES)
    assert p0 == (0.0, 0.5) and p1 == (1.0, 0.5) and mid == 0.5

    # Linear: full-width sweep hits exactly 0 and 1 at the edges
    t = _position_field("Linear", 4, 1, p0, p1, torch.device("cpu"))
    assert torch.allclose(t, torch.tensor([[0.0, 1 / 3, 2 / 3, 1.0]]), atol=1e-5)

    # Linear: dragging p0 to center clamps the left half to 0 (start of ramp)
    p0c, p1c, _ = _parse_handles(json.dumps({"p0": [0.5, 0.5], "p1": [1.0, 0.5]}))
    t = _position_field("Linear", 4, 1, p0c, p1c, torch.device("cpu"))
    assert t[0, 0].item() == 0.0 and t[0, 1].item() == 0.0  # left of p0, clamped
    assert abs(t[0, 3].item() - 1.0) < 1e-5                  # at p1, exactly 1

    # Radial: center->edge sets the radius; corners beyond it clamp to 1
    t = _position_field("Radial", 5, 5, p0c, p1c, torch.device("cpu"))
    assert t[2, 2].item() == 0.0             # at center
    assert t[0, 0].item() == 1.0             # far corner, clamped
    assert abs(t[2, 3].item() - 0.5) < 1e-5  # halfway to the edge point

    # Angular: full 0..1 sweep around the center
    t = _position_field("Angular", 9, 9, p0c, p1c, torch.device("cpu"))
    assert t.min().item() >= 0.0 and t.max().item() <= 1.0

    # Diamond: symmetric on a diagonal drag (p1 offset equally in x and y)
    p0d, p1d, _ = _parse_handles(json.dumps({"p0": [0.5, 0.5], "p1": [1.0, 1.0]}))
    t = _position_field("Diamond", 5, 5, p0d, p1d, torch.device("cpu"))
    assert t[2, 2].item() == 0.0
    assert abs(t[2, 2].item() - t[2, 2].item()) < 1e-6
    # Same L1 distance in either direction from center → same value
    assert abs(t[1, 2].item() - t[2, 1].item()) < 1e-5

    # Diamond degenerate case (perfectly horizontal drag) doesn't crash —
    # guarded by the epsilon floor on the near-zero axis.
    p0h, p1h, _ = _parse_handles(json.dumps({"p0": [0.5, 0.5], "p1": [1.0, 0.5]}))
    t = _position_field("Diamond", 5, 5, p0h, p1h, torch.device("cpu"))
    assert torch.isfinite(t).all()

    # Handles may sit OUTSIDE [0,1] (gradient terminates off-frame): p0/p1 are
    # not clamped, only the resulting position field is.
    p0o, p1o, _ = _parse_handles(json.dumps({"p0": [-0.2, 0.5], "p1": [1.2, 0.5]}))
    assert p0o == (-0.2, 0.5) and p1o == (1.2, 0.5)
    t = _position_field("Linear", 3, 1, p0o, p1o, torch.device("cpu"))
    assert t.min().item() >= 0.0 and t.max().item() <= 1.0  # field stays clamped

    # Midpoint warp: mid=0.5 is a no-op; a pixel at geometric fraction `mid`
    # samples the ramp's 0.5, and endpoints are fixed.
    lin = torch.linspace(0.0, 1.0, 11).view(1, 11)
    assert torch.allclose(_warp_position(lin, 0.5), lin)
    for m in (0.25, 0.7):
        w = _warp_position(torch.tensor([[0.0, m, 1.0]]), m)
        assert w[0, 0].item() == 0.0 and abs(w[0, 2].item() - 1.0) < 1e-6
        assert abs(w[0, 1].item() - 0.5) < 1e-5  # fraction `mid` -> ramp midpoint
    assert (_warp_position(lin, 0.25) >= lin - 1e-6).all()  # mid<0.5 advances the ramp

    # Interpolation modes: a mid-segment sample differs per mode.
    assert _parse_interp('{"interp":"bezier"}') == "bezier"
    assert _parse_interp('{"interp":"bogus"}') == "smooth"  # unknown -> default
    assert _parse_interp("not json") == "smooth"
    ramp = [(0.0, 0.0, 0.0, 0.0), (1.0, 1.0, 1.0, 1.0)]  # black -> white
    q = torch.tensor([0.25])
    lin = _sample_ramp(ramp, q, "smooth")[0, 0].item()
    bez = _sample_ramp(ramp, q, "bezier")[0, 0].item()
    stp = _sample_ramp(ramp, q, "steps")[0, 0].item()
    assert abs(lin - 0.25) < 1e-5           # linear passes through
    assert bez < lin                        # smoothstep eases in below the line
    assert stp == 0.0                       # hard: still the low (black) block
    # steps holds each stop's color to the right, last stop wins at t=1
    three = [(0.0, 0.0, 0.0, 0.0), (0.5, 0.5, 0.5, 0.5), (1.0, 1.0, 1.0, 1.0)]
    s = _sample_ramp(three, torch.tensor([0.49, 0.5, 1.0]), "steps")[:, 0]
    assert s[0].item() == 0.0 and s[1].item() == 0.5 and s[2].item() == 1.0

    # Malformed / missing handles fall back to the default sweep + neutral mid
    assert _parse_handles("not json") == ((0.0, 0.5), (1.0, 0.5), 0.5)
    assert _parse_handles('{"p0":[0,0.5]}') == ((0.0, 0.5), (1.0, 0.5), 0.5)  # missing p1

    print("gradient generate self-check OK")


if __name__ == "__main__":
    demo()
