"""Every guide of a MiniMax H3 video in one node.

The core's `Add Guide for MiniMax H3` anchors one guide per node, so a shot with
six anchors is six nodes, each wanting the same four cables from far upstream —
move one and the canvas turns to spaghetti. This is that chain collapsed: a
growing list of guide slots, one position widget per connected slot, and the
latent / vae / audio_vae it was handed passed straight back out, so the sampler
hangs off this node instead of reaching back across the graph.

The anchoring itself is not reimplemented — each guide goes through the core
node's own `execute`, so its validation, clip-length snapping and audio cropping
stay its problem.
"""
from __future__ import annotations

from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

MAX_GUIDES = 12
_SLOT_NAMES = [f"guide_{i}" for i in range(1, MAX_GUIDES + 1)]


def _slot_index(name: str) -> int:
    return int(name.rsplit("_", 1)[-1])


def _split(value):
    """One slot's payload -> (image, audio).

    A slot takes whatever a guide can be: a still, a batch of frames, a VIDEO
    (which brings its own soundtrack), or bare audio. AUDIO is the dict shape
    every audio node in Comfy passes around; VIDEO is anything that can hand back
    its components. Everything else is an image batch.
    """
    if value is None:
        return None, None
    if isinstance(value, dict) and "waveform" in value:
        return None, value
    if hasattr(value, "get_components"):
        components = value.get_components()
        return components.images, components.audio
    return value, None


class NKDMiniMaxGuides(io.ComfyNode):
    """Anchor many images / clips / videos / audios at once on a MiniMax H3 latent."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDMiniMaxGuides",
            display_name="😺NKD MiniMax Guides",
            category="😺NKD Nodes/Conditioning",
            description=(
                "Anchor several guides on a MiniMax H3 video from one node: each connected slot "
                "takes an image, a frame sequence, a video (picture + its soundtrack) or an audio, "
                "and gets its own frame position. latent, vae and audio_vae come back out so the "
                "chain carries them downstream instead of being re-cabled from upstream."
            ),
            inputs=[
                io.Conditioning.Input("positive"),
                # Both VAEs are required, not optional, purely for socket order: an
                # optional input is drawn after every required one, and these belong
                # at the top with the rest of the fixed wiring — the growing guide
                # list has to stay at the bottom. Every H3 graph loads both anyway.
                io.Vae.Input("vae", display_name="video vae",
                             tooltip="Video VAE, for the slots that carry picture."),
                io.Vae.Input("audio_vae", display_name="audio vae",
                             tooltip="Audio VAE, for the slots that carry sound."),
                io.Latent.Input("latent"),
                io.Autogrow.Input(
                    "guides",
                    template=io.Autogrow.TemplateNames(
                        io.MultiType.Input("guide", [io.Image, io.Audio, io.Video], optional=True,
                                           tooltip="Image, frame sequence, video or audio to anchor."),
                        names=_SLOT_NAMES, min=1),
                ),
            ] + [
                io.Int.Input(f"position_{i}", display_name=f"position {i}", default=0,
                             min=-9999, max=9999, optional=True, socketless=True,
                             tooltip="Frame index this guide is anchored at. Negative counts from "
                                     "the end. Two slots sharing a position (a clip and its sound) "
                                     "become one guide.")
                for i in range(1, MAX_GUIDES + 1)
            ],
            outputs=[
                io.Conditioning.Output(display_name="positive"),
                io.Latent.Output(display_name="latent"),
                io.Vae.Output(display_name="video vae"),
                io.Vae.Output(display_name="audio vae"),
            ],
        )

    @classmethod
    def execute(cls, positive, latent, vae=None, audio_vae=None,
                guides: io.Autogrow.Type = None, **positions) -> io.NodeOutput:
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3AddGuide

        # Slots that share a frame index are one guide with two halves — a clip and
        # its soundtrack anchored together, which is what the core node's single
        # keyframe means. Insertion order keeps the guides in slot order.
        merged: dict[int, dict] = {}
        for name in sorted(guides or {}, key=_slot_index):
            image, audio = _split(guides[name])
            if image is None and audio is None:
                continue
            frame_idx = positions.get(f"position_{_slot_index(name)}", 0)
            guide = merged.setdefault(frame_idx, {"image": None, "audio": None})
            for key, value in (("image", image), ("audio", audio)):
                if value is None:
                    continue
                if guide[key] is not None:
                    raise ValueError(
                        "two guides carry {} at frame {} — give them different positions".format(
                            key, frame_idx))
                guide[key] = value

        for frame_idx, guide in merged.items():
            positive = MiniMaxH3AddGuide.execute(
                positive, latent, frame_idx, vae=vae, audio_vae=audio_vae,
                image=guide["image"], audio=guide["audio"])[0]

        return io.NodeOutput(positive, latent, vae, audio_vae)


class NKDMiniMaxGuidesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMiniMaxGuides]


async def comfy_entrypoint() -> NKDMiniMaxGuidesExtension:
    return NKDMiniMaxGuidesExtension()
