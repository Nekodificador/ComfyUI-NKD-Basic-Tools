"""NKD Event Curve — draw *when* things happen in a generated video.

Joint audio+video models line the picture up with their audio guide. This node
turns a timing curve into such a guide: anchor its output at frame 0
(`Add Guide for MiniMax H3`, or a slot of `NKD MiniMax Guides`) and the event
the prompt names lands where the curve is high, with no word about sound in the
prompt. Nobody using it has to know a sound is involved; they pick the kind of
action and draw.

The guide preset picks both the sound and how the curve is read:

  P Guide  punch   a dry thump on every rise of an on/off curve (bounces, steps, hits)
  F Guide  flow    noise as loud as the curve (lights, wind, water, anything gradual)
  M Guide  motor   a hum that gets louder AND higher with the curve (engines revving)
  B Guide  blast   a boom on every rise, ringing for as long as the curve stays on
                   (explosions, gunshots, thunder)
  U Guide  uncanny a high warbling tone, its pitch swinging fast (UFOs, magic, sci-fi effects)
  W Guide  words   muffled speech, a voice through a wall (when someone talks); best used
                   only through the first steps of sampling

The curve is drawn in the node, picked from the periodic shapes, or - with
`source` connected - taken from the loudness of an audio or the motion of a video.

Broadband sound on purpose: in testing, low pure tones were followed poorly and
noise reliably. The guide ends up in the generated soundtrack.

The `preview` output is the curve as frames, one per video frame, with a line
travelling along it: stack it under the generated clip to show both in sync.
"""
from __future__ import annotations

import json
import math
from collections.abc import Mapping

import numpy as np
import torch
from PIL import Image, ImageDraw
from comfy_api.latest import io

SHAPES = ["custom", "sine", "square", "triangle", "sawtooth", "pulses"]
GUIDES = ["P Guide", "F Guide", "M Guide", "B Guide", "U Guide", "W Guide"]
BINARY_GUIDES = ("P Guide", "B Guide")       # read the curve as on/off; src/main.ts mirrors this
# custom: the curve drawn in the node (src/EventCurveWidget.vue)
_DEFAULT_CURVE = json.dumps({"points": [[0, 0], [0.25, 1], [0.5, 0], [0.75, 1], [1, 0]]})
SAMPLE_RATE = 32000          # MiniMax H3's audio rate; other models resample
PULSE_WIDTH = 0.1            # fraction of a cycle a pulse stays high
EDGE_SECONDS = 0.005         # fade on hard edges so they do not click
UI_SAMPLES = 301             # the curve as sent back to the editor (src/EventCurveWidget.vue)
MOTOR_HZ = 70.0              # idle pitch of the M Guide; the top of the curve is two octaves up
WARBLE_HZ = 1400.0           # centre pitch of the U Guide at the bottom of the curve; the top is an octave up
WARBLE_RATE = 9.0            # pitch swings per second of the U Guide at the bottom; twice that at the top
VOICE_HZ = 130.0             # speaking pitch of the W Guide


def shape_curve(shape: str, cycles: float, phase: float, n: int) -> torch.Tensor:
    """n samples in 0..1 over the whole clip. Every shape starts low, so the
    first event never sits on frame 0."""
    c = torch.arange(n, dtype=torch.float64) / max(n, 1) * cycles + phase
    f = c - torch.floor(c)
    if shape == "sine":
        out = 0.5 - 0.5 * torch.cos(2 * math.pi * c)
    elif shape == "square":
        out = (f >= 0.5).double()
    elif shape == "triangle":
        out = 1 - (2 * f - 1).abs()
    elif shape == "sawtooth":
        out = f
    elif shape == "pulses":
        out = ((f >= 0.5) & (f < 0.5 + PULSE_WIDTH)).double()
    else:
        raise ValueError(f"unknown shape {shape!r}")
    return out.float()


def _points(curve_json: str) -> list[tuple]:
    try:
        raw = json.loads(curve_json).get("points") or []
        pts = sorted((min(max(float(p[0]), 0.0), 1.0), min(max(float(p[1]), 0.0), 1.0),
                      len(p) > 2 and bool(p[2]))             # third = corner, as in NKD Curves
                     for p in raw)
    except (AttributeError, TypeError, ValueError, IndexError):
        pts = []
    return pts if len(pts) >= 2 else [(0.0, 0.0, False), (1.0, 0.0, False)]


def custom_curve(curve_json: str, n: int, binary: bool = False) -> torch.Tensor:
    """The hand-drawn curve, as the editor shows it: the NKD Curves spline, or for an
    on/off guide a staircase that holds each point's level until the next point."""
    pts = _points(curve_json)
    if not binary:
        from .nkd_curves import curve_lut
        return torch.tensor(curve_lut(pts, n), dtype=torch.float32)
    x = torch.arange(n, dtype=torch.float64) / max(n - 1, 1)
    idx = torch.searchsorted(torch.tensor([p[0] for p in pts], dtype=torch.float64), x, right=True) - 1
    return torch.tensor([float(p[1] >= 0.5) for p in pts])[idx.clamp(min=0)]


def _normalize(x: torch.Tensor) -> torch.Tensor:
    x = x - x.min()
    peak = x.max()
    return x / peak if peak > 0 else x


def _resample(curve: torch.Tensor, n: int) -> torch.Tensor:
    if curve.numel() == n:
        return curve
    return torch.nn.functional.interpolate(curve.reshape(1, 1, -1), size=n, mode="linear",
                                           align_corners=True).reshape(-1)


def audio_envelope(waveform: torch.Tensor, sample_rate: int, seconds: float) -> torch.Tensor:
    """Loudness (RMS in 20 ms windows) of the first `seconds` of an audio, 0..1."""
    mono = waveform.float().reshape(-1, waveform.shape[-1]).mean(0)[: max(1, int(seconds * sample_rate))]
    win = max(1, int(0.02 * sample_rate))
    mono = torch.nn.functional.pad(mono, (0, (-mono.numel()) % win))
    return _normalize(mono.reshape(-1, win).pow(2).mean(1).sqrt())


def motion_envelope(frames: torch.Tensor) -> torch.Tensor:
    """How much the picture changes from each frame to the next, 0..1."""
    if frames.shape[0] < 2:
        return torch.zeros(1)
    small = torch.nn.functional.interpolate(frames.float().mean(-1, keepdim=True).permute(0, 3, 1, 2),
                                            size=(64, 64), mode="area")
    diff = (small[1:] - small[:-1]).abs().mean((1, 2, 3))
    return _normalize(torch.cat([diff[:1], diff]))


def _noise(n: int, seed: int = 0) -> torch.Tensor:
    return torch.randn(n, generator=torch.Generator().manual_seed(seed))


def _soften(env: torch.Tensor) -> torch.Tensor:
    k = max(1, int(EDGE_SECONDS * SAMPLE_RATE))
    return torch.nn.functional.avg_pool1d(torch.nn.functional.pad(env.reshape(1, 1, -1), (k // 2, k - 1 - k // 2),
                                                                  mode="replicate"), k, stride=1).reshape(-1)


def _hit(seconds: float, tail: bool) -> torch.Tensor:
    """One event. Dry: a 120 ms thump. With a tail: a boom that rings for `seconds`."""
    seconds = min(max(seconds, 0.25), 3.0) if tail else 0.12
    t = torch.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    if tail:
        # What reads as a blast is brightness falling away: the same noise split into bands that
        # each die at their own rate (highs in a blink, lows for as long as it rings), over a
        # thump sliding from 100 Hz down to 30 Hz, pushed into saturation for weight.
        n = t.numel()
        spec = torch.fft.rfft(_noise(n, 1))
        f = torch.fft.rfftfreq(n, 1 / SAMPLE_RATE)
        body = torch.zeros(n)
        for lo, hi, decay, level in ((2000, 16000, 0.04, 0.5), (500, 2000, 0.12, 0.8),
                                     (120, 500, seconds / 6, 1.0), (20, 120, seconds / 3.5, 1.4)):
            band = torch.fft.irfft(spec * ((f >= lo) & (f < hi)), n)
            body += band / band.std() * level * torch.exp(-t / decay)
        thump = torch.sin(2 * math.pi * torch.cumsum(30 + 70 * torch.exp(-t / 0.08), 0) / SAMPLE_RATE)
        return torch.tanh((body + thump * torch.exp(-t / (seconds / 4)) * 2.0) * 0.9)
    return _noise(t.numel(), 1) * torch.exp(-t / 0.012) * 0.6 + torch.sin(2 * math.pi * 90 * t) * torch.exp(-t / 0.04) * 0.8


def _wander(n: int, per_second: float, seed: int) -> torch.Tensor:
    """A smooth random walk in -1..1, changing course `per_second` times a second."""
    knots = torch.rand(max(2, int(n / SAMPLE_RATE * per_second) + 2), generator=torch.Generator().manual_seed(seed)) * 2 - 1
    return _resample(knots, n)


def _band(x: torch.Tensor, lo: float, hi: float) -> torch.Tensor:
    f = torch.fft.rfftfreq(x.numel(), 1 / SAMPLE_RATE)
    return torch.fft.irfft(torch.fft.rfft(x) * ((f >= lo) & (f < hi)), x.numel())


def _warble(env: torch.Tensor) -> torch.Tensor:
    """Vibrato pushed to the extreme: a high tone whose pitch swings up and down several
    times a second, faster and higher as the curve rises, over a hiss."""
    n = env.numel()
    rate = WARBLE_RATE * (1 + env.double())
    lfo = torch.sin(torch.cumsum(2 * math.pi * rate / SAMPLE_RATE, 0))
    pitch = WARBLE_HZ * torch.pow(2.0, env.double()) * torch.pow(2.0, 0.5 * lfo)     # +-half an octave
    phase = torch.cumsum(2 * math.pi * pitch / SAMPLE_RATE, 0)
    tone = (torch.sin(phase) + torch.sin(2 * phase) * 0.3 + torch.sin(1.007 * phase) * 0.6).float() * 0.4
    hiss = _band(_noise(n, 2), 2000, 12000)
    return env * (tone + hiss / hiss.std() * 0.06)


def _murmur(env: torch.Tensor) -> torch.Tensor:
    """Speech heard through a wall: a buzzing voice chopped into syllables, its vowel
    sliding between oo and ah, with everything above ~1.2 kHz gone."""
    n = env.numel()
    t = torch.arange(n) / SAMPLE_RATE
    pitch = VOICE_HZ * torch.pow(2.0, 0.25 * _wander(n, 2.0, 3).double())                # intonation
    phase = torch.cumsum(2 * math.pi * pitch / SAMPLE_RATE, 0)
    buzz = sum(torch.sin(k * phase) / k for k in range(1, 12)).float() + _noise(n, 4) * 0.1
    vowel = (_wander(n, 5.0, 5) + 1) / 2                                                   # 0 = oo, 1 = ah
    voice = _band(buzz, 200, 600) * (1 - vowel) + _band(buzz, 500, 1200) * vowel
    # syllables: ~4.5 a second, each a soft bump, with the odd pause between phrases
    syl = (0.5 - 0.5 * torch.cos(2 * math.pi * 4.5 * t + 3 * _wander(n, 1.5, 6))).pow(2)
    phrase = (_wander(n, 0.8, 7) > -0.6).float()
    voice = voice * syl * _soften(phrase)
    return env * voice / voice.abs().max().clamp(min=1e-6) * 0.9


def guide_audio(curve: torch.Tensor, seconds: float, guide: str, strength: float) -> torch.Tensor:
    """[1, 2, T] waveform for a curve already in the guide's own terms (on/off for P and B)."""
    n = max(1, int(round(seconds * SAMPLE_RATE)))
    env = _resample(curve.float().clamp(0, 1), n)
    if guide in BINARY_GUIDES:
        on = env >= 0.5
        rises = (on & ~torch.cat([torch.zeros(1, dtype=torch.bool), on[:-1]])).nonzero().flatten().tolist()
        falls = (~on & torch.cat([torch.zeros(1, dtype=torch.bool), on[:-1]])).nonzero().flatten().tolist() + [n]
        wave = torch.zeros(n)
        for start in rises:
            held = (next(f for f in falls if f > start) - start) / SAMPLE_RATE
            hit = _hit(held, tail=guide == "B Guide")[: n - start]
            wave[start:start + hit.numel()] += hit
    elif guide == "M Guide":
        env = _soften(env)
        phase = torch.cumsum(2 * math.pi * MOTOR_HZ * torch.pow(2.0, 2.0 * env.double()) / SAMPLE_RATE, 0)
        hum = sum(torch.sin(k * phase) / k for k in range(1, 9)).float() * 0.35   # saw-like: rich in harmonics
        wave = env * (hum + _noise(n) * 0.12)
    elif guide == "U Guide":
        wave = _warble(_soften(env))
    elif guide == "W Guide":
        wave = _murmur(_soften(env))
    else:
        wave = _soften(env) * _noise(n) * 0.5
    return (wave * strength * 2).clamp(-1, 1).reshape(1, 1, -1).repeat(1, 2, 1)


def curve_frames(curve: torch.Tensor, frames: int, width: int, height: int) -> torch.Tensor:
    """[frames, height, width, 3]: the curve plotted over the clip, with a playhead on the
    instant each frame shows."""
    ss = 2                                               # draw at 2x, scale down: smooth lines
    w, h = width * ss, height * ss
    pad_x, pad_y = round(0.02 * w), round(0.12 * h)
    ys = _resample(curve.float().clamp(0, 1), max(2, w - 2 * pad_x)).tolist()
    pts = [(pad_x + i, h - pad_y - y * (h - 2 * pad_y)) for i, y in enumerate(ys)]
    img = Image.new("RGB", (w, h), "#111318")
    draw = ImageDraw.Draw(img, "RGBA")
    draw.polygon(pts + [(pts[-1][0], h - pad_y), (pad_x, h - pad_y)], fill=(74, 180, 255, 38))
    draw.rectangle([pad_x, pad_y, w - pad_x, h - pad_y], outline=(255, 255, 255, 41), width=ss)
    draw.line(pts, fill="#4ab4ff", width=3 * ss, joint="curve")
    base = torch.from_numpy(np.asarray(img.resize((width, height), Image.LANCZOS), dtype=np.float32) / 255)

    out = base.unsqueeze(0).repeat(frames, 1, 1, 1)
    head = torch.tensor([1.0, 0.82, 0.4])                # #ffd166
    r = max(3, height // 30)
    yy, xx = torch.meshgrid(torch.arange(-r, r + 1), torch.arange(-r, r + 1), indexing="ij")
    dot = (yy ** 2 + xx ** 2 <= r * r)
    x0, x1 = pad_x / ss, (w - pad_x) / ss
    y0, y1 = pad_y / ss, (h - pad_y) / ss
    for f in range(frames):
        t = f / max(frames - 1, 1)
        x = round(x0 + t * (x1 - x0))
        y = round(y1 - ys[min(len(ys) - 1, round(t * (len(ys) - 1)))] * (y1 - y0))
        out[f, round(y0):round(y1), max(0, x - 1):x + 1] = head
        ya, xa = max(0, y - r), max(0, x - r)
        yb, xb = min(height, y + r + 1), min(width, x + r + 1)
        out[f, ya:yb, xa:xb][dot[ya - (y - r):yb - (y - r), xa - (x - r):xb - (x - r)]] = head
    return out


class NKDEventCurveAudio(io.ComfyNode):
    """A curve of *when*, as a guide a joint audio+video model follows."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDEventCurveAudio",
            display_name="😺NKD Event Curve",
            category="😺NKD Nodes/Conditioning",
            is_output_node=True,  # runnable on its own: shows the curve read from source
            description=(
                "Draw when things happen in the video. Pick the kind of action, draw the curve, and anchor "
                "the guide at frame 0 of a joint audio+video model (MiniMax H3): whatever the prompt "
                "describes happens where the curve is high. The curve can also be a periodic shape, or "
                "follow an audio or a video wired to source."
            ),
            inputs=[
                io.Combo.Input("guide", options=GUIDES, default="F Guide",
                               tooltip="The kind of action. P (punch): sharp single events on an on/off curve - "
                                       "bounces, steps, hits. F (flow): gradual intensity on a smooth curve - lights, "
                                       "wind, water. M (motor): something revving, higher as the curve rises - engines, "
                                       "acceleration. B (blast): a bang on each rise that rings while the curve stays "
                                       "on - explosions, gunshots, thunder. U (uncanny): a warbling high tone, faster and higher as the "
                                       "curve rises - UFOs, magic, sci-fi effects. W (words): someone talking where the "
                                       "curve is high - give it a low until (around 0.2) so it only sets the timing."),
                io.Combo.Input("shape", options=SHAPES, default="custom",
                               tooltip="Custom is the curve you draw in the node. The others repeat a shape over the "
                                       "clip; P and B guides read them as on/off. Ignored when source is connected."),
                io.Float.Input("cycles", default=2.0, min=0.25, max=64.0, step=0.25,
                               tooltip="How many times a periodic shape repeats over the clip, so how many events. "
                                       "A full-body action needs about a second per cycle; short events fit twice as many."),
                io.Float.Input("phase", default=0.0, min=0.0, max=1.0, step=0.01,
                               tooltip="Slides a periodic shape along the clip, in cycles (0.5 = half a cycle later)."),
                io.Int.Input("length", default=141, min=1, max=3600,
                             tooltip="Clip length in frames. Use the same value as the video latent."),
                io.Float.Input("fps", default=24.0, min=1.0, max=240.0, step=0.01),
                io.Float.Input("strength", default=0.5, min=0.0, max=1.0, step=0.01,
                               tooltip="How hard the guide pushes. Lower it if the result feels forced."),
                io.String.Input("curve", default=_DEFAULT_CURVE, socketless=True, multiline=False, optional=True,
                                tooltip="The hand-drawn curve, edited in the node."),
                io.Int.Input("preview_width", default=1280, min=64, max=4096, step=16, optional=True,
                             tooltip="Width of the preview frames. Match the video to stack it underneath."),
                io.Int.Input("preview_height", default=240, min=32, max=2160, step=16, optional=True,
                             tooltip="Height of the preview frames."),
                io.MultiType.Input("source", [io.Audio, io.Image], optional=True,
                                   tooltip="Optional: take the curve from here instead. An audio gives its loudness "
                                           "(sync to music or to a recorded sound); video frames give how much the "
                                           "picture moves (copy the timing of another clip)."),
            ],
            outputs=[
                io.Audio.Output(display_name="guide",
                                tooltip="Anchor it at frame 0: Add Guide for MiniMax H3, or a slot of NKD MiniMax Guides."),
                io.Image.Output(display_name="preview",
                                tooltip="The curve as frames, one per video frame, with a line on the current "
                                        "instant. Stack it under the generated clip to show both in sync."),
            ],
        )

    @classmethod
    def execute(cls, guide, shape, cycles, phase, length, fps, strength, curve=_DEFAULT_CURVE,
                preview_width=1280, preview_height=240, source=None) -> io.NodeOutput:
        seconds = length / fps
        binary = guide in BINARY_GUIDES
        if isinstance(source, Mapping) and "waveform" in source:
            values = audio_envelope(source["waveform"], int(source["sample_rate"]), seconds)
        elif isinstance(source, torch.Tensor):
            values = motion_envelope(source[:length].cpu())
        elif shape == "custom":
            values = custom_curve(curve, max(2, int(round(seconds * 1000))), binary)
        else:
            values = shape_curve(shape, cycles, phase, max(2, int(round(seconds * 1000))))
        if binary:
            values = (values >= 0.5).float()
        return io.NodeOutput({"waveform": guide_audio(values, seconds, guide, strength),
                              "sample_rate": SAMPLE_RATE},
                             curve_frames(values, length, preview_width, preview_height),
                             # The curve actually used, for the editor. In the UI payload, not a
                             # push: it has to survive a cache hit.
                             ui={"nkd_curve": [float(v >= 0.5) if binary else round(v, 4)
                                               for v in _resample(values, UI_SAMPLES).tolist()]})
