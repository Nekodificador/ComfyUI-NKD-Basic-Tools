"""😺NKD Field Blur — pins with a blur amount, smoothly interpolated.

Photoshop's Field Blur: drop pins on the image, give each one a blur strength,
and the strength between them is interpolated. Good for faking a shallow depth
of field, or for softening a background without a depth map.

Each pin carries one number, the same as the original — the shape of the falloff
comes from where the pins are, not from per-pin knobs.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from . import blur_core, mask_core
from .helpers import preview_frames, push_source

_DEFAULT_PINS = '{"v":1,"pins":[]}'
# The radius field varies slowly by construction (it is an interpolation of a
# handful of pins), so it is solved small and scaled up. 256 is well past the
# point where the field stops changing.
_FIELD_SIZE = 256
_LEVELS = 6


def apply_field_blur(image, pins, max_blur, mask=None):
    """The whole node, minus ComfyUI. Shared with the editor's preview route so
    what the editor shows is what the graph renders — the only way a preview is
    worth trusting."""
    items = blur_core.parse_items(pins, "pins")
    if not items or max_blur <= 0:
        return image

    src_device, src_dtype = image.device, image.dtype
    b, h, w, _ = image.shape

    def run(device):
        xy = torch.tensor([[float(p.get("x", 0.5)), float(p.get("y", 0.5))] for p in items],
                          device=device, dtype=torch.float32).clamp(0.0, 1.0)
        amt = torch.tensor([float(p.get("blur", 1.0)) for p in items],
                           device=device, dtype=torch.float32).clamp(0.0, 1.0)

        radius = blur_core.idw_field(xy, amt, min(_FIELD_SIZE, h), min(_FIELD_SIZE, w))
        radius = F.interpolate(radius[None, None] * float(max_blur), size=(h, w),
                               mode="bilinear", align_corners=False)

        img = image.to(device=device, dtype=torch.float32).permute(0, 3, 1, 2)
        out = mask_core._map_frames(
            lambda t: blur_core.pyramid_blur_lerp(t, radius, levels=_LEVELS), img)

        if mask is not None:
            m = mask.to(device=device, dtype=torch.float32)
            if m.dim() == 2:
                m = m.unsqueeze(0)
            m = m.unsqueeze(1)                                   # [Bm,1,H,W]
            if m.shape[-2:] != (h, w):
                m = F.interpolate(m, size=(h, w), mode="bilinear", align_corners=False)
            if m.shape[0] != b:                                  # a still mask over a clip
                m = m[:1].expand(b, -1, -1, -1)
            out = out * (1.0 - m) + img * m

        return out.permute(0, 2, 3, 1)

    device = mask_core._work_device(image)
    try:
        out = run(device)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        out = run(torch.device("cpu"))
    return out.to(device=src_device, dtype=src_dtype)


class NKDFieldBlur(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFieldBlur",
            display_name="😺NKD Field Blur",
            category="😺NKD Nodes/Basic",
            description=(
                "Drop pins on the image and set how much blur each one wants; "
                "everywhere in between is interpolated smoothly. One pin blurs "
                "the whole frame evenly, two pins give you a gradient — the "
                "usual way to fake a shallow depth of field or push a background "
                "back without a depth map. Pin strengths are relative; Max Blur "
                "sets what a fully-turned-up pin means in pixels."
            ),
            is_output_node=True,
            inputs=[
                io.Image.Input("image"),
                io.String.Input("pins", default=_DEFAULT_PINS, multiline=False,
                                socketless=True),
                io.Int.Input("max_blur", default=48, min=0, max=512,
                             display_name="Max Blur",
                             tooltip="How many pixels of blur a pin turned all the way up "
                                     "means. Every pin's strength is a fraction of this."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional. Where the mask is white the original image "
                                      "is kept, so you can protect a subject from the blur "
                                      "without a second composite node."),
            ],
            hidden=[io.Hidden.unique_id],
            outputs=[io.Image.Output()],
        )

    @classmethod
    def execute(cls, image, pins, max_blur, mask=None, unique_id=None) -> io.NodeOutput:
        push_source(unique_id, image)
        out = apply_field_blur(image, pins, max_blur, mask)
        return io.NodeOutput(out, ui=ui.PreviewImage(preview_frames(out), cls=cls))


class NKDFieldBlurExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDFieldBlur]


async def comfy_entrypoint() -> NKDFieldBlurExtension:
    return NKDFieldBlurExtension()


NODE_CLASS_MAPPINGS = {"NKDFieldBlur": NKDFieldBlur}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDFieldBlur": "😺NKD Field Blur"}
