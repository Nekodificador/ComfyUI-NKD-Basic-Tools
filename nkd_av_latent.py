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


def _audio_track(audio_samples, mask):
    """Video mask -> one value per audio latent, shaped like that latent.

    Which axis is time is not the same everywhere: MiniMax H3 encodes audio as
    [B, 32, 2, T] and LTXV as [B, 8, T, 16] — 16 frequency bins, time one axis
    earlier. Writing the timeline down the wrong one is silent, so it is picked
    rather than assumed: the other axis is a fixed property of the architecture
    (2 codes, 16 bins) while time grows with the clip, so the longer of the two
    is time for any clip past a second or so. Anything shorter is ambiguous and
    says so instead of guessing.
    """
    shape = audio_samples.shape
    if audio_samples.ndim < 3:
        raise ValueError("audio latent {} has no time axis to mask".format(tuple(shape)))
    if audio_samples.ndim == 3:                        # [B, C, T]
        return mask_core.to_audio_latent(mask, shape[-1]).reshape(1, 1, shape[-1])
    if shape[-1] == shape[-2]:
        raise ValueError(
            "audio latent {} is square on its last two axes — cannot tell which one is "
            "time".format(tuple(shape)))
    time_last = shape[-1] > shape[-2]
    frames = shape[-1] if time_last else shape[-2]
    track = mask_core.to_audio_latent(mask, frames)    # [1, 1, 1, frames]
    if not time_last:
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
            ],
            outputs=[io.Latent.Output(display_name="audio_latent")],
        )

    @classmethod
    def execute(cls, audio_latent, mask) -> io.NodeOutput:
        samples = audio_latent["samples"]
        samples = samples.unbind()[-1] if getattr(samples, "is_nested", False) else samples
        out = audio_latent.copy()                    # the audio latent's own shape, so the
        out["noise_mask"] = _audio_track(samples, mask).to(samples.device)
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
            ],
            outputs=[io.Latent.Output(display_name="latent")],
        )

    @classmethod
    def execute(cls, images, audio, video_vae, audio_vae, audio_mode="keep",
                latent_mask=None, audio_mask=None) -> io.NodeOutput:
        from comfy_extras.nodes_audio import VAEEncodeAudio

        video_latent = {"samples": video_vae.encode(images[:, :, :, :3])}
        if latent_mask is not None:
            video_latent["noise_mask"] = latent_mask.reshape((-1, 1) + latent_mask.shape[-2:])

        audio_latent = VAEEncodeAudio.execute(audio_vae, audio)[0]
        samples = audio_latent["samples"]
        # the combo decides, always: a connected audio mask only says *when*, and only
        # to the setting that asks. A wired input that silently overrides a widget is
        # a widget that looks broken.
        timing = audio_mask if audio_mask is not None else latent_mask
        if audio_mode == "follow mask" and timing is not None:
            audio_latent["noise_mask"] = _audio_track(samples, timing).to(samples.device)
        elif audio_mode == "keep":
            audio_latent["noise_mask"] = torch.zeros_like(samples)
        # "regenerate" leaves it unset: the concat fills a missing mask with ones,
        # and an all-ones mask and no mask are the same thing to the sampler

        return io.NodeOutput(_concat(video_latent, audio_latent))


class NKDAVExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDAudioMask, NKDAVLatent]


async def comfy_entrypoint() -> NKDAVExtension:
    return NKDAVExtension()


NODE_CLASS_MAPPINGS = {"NKDAudioMask": NKDAudioMask, "NKDAVLatent": NKDAVLatent}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDAudioMask": "😺NKD Audio Mask",
                              "NKDAVLatent": "😺NKD AV Latent"}
