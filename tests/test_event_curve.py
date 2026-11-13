"""Self-check for NKD Event Curve. Run with ComfyUI's python:

    cd <ComfyUI>  &&  python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_event_curve.py
"""
import importlib
import os
import sys
import types

import torch

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_HERE)))   # <ComfyUI>
_pkg = types.ModuleType("nkdbt")          # the node imports `.nkd_curves` for the drawn curve
_pkg.__path__ = [_HERE]
sys.modules["nkdbt"] = _pkg
ec = importlib.import_module("nkdbt.nkd_event_curve")
SR = ec.SAMPLE_RATE


def rms_blocks(audio, blocks):
    mono = audio["waveform"][0, 0]
    n = mono.numel() // blocks
    return mono[: n * blocks].reshape(blocks, n).pow(2).mean(1).sqrt()


def run(**kw):
    args = dict(guide="F Guide", shape="square", cycles=2.0, phase=0.0, length=141, fps=24.0, strength=0.5)
    args.update(kw)
    return ec.NKDEventCurveAudio.execute(**args).result[0]


def peak_hz(wave):
    return torch.fft.rfft(wave).abs().argmax().item() * SR / wave.numel()


ec.NKDEventCurveAudio.define_schema()

# every periodic shape starts low and stays in 0..1
for shape in ec.SHAPES[1:]:
    c = ec.shape_curve(shape, 3.0, 0.0, 3000)
    assert c.min() >= 0 and c.max() <= 1 and c[0] < 0.01, shape

# clip length and layout: 141 frames at 24 fps, stereo, batch of one - for every guide
for guide in ec.GUIDES:
    a = run(guide=guide)
    assert a["sample_rate"] == SR and tuple(a["waveform"].shape) == (1, 2, round(141 / 24 * SR)), guide
    assert a["waveform"].abs().max() <= 1 and a["waveform"].abs().max() > 0.05, guide
assert run(strength=0.0)["waveform"].abs().max() == 0

# F: square x2 - quarters of the clip are silent, loud, silent, loud; phase 0.5 swaps them
q = rms_blocks(run(), 4)
assert q[0] < 0.01 and q[2] < 0.01 and q[1] > 0.1 and q[3] > 0.1, q
q = rms_blocks(run(phase=0.5), 4)
assert q[0] > 0.1 and q[1] < 0.01, q

# P: one dry hit per rise, then silence even though the curve is still on
w = run(guide="P Guide")["waveform"][0, 0]                 # square x2: rises at 1/4 and 3/4
n = w.numel()
for rise in (n // 4, 3 * n // 4):
    assert w[rise:rise + SR // 20].abs().max() > 0.3, rise
    assert w[rise + SR // 2:rise + SR].abs().max() < 0.01, rise     # dry: gone half a second later
assert w[: n // 4 - 10].abs().max() < 1e-6

# B: same rises, but each rings for as long as the curve stays on
w = run(guide="B Guide")["waveform"][0, 0]
assert w[n // 4 + SR // 2:n // 4 + SR].abs().max() > 0.02            # still ringing
assert w[: n // 4 - 10].abs().max() < 1e-6

# P reads any curve as on/off: a sine x2 is above half from 1/8 and from 5/8 of the clip
w = run(guide="P Guide", shape="sine")["waveform"][0, 0]
for rise in (n // 8, 5 * n // 8):
    assert w[rise - 50:rise + SR // 20].abs().max() > 0.3 and w[rise - SR // 4:rise - 50].abs().max() < 0.01, rise

# M: louder and higher as the curve rises
lo = ec.guide_audio(torch.full((100,), 0.25), 1.0, "M Guide", 0.5)[0, 0]
hi = ec.guide_audio(torch.full((100,), 1.0), 1.0, "M Guide", 0.5)[0, 0]
assert hi.pow(2).mean() > 4 * lo.pow(2).mean()
assert abs(peak_hz(lo) - ec.MOTOR_HZ * 2 ** 0.5) < 3 and abs(peak_hz(hi) - ec.MOTOR_HZ * 4) < 3, (peak_hz(lo), peak_hz(hi))

def centroid(wave):
    s = torch.fft.rfft(wave).abs().pow(2)
    return (s * torch.fft.rfftfreq(wave.numel(), 1 / SR)).sum().item() / s.sum().item()


# U: a high warble that climbs with the curve
lo = ec.guide_audio(torch.full((100,), 0.2), 2.0, "U Guide", 0.5)[0, 0]
hi = ec.guide_audio(torch.full((100,), 1.0), 2.0, "U Guide", 0.5)[0, 0]
assert 1000 < centroid(lo) < centroid(hi), (centroid(lo), centroid(hi))

# W: muffled (nothing much above 1.5 kHz) and chopped into syllables, not a steady drone
w = ec.guide_audio(torch.ones(100), 3.0, "W Guide", 0.5)[0, 0]
s = torch.fft.rfft(w).abs().pow(2)
assert s[torch.fft.rfftfreq(w.numel(), 1 / SR) > 1500].sum() < 0.01 * s.sum()
blocks = rms_blocks({"waveform": w.reshape(1, 1, -1)}, 60)          # 50 ms
assert blocks.max() > 4 * blocks.median().clamp(min=1e-4) or (blocks < 0.2 * blocks.max()).sum() > 10, blocks


def syllables(level):
    b = rms_blocks({"waveform": ec.guide_audio(torch.full((100,), level), 4.0, "W Guide", 0.5)}, 400)   # 10 ms
    on = b > 0.3 * b.max()
    return int((on[1:] & ~on[:-1]).sum())


# ...and the higher the curve, the faster the words come
slow, fast = syllables(0.4), syllables(1.0)
assert fast > 1.6 * slow, (slow, fast)

# audio source: the guide is loud where the source is loud
src = torch.zeros(1, 1, 48000 * 6)
src[..., 48000 * 2: 48000 * 3] = torch.randn(48000)
q = rms_blocks(run(source={"waveform": src, "sample_rate": 48000}), 47)   # 0.125 s blocks
assert q[:15].max() < 0.02 and q[17:23].min() > 0.1 and q[25:].max() < 0.02, q

# ...and the editor gets that same curve back to draw
ui = ec.NKDEventCurveAudio.execute(guide="P Guide", shape="custom", cycles=2.0, phase=0.0, length=141, fps=24.0,
                                   strength=0.5, source={"waveform": src, "sample_rate": 48000}).ui["nkd_curve"]
assert len(ui) == ec.UI_SAMPLES and set(ui) == {0.0, 1.0}          # P reads it as on/off
assert ui[50] == 0 and ui[125] == 1 and ui[200] == 0, (ui[50], ui[125], ui[200])

# video source: the guide is loud where the picture moves
frames = torch.zeros(141, 32, 32, 3)
frames[60:70] = torch.rand(10, 32, 32, 3)
q = rms_blocks(run(source=frames), 47)
assert q[:18].max() < 0.02 and q[21:23].min() > 0.05 and q[26:].max() < 0.02, q

# custom, smooth: a single bump drawn in the middle is loud in the middle and silent at both ends
BUMP = '{"points": [[0, 0], [0.4, 0], [0.5, 1], [0.6, 0], [1, 0]]}'
q = rms_blocks(run(shape="custom", curve=BUMP), 10)
assert q[0] < 0.01 and q[9] < 0.01 and q[4] > 0.05 and q[5] > 0.05, q
# a corner is reached exactly and joined by straight lines; the smooth point only pulls the curve
sharp = ec.custom_curve('{"points": [[0, 0], [0.5, 1, 1], [1, 0]]}', 1001)
smooth = ec.custom_curve('{"points": [[0, 0], [0.5, 1], [1, 0]]}', 1001)
assert sharp[500] > 0.99 and abs(sharp[250] - 0.5) < 0.01, (sharp[500], sharp[250])
assert smooth[500] < 0.6, smooth[500]
# custom, on/off: each point holds its level until the next one
steps = ec.custom_curve('{"points": [[0, 0], [0.2, 1], [0.3, 0.2], [0.7, 0.9], [1, 0]]}', 1001, binary=True)
assert set(steps.tolist()) <= {0.0, 1.0}
assert steps[100] == 0 and steps[250] == 1 and steps[500] == 0 and steps[800] == 1 and steps[1000] == 0
# a broken curve string falls back to silence instead of failing the run
assert run(shape="custom", curve="not json")["waveform"].abs().max() == 0

# preview: one frame per video frame, and the yellow playhead travels left to right
pv = ec.NKDEventCurveAudio.execute(guide="F Guide", shape="sine", cycles=2.0, phase=0.0, length=30, fps=24.0,
                                   strength=0.5, preview_width=320, preview_height=96).result[1]
assert tuple(pv.shape) == (30, 96, 320, 3) and 0 <= pv.min() and pv.max() <= 1, pv.shape
yellow = (pv[..., 0] > 0.9) & (pv[..., 2] < 0.5)                  # #ffd166 against a blue plot
cols = [yellow[f].any(0).nonzero().float().mean().item() for f in (0, 15, 29)]
assert cols[0] < 20 and 140 < cols[1] < 180 and cols[2] > 300, cols
assert not torch.equal(pv[0], pv[29])

if __name__ == "__main__":
    print("event curve: ok")
