"""Temporal detailer: the de-rope as a crop / stitch pair.

A video model packs several pixel frames into one latent token, and a fast pose change
inside a token comes out smeared. Slowing the fast stretches down until every pose
(every drawing) owns a whole token lets the model draw each one crisp; recovering the
real-time frames afterwards keeps the sharp poses. That is the spatial detailer turned
ninety degrees: crop the moment, "upscale" it in time, sample, scale back, stitch.

`NKDTemporalCrop` builds the slowed clip and a latent ready for any sampler, with the
handles around each stretch frozen to the original so the splice has nothing to ghost.
`NKDTemporalStitch` brings it back to real time over the original frames.

Model-agnostic: the token grid comes from the VAE, the freeze is a plain noise_mask,
and audio is only involved when an audio VAE is connected.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

import comfy.utils
import folder_paths

from .nkd_av_latent import _concat, _fit_audio, _latents_per_second

TemporalMap = io.Custom("NKD_TEMPORAL_MAP")

# MiniMax H3 restarts its 1+4+4+4+4 token pattern every 17 frames; the other video VAEs
# run one 1+s*k pattern for the whole clip. ponytail: H3 is the only chunked video VAE in
# core today, recognised by its 24 latent channels; a second one turns this into a field.
H3_CHUNK = 17


def token_grid(vae) -> tuple[int, int | None]:
    """(frames per token, chunk length or None) of a video VAE's time axis."""
    if getattr(vae, "latent_dim", 2) != 3 or not vae.downscale_index_formula:
        raise ValueError("NKD Temporal Crop needs a video VAE (the one your video model uses)")
    stride = int(vae.downscale_index_formula[0])
    chunk = H3_CHUNK if vae.latent_channels == 24 and stride == 4 else None
    return stride, chunk


def is_token_start(d: int, stride: int, chunk: int | None) -> bool:
    """Does dilated frame `d` open a latent token? The first frame of the clip (and of
    every H3 chunk) is a token of its own; after it, one token every `stride` frames."""
    r = d % chunk if chunk else d
    return r == 0 or (r - 1) % stride == 0


def next_token_start(d: int, stride: int, chunk: int | None) -> int:
    d += 1
    while not is_token_start(d, stride, chunk):
        d += 1
    return d


def valid_length(n: int, stride: int, chunk: int | None) -> int:
    """Smallest clip length >= n the VAE accepts: 1+s*k, or 17k+5 on H3."""
    if chunk:
        return max(5, 5 + chunk * math.ceil((n - 5) / chunk))
    return 1 + stride * max(0, math.ceil((n - 1) / stride))


def parse_spans(text: str, n: int) -> list[tuple[int, int]]:
    """'30-52, 90-110' (inclusive frame ranges) or the widget's JSON -> sorted [a, b)."""
    spans = []
    text = (text or "").strip()
    if text.startswith("{") or text.startswith("["):
        data = json.loads(text)
        pairs = data.get("spans", []) if isinstance(data, dict) else data
    else:
        pairs = [tuple(int(x) for x in m) for m in re.findall(r"(\d+)\s*-\s*(\d+)", text)]
    for a, b in pairs:
        a, b = sorted((int(a), int(b)))
        a, b = max(0, a), min(n, b + 1)
        if a < b:
            spans.append((a, b))
    return sorted(spans)


def _runs(flags: list[bool]) -> list[tuple[int, int]]:
    out, start = [], None
    for i, f in enumerate(flags + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i))
            start = None
    return out


def plan(n: int, spans: list[tuple[int, int]], every: int, context: int,
         stride: int, chunk: int | None) -> dict:
    """Where every frame of the slowed clip comes from.

    Returns `src` (world frame shown by each dilated frame), `regen` (1 = the sampler
    redraws it, 0 = frozen to the original), the stitched `segments`, and per world frame
    the dilated range `groups[f]` it was drawn into plus whether it is `hot`.
    """
    hot = [False] * n
    for a, b in spans:
        for f in range(a, b):
            hot[f] = True
    segments: list[list[int]] = []
    for h0, h1 in _runs(hot):
        s0, s1 = max(0, h0 - context), min(n, h1 + context)
        if segments and s0 <= segments[-1][1]:
            segments[-1][1] = max(segments[-1][1], s1)
        else:
            segments.append([s0, s1])

    src: list[int] = []
    regen: list[int] = []
    tstart: list[float] = []      # world time (in frames) each dilated frame starts at...
    tend: list[float] = []        # ...and ends at, for stretching the audio
    groups: list[list[int] | None] = [None] * n

    def hold(frame: int, flag: int, t0: float, t1: float) -> None:
        src.append(frame)
        regen.append(flag)
        tstart.append(t0)
        tend.append(t1)

    def align() -> None:
        # pad with a still copy of the last frame until the next frame opens a token
        while src and not is_token_start(len(src), stride, chunk):
            hold(src[-1], regen[-1], tend[-1], tend[-1])

    for s0, s1 in segments:
        align()
        run_end = {f: s0 + e for a, e in _runs(hot[s0:s1]) for f in range(s0 + a, s0 + e)}
        f = s0
        while f < s1:
            if hot[f]:
                # one drawing = `every` world frames held in ONE token, so the pose is static in it
                align()
                w1 = min(f + every, run_end[f])
                d0 = len(src)
                d1 = next_token_start(d0, stride, chunk)
                for k in range(d1 - d0):
                    hold(f, 1, f + (w1 - f) * k / (d1 - d0), f + (w1 - f) * (k + 1) / (d1 - d0))
                for g in range(f, w1):
                    groups[g] = [d0, d1]
                f = w1
            else:
                groups[f] = [len(src), len(src) + 1]
                hold(f, 0, f, f + 1)
                f += 1

    if src:
        # Pad the tail to a legal length by stepping BACK through the last frames: one
        # frozen frame repeated over a long tail makes a model invent motion to fill it.
        target = valid_length(len(src), stride, chunk)
        k = 2
        while len(src) < target:
            j = max(0, len(src) - k)
            hold(src[j], 0, tstart[j], tstart[j])
            k += 2
    return {"n": n, "src": src, "regen": regen, "tstart": tstart, "tend": tend,
            "groups": groups, "hot": hot, "segments": segments, "every": every,
            "context": context}


def token_mask(regen: list[int], stride: int, chunk: int | None) -> list[int]:
    """Per latent token: redraw it if any frame inside asks for it."""
    out = []
    for d, flag in enumerate(regen):
        if is_token_start(d, stride, chunk):
            out.append(flag)
        else:
            out[-1] = max(out[-1], flag)
    return out


def stretch_audio(audio: dict, p: dict, fps: float) -> dict:
    """The soundtrack on the slowed clock: each dilated frame plays the world time it
    shows, so speech keeps its place against the mouths (slowed like tape)."""
    wave, sr = audio["waveform"], int(audio["sample_rate"])
    per_frame = sr / fps
    total = int(round(len(p["src"]) * per_frame))
    j = torch.arange(total, dtype=torch.float64)
    d = (j / per_frame).floor().clamp(max=len(p["src"]) - 1).long()
    frac = j / per_frame - d
    t0 = torch.tensor(p["tstart"], dtype=torch.float64)[d]
    t1 = torch.tensor(p["tend"], dtype=torch.float64)[d]
    pos = ((t0 + frac * (t1 - t0)) * per_frame).clamp(0, wave.shape[-1] - 1)
    lo = pos.floor().long()
    hi = (lo + 1).clamp(max=wave.shape[-1] - 1)
    w = (pos - lo).to(wave.dtype)
    out = wave[..., lo] * (1 - w) + wave[..., hi] * w
    out = out * (t1 > t0).to(wave.dtype)            # held still frames are silent, not a DC step
    return {"waveform": out, "sample_rate": sr}


_STAMP = re.compile(r"(At\s+)(\d+):(\d{1,2}(?:\.\d+)?)")


def retime_prompt(prompt: str, p: dict, fps: float) -> str:
    """Move the prompt's 'At mm:ss.mmm' shot times onto the slowed clock."""
    if not prompt:
        return prompt
    firsts = [g[0] for g in p["groups"] if g is not None]
    last = len(p["src"])

    def to_dilated(f: float) -> float:
        f = int(f)
        later = [p["groups"][g][0] for g in range(max(0, f), p["n"]) if p["groups"][g] is not None]
        return later[0] if later else (firsts[-1] if firsts else last)

    def sub(m):
        secs = int(m.group(2)) * 60 + float(m.group(3))
        t = to_dilated(secs * fps) / fps
        return "{}{:02d}:{:06.3f}".format(m.group(1), int(t // 60), t % 60)
    return _STAMP.sub(sub, prompt)


STRIP_TILES = 96
STRIP_H = 96
WAVE_BUCKETS = 600


def timeline_preview(images: torch.Tensor, audio: dict | None, fps: float, stride: int) -> dict:
    """What the timeline widget draws: a contact sheet of the clip and the soundtrack's peaks.

    A grid rather than one long row, so a long clip stays under the browser's image size
    limits. Named by content hash: the same clip keeps its URL and the browser its cache.
    """
    n, h, w = int(images.shape[0]), int(images.shape[1]), int(images.shape[2])
    tiles = max(1, min(STRIP_TILES, n))
    idx = [min(n - 1, int(i * n / tiles)) for i in range(tiles)]
    tile_w = max(1, round(w / h * STRIP_H))
    small = comfy.utils.common_upscale(
        images[idx][..., :3].movedim(-1, 1).float(), tile_w, STRIP_H, "bilinear", "disabled")
    arr = (small.movedim(1, -1).clamp(0, 1) * 255).round().to(torch.uint8).cpu().numpy()
    cols = math.ceil(math.sqrt(tiles))
    sheet = np.zeros((math.ceil(tiles / cols) * STRIP_H, cols * tile_w, 3), np.uint8)
    for i in range(tiles):
        r, c = divmod(i, cols)
        sheet[r * STRIP_H:(r + 1) * STRIP_H, c * tile_w:(c + 1) * tile_w] = arr[i]
    name = "nkd_tcrop_{}.jpg".format(hashlib.md5(sheet.tobytes()).hexdigest()[:16])
    path = os.path.join(folder_paths.get_temp_directory(), name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        Image.fromarray(sheet).save(path, quality=85)

    peaks = []
    if audio is not None:
        wave = audio["waveform"][0].abs().amax(0)                    # loudest channel
        need = int(round(n / fps * int(audio["sample_rate"])))
        wave = F.pad(wave, (0, max(0, need - wave.shape[0])))[:need]
        buckets = min(WAVE_BUCKETS, max(1, need))
        wave = wave[:need - need % buckets].view(buckets, -1).amax(1) if need >= buckets else wave
        top = float(wave.max()) or 1.0
        peaks = [round(float(v) / top, 3) for v in wave]
    return {"filename": name, "subfolder": "", "type": "temp", "tiles": tiles, "cols": cols,
            "tile_w": tile_w, "tile_h": STRIP_H, "frames": n, "fps": fps, "token": stride,
            "peaks": peaks}


class NKDTemporalCrop(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDTemporalCrop",
            display_name="😺NKD Temporal Crop",
            category="😺NKD Nodes/Masking",
            description=(
                "A detailer in time. Mark the fast moments that come out smeared and they are "
                "slowed down so the model can draw every pose crisp. Sample the latent with "
                "your usual sampler and bring it back with 😺NKD Temporal Stitch."
            ),
            inputs=[
                io.Image.Input("images", tooltip="The video to fix, as frames."),
                io.Vae.Input("vae", tooltip="The video VAE of the model that will redraw it."),
                io.String.Input("spans", default="", socketless=True, multiline=False,
                                display_name="Spans",
                                tooltip="Frames to redraw, e.g. '30-52, 90-110'. With nothing "
                                        "marked the video passes through and the sampler "
                                        "does not run."),
                io.Combo.Input("every", options=["1", "2", "3"], default="1",
                               display_name="Drawings",
                               tooltip="A new drawing every how many frames. 1 redraws every "
                                       "frame; 2 is animation on twos, each drawing held two "
                                       "frames, and costs less."),
                io.Int.Input("context", default=12, min=0, max=64,
                             display_name="Context",
                             tooltip="Frames kept around each stretch, untouched, so the model "
                                     "sees how the motion comes in and goes out and the splice "
                                     "has room to blend."),
                io.Float.Input("fps", default=24.0, min=1.0, max=240.0, step=0.01,
                               display_name="FPS"),
                io.Audio.Input("audio", optional=True,
                               tooltip="The video's soundtrack, slowed down with it so mouths "
                                       "keep following the voice. Needs the audio vae."),
                io.Vae.Input("audio_vae", display_name="audio vae", optional=True,
                             tooltip="For models that generate sound with the picture (MiniMax "
                                     "H3, LTX 2). The soundtrack is kept, not redrawn; with no "
                                     "audio connected it is silence."),
                io.String.Input("prompt", optional=True, force_input=True,
                                tooltip="The video's prompt. Shot times written as 'At 00:01.200' "
                                        "are moved onto the slowed clock."),
            ],
            outputs=[
                io.Latent.Output(display_name="latent",
                                 tooltip="The slowed clip, ready for the sampler: only the marked "
                                         "drawings are redrawn."),
                io.Image.Output(display_name="images",
                                tooltip="The slowed clip as frames, for conditioning nodes that "
                                        "want pictures."),
                io.Int.Output(display_name="length", tooltip="Frames in the slowed clip."),
                io.String.Output(display_name="prompt"),
                TemporalMap.Output(display_name="temporal_map"),
            ],
            # runs on its own, so the timeline fills before anything is wired downstream
            is_output_node=True,
        )

    @classmethod
    def execute(cls, images, vae, spans="", every="1", context=12, fps=24.0,
                audio=None, audio_vae=None, prompt=None) -> io.NodeOutput:
        stride, chunk = token_grid(vae)
        p = plan(int(images.shape[0]), parse_spans(spans, int(images.shape[0])),
                 int(every), int(context), stride, chunk)
        prompt = retime_prompt(prompt or "", p, fps)
        preview = timeline_preview(images, audio, fps, stride)
        preview["slowed"] = len(p["src"])
        ui = {"nkd_tcrop": [preview]}
        if not p["src"]:
            # nothing marked: the Stitch never asks for the redraw, so the sampler is skipped
            return io.NodeOutput(None, images[:1], 1, prompt, p, ui=ui)

        frames = images.index_select(0, torch.tensor(p["src"], device=images.device))
        samples = vae.encode(frames[..., :3])
        tokens = token_mask(p["regen"], stride, chunk)
        if samples.shape[2] != len(tokens):
            raise ValueError("NKD Temporal Crop: the VAE made {} latent frames from {} frames, "
                             "expected {}".format(samples.shape[2], len(p["src"]), len(tokens)))
        mask = torch.tensor(tokens, dtype=torch.float32, device=samples.device)
        latent = {"samples": samples,
                  "noise_mask": mask.view(-1, 1, 1, 1).expand(-1, 1, *samples.shape[-2:]).contiguous()}

        if audio_vae is not None:
            from comfy_extras.nodes_audio import VAEEncodeAudio
            if audio is None:
                sr = int(getattr(audio_vae, "audio_sample_rate", 44100))
                track = {"waveform": torch.zeros(1, 2, int(round(len(p["src"]) / fps * sr))),
                         "sample_rate": sr}
            else:
                track = stretch_audio(audio, p, fps)
            audio_latent = VAEEncodeAudio.execute(audio_vae, track)[0]
            per_second = _latents_per_second(audio_vae)
            if per_second is not None:
                audio_latent = _fit_audio(audio_latent, round(len(p["src"]) / fps * per_second))
            audio_latent["noise_mask"] = torch.zeros_like(audio_latent["samples"])   # kept, not redrawn
            latent = _concat(latent, audio_latent)

        return io.NodeOutput(latent, frames, len(p["src"]), prompt, p, ui=ui)


def _sharpness(frames: torch.Tensor) -> torch.Tensor:
    """Laplacian variance per frame, on luminance."""
    y = (frames[..., :3] * frames.new_tensor([0.299, 0.587, 0.114])).sum(-1, keepdim=True)
    k = frames.new_tensor([[0, 1, 0], [1, -4, 1], [0, 1, 0]]).view(1, 1, 3, 3)
    return F.conv2d(y.movedim(-1, 1), k).flatten(1).var(1)


class NKDTemporalStitch(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDTemporalStitch",
            display_name="😺NKD Temporal Stitch",
            category="😺NKD Nodes/Masking",
            description=(
                "Brings the redrawn moments from 😺NKD Temporal Crop back to real time and "
                "puts them over the original video."
            ),
            inputs=[
                io.Image.Input("images", tooltip="The original video, the same frames the Crop got."),
                TemporalMap.Input("temporal_map"),
                io.Image.Input("redrawn", lazy=True, optional=True,
                               tooltip="The decoded output of the sampler. Only computed when "
                                       "something was marked."),
            ],
            outputs=[io.Image.Output(display_name="images")],
        )

    @classmethod
    def check_lazy_status(cls, images, temporal_map, redrawn=None):
        return ["redrawn"] if temporal_map["segments"] and redrawn is None else []

    @classmethod
    def execute(cls, images, temporal_map, redrawn=None) -> io.NodeOutput:
        p = temporal_map
        if not p["segments"] or redrawn is None:
            return io.NodeOutput(images)
        if redrawn.shape[0] < len(p["src"]):
            raise ValueError("NKD Temporal Stitch: got {} redrawn frames, the Crop made {}".format(
                redrawn.shape[0], len(p["src"])))
        h, w = images.shape[1], images.shape[2]
        if redrawn.shape[1:3] != images.shape[1:3]:
            redrawn = comfy.utils.common_upscale(redrawn[..., :3].movedim(-1, 1), w, h,
                                                 "bilinear", "disabled").movedim(1, -1)
        redrawn = redrawn.to(images.device, images.dtype)
        out = images.clone()
        picks: dict[tuple[int, int], int] = {}
        hot, ctx = p["hot"], max(1, p["context"])
        for s0, s1 in p["segments"]:
            hot_idx = [f for f in range(s0, s1) if hot[f]]
            for f in range(s0, s1):
                d0, d1 = p["groups"][f]
                if hot[f]:
                    if (d0, d1) not in picks:   # the sharpest frame of the drawing's token
                        picks[(d0, d1)] = d0 + int(_sharpness(redrawn[d0:d1]).argmax())
                    out[f, ..., :3] = redrawn[picks[(d0, d1)], ..., :3]
                else:
                    # handles: frozen to the original during sampling, so blending them in
                    # only hides the VAE round trip, never two different takes
                    dist = min(abs(f - g) for g in hot_idx)
                    a = max(0.0, 1.0 - dist / (ctx + 1))
                    out[f, ..., :3] = torch.lerp(images[f, ..., :3], redrawn[d0, ..., :3], a)
        return io.NodeOutput(out)


class NKDTemporalExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDTemporalCrop, NKDTemporalStitch]


async def comfy_entrypoint() -> NKDTemporalExtension:
    return NKDTemporalExtension()


NODE_CLASS_MAPPINGS = {"NKDTemporalCrop": NKDTemporalCrop, "NKDTemporalStitch": NKDTemporalStitch}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDTemporalCrop": "😺NKD Temporal Crop",
                              "NKDTemporalStitch": "😺NKD Temporal Stitch"}
