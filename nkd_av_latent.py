"""Masking a video that carries its own soundtrack.

An AV model (MiniMax H3, LTXV) samples two tensors at once, picture and sound,
and wants a noise mask for each. Building that by hand is six nodes — two VAE
encodes, two Set Latent Noise Mask, a Solid Mask standing in for the audio one,
and the concat — and five of them never change. `NKDAVLatent` is that chain in
one node; `NKDAudioMask` is the one piece of it worth having on its own.
"""
from __future__ import annotations

import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from . import mask_core


def _concat(video_latent, audio_latent):
    """Join the two streams — core's own Concat AV Latent, not a copy of it.

    It fits an audio clip that doesn't match the video's length, merges the two
    noise masks into the nested pair the sampler unpacks, and knows what to do
    when the video latent is already an AV one. All of that stays its problem.
    """
    from comfy_extras.nodes_lt import LTXVConcatAVLatent
    return LTXVConcatAVLatent.execute(video_latent, audio_latent)[0]


def _time_axis(audio_samples):
    """Which axis of an audio latent is time.

    Not the same everywhere: MiniMax H3 encodes audio as [B, 32, 2, T] and LTXV as
    [B, 8, T, 16] — 16 frequency bins, time one axis earlier. Reading the wrong one is
    silent, so it is picked rather than assumed: the other axis is a fixed property of
    the architecture (2 stereo codes, 16 bins) while time grows with the clip, so the
    longer of the two is time for any clip past a second or so. Anything shorter is
    ambiguous and says so instead of guessing.
    """
    shape = audio_samples.shape
    if audio_samples.ndim < 3:
        raise ValueError("audio latent {} has no time axis".format(tuple(shape)))
    if audio_samples.ndim == 3:                        # [B, C, T]
        return -1
    if shape[-1] == shape[-2]:
        raise ValueError(
            "audio latent {} is square on its last two axes — cannot tell which one is "
            "time".format(tuple(shape)))
    return -1 if shape[-1] > shape[-2] else -2


def _latents_per_second(audio_vae):
    """How many audio latent frames the VAE writes per second — 40 on MiniMax H3.

    `audio_sample_rate / downscale_ratio` (32000 / 800) is how `comfy.sd.VAE` itself
    describes an audio VAE, so this is the model's own number and not a constant of
    ours that goes stale the day a second AV model lands. Returns None when the VAE
    doesn't describe itself that way, and then the length is left alone.
    """
    rate = getattr(audio_vae, "audio_sample_rate", None)
    hop = getattr(audio_vae, "downscale_ratio", None)
    if not isinstance(rate, (int, float)) or not isinstance(hop, (int, float)) or hop <= 0:
        return None
    return rate / float(hop)


def _fit_audio(audio_latent, target):
    """Trim or pad the encoded sound to the length the model expects for this clip.

    The core's Concat AV Latent can do this, but only when the video latent handed to it
    is ALREADY an AV latent - the one path this node never takes. So an encode landing a
    frame or two off would go straight through, and the two streams would disagree about
    where the clip ends: small, permanent, and the half of a lip-sync nobody checks.

    Not delegated to the core's version because that one assumes its own axis order,
    and time is not always last (see `_time_axis`). The padding is silent, which is
    what a clip shorter than its video should decode to.
    """
    samples = audio_latent["samples"]
    axis = _time_axis(samples)
    if samples.shape[axis] == target:
        return audio_latent
    out = audio_latent.copy()
    if samples.shape[axis] > target:
        out["samples"] = samples.narrow(axis, 0, target).contiguous()
    else:
        pad = list(samples.shape)
        pad[axis] = target - samples.shape[axis]
        out["samples"] = torch.cat([samples, samples.new_zeros(pad)], dim=axis)
    return out


def _audio_track(audio_samples, mask, ramp_ticks=0, ramp_shape="cosine", ramp_out_ticks=0):
    """Video mask -> one value per audio latent, shaped like that latent."""
    shape = audio_samples.shape
    axis = _time_axis(audio_samples)
    frames = shape[-1] if audio_samples.ndim == 3 else shape[axis]
    track = mask_core.to_audio_latent(mask, frames)    # [1, 1, 1, frames]
    track = mask_core.audio_ramp(track, ramp_ticks, ramp_shape, ramp_out_ticks)
    if audio_samples.ndim == 3:                        # [B, C, T]
        return track.reshape(1, 1, frames)
    if axis == -2:
        track = track.reshape(1, 1, frames, 1)
    return track.expand(1, 1, shape[-2], shape[-1]).contiguous()


class NKDAudioMask(io.ComfyNode):
    """Set Latent Noise Mask for the audio branch, timed from the video mask.

    Sits between VAE Encode Audio and Concat AV Latent, in place of the Solid
    Mask + Set Latent Noise Mask pair that usually goes there — it hands back the
    latent with the mask already on it, so the audio latent is wired once instead
    of forked into two nodes. The mask comes out too, for a look at it.

    Sized to the audio latent's own shape, so nothing interpolates it later.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDAudioMask",
            display_name="😺NKD Audio Mask",
            category="😺NKD Nodes/Masking",
            description=(
                "Mask the soundtrack in time, so an AV model (MiniMax H3, LTXV) "
                "regenerates the sound only while the picture mask is on. Goes "
                "straight between VAE Encode Audio and Concat AV Latent, "
                "replacing the Solid Mask and Set Latent Noise Mask that "
                "usually sit there — or skip the whole chain with 😺NKD AV "
                "Latent."
            ),
            inputs=[
                io.Latent.Input("audio_latent",
                                tooltip="The soundtrack, straight off VAE Encode Audio. Comes "
                                        "back with the mask on it, ready for Concat AV Latent."),
                io.Mask.Input("mask", tooltip="The same mask you give the picture, one per video "
                                              "frame. Only its timing survives: a frame counts as "
                                              "masked if any pixel of it is, and the mask is read "
                                              "as covering the whole clip."),
                # Appended last — `widgets_values` is positional, saved workflows
                # just gain the defaults.
                io.Int.Input("ramp_ticks", default=0, min=0, max=40,
                             display_name="Ramp In",
                             tooltip="Run-up INTO each regenerated stretch, in audio ticks "
                                     "(1/40 s). The last ticks of the ORIGINAL sound before it "
                                     "rise toward the cut, so the model may rework the very end "
                                     "of the real audio to land on the generated one; the first "
                                     "regenerated tick is already fully new. 0 keeps the seam "
                                     "hard. 8 ticks = 200 ms."),
                io.Int.Input("ramp_out_ticks", default=0, min=0, max=40,
                             display_name="Ramp Out",
                             tooltip="Descent OUT of each regenerated stretch, back into the "
                                     "original sound. Separate from Ramp In because the exit "
                                     "usually wants a hard cut: a descent there lets the model "
                                     "keep 'transitioning' over audio that should simply "
                                     "resume. Leave at 0 unless the return sounds abrupt."),
                io.Combo.Input("ramp_shape", options=mask_core.RAMP_SHAPES,
                               default="cosine", display_name="Ramp Shape",
                               tooltip="Both ramps. cosine eases in and out; linear is the "
                                       "control; high band spends the whole ramp between 0.85 "
                                       "and 0.995, the narrow range of mask values the model "
                                       "actually distinguishes."),
            ],
            outputs=[io.Latent.Output(display_name="audio_latent")],
        )

    @classmethod
    def execute(cls, audio_latent, mask, ramp_ticks=0, ramp_shape="cosine",
                ramp_out_ticks=0) -> io.NodeOutput:
        samples = audio_latent["samples"]
        samples = samples.unbind()[-1] if getattr(samples, "is_nested", False) else samples
        out = audio_latent.copy()                    # the audio latent's own shape, so the
        out["noise_mask"] = _audio_track(samples, mask, ramp_ticks, ramp_shape,
                                         ramp_out_ticks).to(samples.device)
        return io.NodeOutput(out)                    # sampler never resamples it


class NKDAVLatent(io.ComfyNode):
    """Both VAE encodes, both noise masks and the concat, in one node."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDAVLatent",
            display_name="😺NKD AV Latent",
            category="😺NKD Nodes/Masking",
            description=(
                "Picture and sound in, one masked AV latent out, for a model "
                "that samples both at once (MiniMax H3, LTXV). Replaces the "
                "whole chain — VAE Encode, VAE Encode Audio, a Set Latent Noise "
                "Mask on each and Concat AV Latent — and says what happens to "
                "the soundtrack, which is the part that has no node of its own."
            ),
            inputs=[
                io.Image.Input("images", tooltip="The video, as frames."),
                io.Audio.Input("audio", tooltip="Its soundtrack."),
                io.Vae.Input("video_vae", display_name="video vae"),
                io.Vae.Input("audio_vae", display_name="audio vae",
                             tooltip="Resampled to this VAE's own rate first, so the audio "
                                     "doesn't have to arrive at it."),
                io.Mask.Input("latent_mask", display_name="latent mask", optional=True,
                              tooltip="What to repaint in the picture. Leave it unconnected and "
                                      "the whole video is generated. Feed the latent_mask output "
                                      "of 😺NKD Mask Ops (with its VAE and model connected) and "
                                      "it lands on the model's own grid instead of being "
                                      "stretched onto it here."),
                io.Mask.Input("audio_mask", display_name="audio mask", optional=True,
                              tooltip="Which moments Follow mask follows, instead of the picture "
                                      "mask above: white regenerates the sound of that moment, "
                                      "black keeps it. Only its timing is read, so feed one at "
                                      "frame rate — the picture mask is already coarser than a "
                                      "frame. Does nothing on the other two settings."),
                io.Combo.Input("audio_mode", options=["keep", "regenerate", "follow mask"],
                               default="keep", display_name="Audio",
                               tooltip="This is what decides, always. Keep: the original "
                                       "soundtrack survives untouched. Regenerate: all of it is "
                                       "resampled, which is what you get with no audio mask at "
                                       "all. Follow mask: resampled only over the stretch of "
                                       "time a mask is on — audio mask if you connected one, the "
                                       "picture mask otherwise — to the nearest 1/40 s, the rate "
                                       "the sound is masked at."),
                # Last, as the pack's rule says: `widgets_values` is positional, so a new
                # widget in the middle repoints every saved value after it. Appended, an
                # existing workflow just gains the default.
                io.Float.Input("fps", default=24.0, min=1.0, max=240.0, step=0.01,
                               tooltip="Frame rate of the video going in — MiniMax H3 is 24. "
                                       "It is the only thing needed to know how long the "
                                       "soundtrack should be: the sound is cut or padded to "
                                       "exactly the number of audio frames the model expects "
                                       "for this many pictures. Get it wrong and picture and "
                                       "sound drift apart from each other."),
                io.Int.Input("ramp_ticks", default=0, min=0, max=40,
                             display_name="Ramp In",
                             tooltip="Follow mask only. Run-up INTO each regenerated stretch, "
                                     "in audio ticks (1/40 s): the last ticks of the ORIGINAL "
                                     "sound before it rise toward the cut, so the model may "
                                     "rework the very end of the real audio to land on the "
                                     "generated one; the first regenerated tick is already "
                                     "fully new. 0 keeps the seam hard. 8 ticks = 200 ms."),
                io.Int.Input("ramp_out_ticks", default=0, min=0, max=40,
                             display_name="Ramp Out",
                             tooltip="Follow mask only. Descent OUT of each regenerated "
                                     "stretch, back into the original sound. Separate from "
                                     "Ramp In because the exit usually wants a hard cut: a "
                                     "descent there lets the model keep 'transitioning' over "
                                     "audio that should simply resume. Leave at 0 unless the "
                                     "return sounds abrupt."),
                io.Combo.Input("ramp_shape", options=mask_core.RAMP_SHAPES,
                               default="cosine", display_name="Ramp Shape",
                               tooltip="Both ramps. cosine eases in and out; linear is the "
                                       "control; high band spends the whole ramp between 0.85 "
                                       "and 0.995, the narrow range of mask values the model "
                                       "actually distinguishes."),
            ],
            outputs=[io.Latent.Output(display_name="latent")],
        )

    @classmethod
    def execute(cls, images, audio, video_vae, audio_vae, audio_mode="keep",
                latent_mask=None, audio_mask=None, fps=24.0,
                ramp_ticks=0, ramp_shape="cosine", ramp_out_ticks=0) -> io.NodeOutput:
        from comfy_extras.nodes_audio import VAEEncodeAudio

        video_latent = {"samples": video_vae.encode(images[:, :, :, :3])}
        if latent_mask is not None:
            video_latent["noise_mask"] = latent_mask.reshape((-1, 1) + latent_mask.shape[-2:])

        audio_latent = VAEEncodeAudio.execute(audio_vae, audio)[0]
        # Length first, mask after: the mask is sized to the audio latent's own shape, so
        # building it against a length that is about to change would size it wrong.
        # Same arithmetic the model's own empty AV latent uses: round(duration * rate).
        per_second = _latents_per_second(audio_vae)
        if per_second is not None and fps > 0:
            audio_latent = _fit_audio(audio_latent, round(images.shape[0] / fps * per_second))
        samples = audio_latent["samples"]
        # the combo decides, always: a connected audio mask only says *when*, and only
        # to the setting that asks. A wired input that silently overrides a widget is
        # a widget that looks broken.
        timing = audio_mask if audio_mask is not None else latent_mask
        if audio_mode == "follow mask" and timing is not None:
            audio_latent["noise_mask"] = _audio_track(samples, timing, ramp_ticks, ramp_shape,
                                                      ramp_out_ticks).to(samples.device)
        elif audio_mode == "keep":
            audio_latent["noise_mask"] = torch.zeros_like(samples)
        # "regenerate" leaves it unset: the concat fills a missing mask with ones,
        # and an all-ones mask and no mask are the same thing to the sampler

        return io.NodeOutput(_concat(video_latent, audio_latent))


# MiniMax H3's own grid, all four from the core (comfy/ldm/minimax/model.py:30,
# comfy_extras/nodes_minimax_h3.py): a clip is 5 frames (2 tokens) plus whole
# 17-frame chunks of 5 tokens each, sound runs at 40 latent ticks per second,
# picture at 24 fps. ponytail: H3 only — a second AV model with verified numbers
# turns these into a preset combo, not before.
H3_FIRST_FRAMES, H3_FIRST_TOKENS = 5, 2
H3_CHUNK_FRAMES, H3_CHUNK_TOKENS = 17, 5
H3_AUDIO_RATE, H3_FPS = 40.0, 24.0


def h3_overlap(chunks):
    """(pixel frames, video tokens, audio ticks) covered by that many chunks."""
    frames = H3_CHUNK_FRAMES * (chunks - 1) + H3_FIRST_FRAMES
    tokens = H3_CHUNK_TOKENS * (chunks - 1) + H3_FIRST_TOKENS
    ticks = round(frames * H3_AUDIO_RATE / H3_FPS)
    return frames, tokens, ticks


def _av_streams(latent, name):
    """The two streams of an AV latent — refusing a plain one out loud.

    `unbind()` on a NON-nested tensor happily unbinds the batch axis instead,
    so feeding a video-only latent here would silently read garbage as audio.
    """
    samples = latent["samples"]
    if not getattr(samples, "is_nested", False):
        raise ValueError(
            "{} is not an AV latent (expected the joint video+audio latent an AV "
            "model samples, e.g. from MiniMax H3 Reference To Video or a KSampler "
            "fed one)".format(name))
    video, audio = samples.unbind()
    return video, audio


class NKDAVLatentExtend(io.ComfyNode):
    """Chained extension: continue a sampled AV latent into a fresh empty one.

    The pattern is Ablejones' masked-extension workflow collapsed to one node:
    the tail of the previous latent replaces the head of the new empty one, and
    a step noise mask pins it (0 = keep) so the denoise is forced to continue
    its motion and sound. No blending — the seam is hard on purpose; the model
    does the mixing, and the regenerated overlap is discarded in pixel space
    afterwards (that is what the overlap_frames / trim_seconds outputs feed).
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDAVLatentExtend",
            display_name="😺NKD AV Latent Extend",
            category="😺NKD Nodes/Masking",
            description=(
                "Extend a MiniMax H3 clip: the tail of the previous AV latent is "
                "planted at the start of the new empty one and masked as 'keep', "
                "so the sampler generates a continuation of its motion and "
                "sound. Feed the result to the KSampler; after decoding, drop "
                "the regenerated overlap with Image Batch Extend With Overlap "
                "(overlap_frames) and Trim Audio Duration (trim_seconds)."
            ),
            inputs=[
                io.Latent.Input("previous",
                                tooltip="The AV latent of the segment to continue — the "
                                        "previous stage's KSampler output, before decoding."),
                io.Latent.Input("new_latent", display_name="new (empty)",
                                tooltip="The empty AV latent of the new segment, from MiniMax "
                                        "H3 Reference To Video. Its length is the length "
                                        "rendered; the overlap eats its first chunks."),
                io.Int.Input("overlap_chunks", default=2, min=1, max=16,
                             display_name="Overlap Chunks",
                             tooltip="How much of the previous clip the model sees to "
                                     "continue from, in latent chunks. 1 chunk = 5 frames, "
                                     "each extra adds 17 (2 = 22 frames, ~0.9 s — the "
                                     "workflow default). More = smoother continuity, less "
                                     "new footage per stage."),
            ],
            outputs=[
                io.Latent.Output(display_name="latent",
                                 tooltip="Masked AV latent, ready for the KSampler."),
                io.Int.Output(display_name="overlap_frames",
                              tooltip="Pixel frames of overlap. Feed Image Batch Extend "
                                      "With Overlap (side=source, mode=cut) to drop the "
                                      "regenerated head after decoding."),
                io.Float.Output(display_name="trim_seconds",
                                tooltip="The same overlap in seconds, on the AUDIO latent "
                                        "grid (1/40 s) — feed Trim Audio Duration's "
                                        "start_index. Cutting at the video-frame time "
                                        "instead drifts a few ms per stage."),
            ],
        )

    @classmethod
    def execute(cls, previous, new_latent, overlap_chunks=2) -> io.NodeOutput:
        v_prev, a_prev = _av_streams(previous, "previous")
        v_new, a_new = _av_streams(new_latent, "new_latent")
        frames, tokens, ticks = h3_overlap(overlap_chunks)

        t_axis = v_new.ndim - 3                      # [..., T, H, W]
        a_axis = _time_axis(a_new)
        if v_prev.shape[-2:] != v_new.shape[-2:]:
            raise ValueError("previous {} and new {} latents differ in size — the tail "
                             "cannot be planted".format(tuple(v_prev.shape), tuple(v_new.shape)))
        if v_prev.shape[t_axis] < tokens or a_prev.shape[a_axis] < ticks:
            raise ValueError("previous clip is shorter than {} overlap chunks "
                             "({} tokens)".format(overlap_chunks, tokens))
        if v_new.shape[t_axis] <= tokens or a_new.shape[a_axis] <= ticks:
            raise ValueError("new latent is no longer than the overlap ({} tokens) — "
                             "nothing left to generate".format(tokens))

        # The tail REPLACES the head of the new latent, so the output length is
        # exactly the new segment's. Those tokens decode against a chunk pattern
        # anchored at frame 0, so their pixel meaning shifts slightly — fine,
        # because the whole overlap is regenerated context that gets discarded
        # in pixel space; only the continuation past it survives.
        video = v_new.clone()
        video.narrow(t_axis, 0, tokens).copy_(
            v_prev.narrow(t_axis, v_prev.shape[t_axis] - tokens, tokens))
        audio = a_new.clone()
        audio.narrow(a_axis, 0, ticks).copy_(
            a_prev.narrow(a_axis, a_prev.shape[a_axis] - ticks, ticks))

        # Step masks, 0 = keep the planted tail, 1 = generate. Hard on purpose:
        # the reference workflow uses interpolation=none and lets the denoise
        # blend. Video mask in the Set Latent Noise Mask shape ([T,1,h,w], the
        # sampler maps it onto the token grid); audio mask in the latent's own
        # shape, so nothing resamples it (same rule as NKDAudioMask).
        v_mask = torch.ones((v_new.shape[t_axis], 1) + tuple(v_new.shape[-2:]),
                            device=video.device)
        v_mask[:tokens] = 0.0
        a_mask = torch.ones_like(audio)
        a_mask.narrow(a_axis, 0, ticks).zero_()

        joint = _concat({"samples": video, "noise_mask": v_mask},
                        {"samples": audio, "noise_mask": a_mask})
        return io.NodeOutput(joint, frames, ticks / H3_AUDIO_RATE)


class NKDAVExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDAudioMask, NKDAVLatent, NKDAVLatentExtend]


async def comfy_entrypoint() -> NKDAVExtension:
    return NKDAVExtension()


NODE_CLASS_MAPPINGS = {"NKDAudioMask": NKDAudioMask, "NKDAVLatent": NKDAVLatent,
                       "NKDAVLatentExtend": NKDAVLatentExtend}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDAudioMask": "😺NKD Audio Mask",
                              "NKDAVLatent": "😺NKD AV Latent",
                              "NKDAVLatentExtend": "😺NKD AV Latent Extend"}
