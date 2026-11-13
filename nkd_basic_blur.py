"""😺NKD Basic Blur — Gaussian, Tent or Box, by a radius in pixels, on an image, mask or video.

Core ComfyUI has no plain image blur, so this is the one-knob version, running on
the same separable box passes as the Mask Ops feather (`blur_core.basic_blur`):
O(radius) per pixel, the whole batch on the GPU in frame chunks.
"""
from __future__ import annotations

import dataclasses

import torch
from comfy_api.latest import InputImpl, io

from . import blur_core, mask_core

_PASSES = {"Gaussian": 3, "Tent": 2, "Box": 1}


def _blur(x, radius, passes):
    """A [B, H, W, C] image or [B, H, W] mask, blurred in frame chunks on the GPU.

    Chunks travel in their own layout and are turned to [B, C, H, W] on the GPU:
    a permute on the CPU, or uploading a permuted view, cost more than the blur.
    """
    device = mask_core._work_device(x)
    out = torch.empty_like(x)
    step = max(1, mask_core._CHUNK_PIXELS // (x.shape[1] * x.shape[2]))
    for start in range(0, x.shape[0], step):
        t = x[start:start + step].to(device=device, dtype=torch.float32)
        t = t.unsqueeze(1) if x.ndim == 3 else t.permute(0, 3, 1, 2).contiguous()
        t = blur_core.basic_blur(t, radius, passes)
        out[start:start + step].copy_(t.squeeze(1) if x.ndim == 3 else t.permute(0, 2, 3, 1))
    return out


class NKDBasicBlur(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        source = io.MatchType.Template("source", [io.Image, io.Mask, io.Video])
        return io.Schema(
            node_id="NKDBasicBlur",
            display_name="😺NKD Basic Blur",
            category="😺NKD Nodes/Basic",
            description="Plain blur: Gaussian, Tent or Box, by a radius in pixels. Takes an image, a mask "
                        "or a video and gives back the same type.",
            inputs=[
                io.MatchType.Input("image", source, tooltip="Image, mask or video."),
                io.Combo.Input("blur_type", options=list(_PASSES), default="Gaussian", display_name="type",
                               tooltip="Gaussian: smooth falloff. Box: flat average, harder edges. "
                                       "Tent sits between the two. All three blur by the same amount "
                                       "at the same radius, only the shape changes."),
                io.Float.Input("radius", default=8.0, min=0.0, max=512.0, step=0.5,
                               tooltip="Blur radius in pixels. Fractions work."),
            ],
            outputs=[io.MatchType.Output(source, display_name="output")],
        )

    @classmethod
    def execute(cls, image, blur_type, radius) -> io.NodeOutput:
        passes = _PASSES[blur_type]
        if not isinstance(image, torch.Tensor):           # VIDEO: audio, fps and metadata ride along
            parts = image.get_components()
            alpha = None if parts.alpha is None else _blur(parts.alpha, radius, passes)
            parts = dataclasses.replace(parts, images=_blur(parts.images, radius, passes), alpha=alpha)
            return io.NodeOutput(InputImpl.VideoFromComponents(parts))
        return io.NodeOutput(_blur(image, radius, passes))
