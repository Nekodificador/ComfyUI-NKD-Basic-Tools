"""😺NKD Mask Ops — every mask cleanup step in one GPU pass.

Replaces the usual chain of Grow Mask → Fill Holes → Blur → Threshold →
per-frame cleanup nodes. The whole batch goes to the accelerator once, runs the
pipeline there, and comes back — see `mask_core` for the morphology itself.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from . import mask_core

# In-node preview: a handful of evenly spaced frames at preview resolution, so a
# 81-frame clip doesn't write 81 PNGs to temp on every run.
_PREVIEW_FRAMES = 8
_PREVIEW_SIZE = 512


def _preview(mask: torch.Tensor) -> torch.Tensor:
    if mask.shape[0] > _PREVIEW_FRAMES:
        idx = torch.linspace(0, mask.shape[0] - 1, _PREVIEW_FRAMES).round().long()
        mask = mask[idx]
    h, w = mask.shape[-2:]
    if max(h, w) > _PREVIEW_SIZE:
        scale = _PREVIEW_SIZE / max(h, w)
        mask = F.interpolate(mask.unsqueeze(1),
                             size=(max(1, int(h * scale)), max(1, int(w * scale))),
                             mode="area").squeeze(1)
    return mask


class NKDMaskOps(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDMaskOps",
            display_name="😺NKD Mask Ops",
            category="😺NKD Nodes/Basic",
            description=(
                "All the mask preprocessing in one node, on the GPU, over the "
                "whole batch at once: levels, speck removal, hole filling, gap "
                "closing, expand/contract, blockify and feather, plus temporal "
                "expand and smoothing for video. Steps run in a fixed order — "
                "clean, stabilize, shape, soften — so a feathered edge is never "
                "re-hardened by a later step. Anything left at 0 is skipped."
            ),
            is_output_node=True,
            inputs=[
                io.Mask.Input("mask", tooltip="Mask or mask batch (one per video frame)."),
                io.Vae.Input("vae", optional=True,
                             tooltip="Optional. Connect the VAE you are sampling with and "
                                     "Blockify turns on with that VAE's own grid — including, on "
                                     "a video VAE, the frames it collapses into a single latent. "
                                     "The mask then lands on latent boundaries exactly, with "
                                     "nothing bleeding into the neighbouring blocks."),
                io.Boolean.Input("invert", default=False,
                                 display_name="Invert",
                                 tooltip="Swap masked and unmasked before anything else runs."),
                io.Float.Input("black_point", default=0.0, min=0.0, max=1.0, step=0.01,
                               display_name="Black Point",
                               tooltip="Mask values at or below this become empty. Raise it to "
                                       "cut the faint halo a segmentation model leaves around "
                                       "the subject."),
                io.Float.Input("white_point", default=1.0, min=0.0, max=1.0, step=0.01,
                               display_name="White Point",
                               tooltip="Mask values at or above this become fully masked. Set "
                                       "it to the same value as Black Point for a hard "
                                       "threshold with no soft edge left."),
                io.Int.Input("despeckle", default=0, min=0, max=256,
                             display_name="Remove Specks",
                             tooltip="Remove blobs thinner than about twice this many pixels. "
                                     "What survives keeps its exact shape — thin details like "
                                     "fingers or hair are not shaved off."),
                io.Boolean.Input("fill_holes", default=False,
                                 display_name="Fill Holes",
                                 tooltip="Fill gaps fully enclosed by the mask, so each area "
                                         "becomes a solid shape."),
                io.Int.Input("close_gaps", default=0, min=0, max=256,
                             display_name="Close Gaps",
                             tooltip="Bridge cracks and notches narrower than about twice this "
                                     "many pixels without growing the mask overall."),
                io.Int.Input("temporal_expand", default=0, min=0, max=64,
                             display_name="Expand In Time",
                             tooltip="Video only. Each frame also covers what the mask covered "
                                     "this many frames before and after, so a mask that lags "
                                     "the motion still covers it."),
                io.Int.Input("temporal_smooth", default=0, min=0, max=64,
                             display_name="Smooth In Time",
                             tooltip="Video only. Average each frame's mask with this many "
                                     "frames either side to stop the edge from flickering."),
                io.Int.Input("expand", default=0, min=-512, max=512,
                             display_name="Expand / Contract",
                             tooltip="Grow the mask outward by this many pixels, or shrink it "
                                     "with a negative value."),
                io.Int.Input("blockify", default=0, min=0, max=256,
                             display_name="Blockify",
                             tooltip="Snap the mask to a grid of squares this many pixels wide, "
                                     "so it survives the trip into latent space with no bleeding "
                                     "into neighbouring blocks. Connect a VAE and the size comes "
                                     "from it; otherwise set it yourself (8 or 16 for most "
                                     "models). Any value above 0 turns it on."),
                io.Float.Input("blockify_threshold", default=0.5, min=0.0, max=1.0, step=0.01,
                               display_name="Block Coverage",
                               tooltip="How much of a block must be covered for it to turn on "
                                       "fully. 0 keeps each block's average as a gray value "
                                       "instead, for a pixelated look."),
                io.Int.Input("feather", default=0, min=0, max=256,
                             display_name="Feather",
                             tooltip="Soften the edge by this many pixels. Runs last, so "
                                     "nothing hardens it again."),
            ],
            outputs=[
                io.Mask.Output(display_name="mask"),
                io.Mask.Output(display_name="mask_inverted"),
            ],
        )

    @classmethod
    def execute(cls, mask, invert, black_point, white_point, despeckle, fill_holes,
                close_gaps, temporal_expand, temporal_smooth, expand, blockify,
                blockify_threshold, feather, vae=None) -> io.NodeOutput:
        time_groups = None
        if vae is not None:  # connecting the VAE is the switch — see the tooltip
            blockify, time_groups = mask_core.latent_grid(vae, mask.shape[0])
        out = mask_core.process(
            mask,
            invert=invert,
            black_point=black_point,
            white_point=white_point,
            despeckle_px=despeckle,
            fill=fill_holes,
            close_px=close_gaps,
            temporal_expand_frames=temporal_expand,
            temporal_smooth_frames=temporal_smooth,
            expand_px=expand,
            blockify_px=blockify,
            blockify_threshold=blockify_threshold,
            time_groups=time_groups,
            feather_px=feather,
        )
        return io.NodeOutput(out, 1.0 - out,
                             ui=ui.PreviewMask(_preview(out), cls=cls))


class NKDMaskOpsExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMaskOps]


async def comfy_entrypoint() -> NKDMaskOpsExtension:
    return NKDMaskOpsExtension()


NODE_CLASS_MAPPINGS = {"NKDMaskOps": NKDMaskOps}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDMaskOps": "😺NKD Mask Ops"}
