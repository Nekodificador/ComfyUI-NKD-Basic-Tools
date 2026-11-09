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

# H3's time axis is not uniform. A video token covers 1, 4, 4, 4, 4 pixel frames in
# turn, so token starts land on frames 17m, 17m+1, 17m+5, 17m+9, 17m+13 — and a
# guide's own latent is always tokenised from the start of that cycle (1, 4, 4, 4, 4).
# The two grids therefore line up only when the guide starts at a multiple of 17;
# anywhere else its rows sit between the target's tokens, which is the seam that
# surfaces as a flash on the anchored frame. `snap positions` puts every guide on
# that grid; it is on by default because off-grid is almost never what was meant,
# and off for the cases the grid cannot express — H3's own token layout is the only
# reason it exists, so it is a switch, not a law.
#
# The last frame is the exception the model was trained on: fl2va anchors its
# closing keyframe there, off-grid on purpose, and it is the one that shuts a loop.
# Snapping leaves it alone, so position -1 still means what it always meant.
FRAME_STEP = 17


def _snap(frame_idx: int, frame_count: int) -> int:
    if frame_idx == frame_count - 1:      # fl2va's own end anchor
        return frame_idx
    return max(0, min(round(frame_idx / FRAME_STEP) * FRAME_STEP,
                      (frame_count - 1) // FRAME_STEP * FRAME_STEP))


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
                io.Boolean.Input("snap_positions", default=True,
                                 display_name="Snap Positions",
                                 tooltip="Move every guide onto the nearest frame H3 starts a "
                                         "video token on, a multiple of 17. Off-grid guides sit "
                                         "between the video's tokens and that frame flashes like "
                                         "a cut in the wrong place, so leave this on unless you "
                                         "are placing a guide by hand for a reason. The last "
                                         "frame is never moved: off-grid is where fl2va's own "
                                         "closing keyframe lives."),
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
                             tooltip="Frame this guide is anchored at. Negative counts from the "
                                     "end, so -1 is the last frame — the anchor that closes a "
                                     "loop on the opening image. H3 only starts a video token "
                                     "every 17 frames (0, 17, 34, 51...), which is where snap "
                                     "positions puts this. Two slots sharing a position (a clip "
                                     "and its sound) become one guide.")
                for i in range(1, MAX_GUIDES + 1)
            ] + [
                # After every position: widgets_values is positional, so appended
                # widgets leave saved workflows reading their old values.
                io.Float.Input(f"until_{i}", display_name=f"until {i}", default=1.0,
                               min=0.0, max=1.0, step=0.01, optional=True, socketless=True,
                               tooltip="How far into sampling this guide is obeyed, as a fraction "
                                       "of the steps. 1 = the whole way. Lower it to let the model "
                                       "follow the guide for the composition and then finish the "
                                       "fine detail on its own. With H3's usual shift of 12, 0.5 "
                                       "lets go around sigma 0.92 and 0.9 around 0.57.")
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
    def execute(cls, positive, latent, vae=None, audio_vae=None, snap_positions=True,
                guides: io.Autogrow.Type = None, **positions) -> io.NodeOutput:
        from comfy.ldm.minimax.model import FRAME_PER_TOKEN
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3AddGuide

        # Same count the core node derives, needed here to resolve negative positions
        # and to keep a snapped one inside the video.
        video_tokens = latent["samples"].tensors[0].shape[2]
        frame_count = sum(FRAME_PER_TOKEN[k % 5] for k in range(video_tokens))

        # Slots that share a frame index are one guide with two halves — a clip and
        # its soundtrack anchored together, which is what the core node's single
        # keyframe means. Insertion order keeps the guides in slot order.
        merged: dict[int, dict] = {}
        for name in sorted(guides or {}, key=_slot_index):
            image, audio = _split(guides[name])
            if image is None and audio is None:
                continue
            frame_idx = positions.get(f"position_{_slot_index(name)}", 0)
            if frame_idx < 0:
                frame_idx += frame_count
            guide = merged.setdefault(frame_idx, {"image": None, "audio": None, "until": 0.0})
            # a clip and its soundtrack are one guide: it holds while either half asks
            guide["until"] = max(guide["until"], positions.get(f"until_{_slot_index(name)}", 1.0))
            for key, value in (("image", image), ("audio", audio)):
                if value is None:
                    continue
                if guide[key] is not None:
                    raise ValueError(
                        "two guides carry {} at frame {} — give them different positions".format(
                            key, frame_idx))
                guide[key] = value

        # After the merge, so a clip and its soundtrack move together as one guide.
        if snap_positions:
            snapped: dict[int, dict] = {}
            for frame_idx, guide in merged.items():
                target = _snap(frame_idx, frame_count)
                if target in snapped:
                    raise ValueError(
                        "two guides land on frame {} once snapped to H3's token grid — "
                        "space them at least {} frames apart, or turn snap positions "
                        "off".format(target, FRAME_STEP))
                snapped[target] = guide
            merged = snapped

        # Each guide encoded once, on a blank conditioning, so it can be dealt into
        # whichever stretches of the schedule it is obeyed in.
        anchored = []
        for frame_idx, guide in merged.items():
            blank = MiniMaxH3AddGuide.execute(
                [[None, {}]], latent, frame_idx, vae=vae, audio_vae=audio_vae,
                image=guide["image"], audio=guide["audio"])[0]
            anchored.append((blank[0][1]["minimax_keyframes"][0], guide["until"]))

        if anchored:
            positive = _schedule(positive, anchored)
        return io.NodeOutput(positive, latent, vae, audio_vae)


# The sampler gates entries with strict comparisons; the core's own timestep-range
# helper leaves the same gap so only one stretch is live at a boundary.
_EPS = 1e-5


def _schedule(positive, anchored):
    """One conditioning per stretch of the schedule, carrying the guides still obeyed there.

    Guides only ride in the conditioning (H3 turns them into extra sequence rows each
    step), so a guide that stops at 0.6 is simply absent from the stretch after it.
    With every guide at 1 there is one stretch and no range keys — the old output.
    """
    import node_helpers

    cuts = sorted({until for _, until in anchored if 0.0 < until < 1.0})
    edges = [0.0] + cuts + [1.0]
    out = []
    for start, end in zip(edges, edges[1:]):
        active = [kf for kf, until in anchored if until >= end]
        stretch = positive
        if active:
            stretch = node_helpers.conditioning_set_values(
                stretch, {"minimax_keyframes": active}, append=True)
        if len(edges) == 2:
            return stretch
        for t in stretch:
            # intersect with any range the conditioning already had upstream
            s = max(start, t[1].get("start_percent", 0.0))
            e = min(end - _EPS if end < 1.0 else end, t[1].get("end_percent", 1.0))
            if s < e:
                out.extend(node_helpers.conditioning_set_values(
                    [t], {"start_percent": s, "end_percent": e}))
    return out


class NKDMiniMaxGuidesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMiniMaxGuides]


async def comfy_entrypoint() -> NKDMiniMaxGuidesExtension:
    return NKDMiniMaxGuidesExtension()
