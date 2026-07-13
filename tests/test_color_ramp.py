"""Self-check for the shared color-ramp sampler. Pure python + torch:
python tests/test_color_ramp.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from nkd_color_ramp import _DEFAULT_RAMP, _hex_to_rgb, _parse_ramp, _sample_ramp


def demo():
    # Default ramp parses to black->white
    stops = _parse_ramp(_DEFAULT_RAMP)
    assert stops == [(0.0, 0.0, 0.0, 0.0), (1.0, 1.0, 1.0, 1.0)]

    # Identity sampling: black->white ramp reproduces luminance as gray
    t = torch.tensor([0.0, 0.25, 0.5, 1.0])
    out = _sample_ramp(stops, t)
    assert torch.allclose(out, t.unsqueeze(-1).expand(-1, 3), atol=1e-5)

    # 3-stop midpoint: red(0)->green(0.5)->blue(1), sample at 0.25 = red/green mix
    custom = '{"stops":[{"pos":0.0,"color":"#ff0000"},' \
             '{"pos":0.5,"color":"#00ff00"},{"pos":1.0,"color":"#0000ff"}]}'
    stops2 = _parse_ramp(custom)
    mid = _sample_ramp(stops2, torch.tensor([0.25]))
    assert torch.allclose(mid, torch.tensor([[0.5, 0.5, 0.0]]), atol=1e-5)

    # Out-of-range positions clamp to the end stops
    clamped = _sample_ramp(stops2, torch.tensor([-1.0, 2.0]))
    assert torch.allclose(clamped[0], torch.tensor([1.0, 0.0, 0.0]))
    assert torch.allclose(clamped[1], torch.tensor([0.0, 0.0, 1.0]))

    # Malformed JSON falls back to the default ramp
    assert _parse_ramp("not json") == stops
    assert _parse_ramp('{"stops":[{"pos":0.5,"color":"#123456"}]}') == stops  # <2 stops

    # Hex parsing
    assert _hex_to_rgb("#ff8000") == (1.0, 128 / 255, 0.0)

    # Works on arbitrary-shape tensors (e.g. an [H, W] luminance field)
    field = torch.rand(4, 6)
    out2 = _sample_ramp(stops, field)
    assert out2.shape == (4, 6, 3)

    print("color ramp self-check OK")


if __name__ == "__main__":
    demo()
