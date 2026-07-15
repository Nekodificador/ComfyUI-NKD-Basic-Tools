"""NKD Gradient Map — remap image luminance through a color ramp."""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_color_ramp import _DEFAULT_RAMP, _parse_interp, _parse_ramp, _sample_ramp
from .helpers import _luminance, _resize_mask
from .nkd_frequency import _send_source_to_widget


class NKDGradientMap(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDGradientMap",
            display_name="😺NKD Gradient Map",
            category="😺NKD Nodes/Basic",
            is_output_node=True,  # runnable on its own → loads the resolved source
                                  # into the live preview (works behind resize/subgraph)
            description=(
                "Recolor the image by brightness: darks become one end of "
                "the ramp, lights the other. Classic duotone / color-grading "
                "look, drawn live as you edit the ramp."
            ),
            inputs=[
                io.Image.Input("image"),
                io.String.Input("ramp", multiline=False, default=_DEFAULT_RAMP,
                                socketless=True,
                                tooltip="The color ramp, edited above."),
                io.Boolean.Input("invert", default=False,
                                 display_name="Invert",
                                 tooltip="Swap which end of the ramp lands on darks "
                                         "vs. lights."),
                io.Float.Input("strength", default=1.0, min=0.0, max=1.0, step=0.01,
                               display_name="Strength",
                               tooltip="How much of the effect shows through. "
                                       "0 = original image, 1 = full effect."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — confine the recolor to the mask, "
                                      "feathered by its values (soft edges blend in)."),
            ],
            hidden=[io.Hidden.unique_id],  # to target this node's preview widget
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="The recolored image."),
                io.Mask.Output(display_name="mask",
                               tooltip="Luminance of the result — use the grade as a mask."),
            ],
        )

    @classmethod
    def execute(cls, image, ramp, invert, strength, mask=None) -> io.NodeOutput:
        stops = _parse_ramp(ramp)
        interp = _parse_interp(ramp)
        rgb = image[..., :3]
        luma = _luminance(rgb)
        if invert:
            luma = 1.0 - luma
        mapped = _sample_ramp(stops, luma, interp)

        # A mask scales the blend per pixel (feathered by its values), so the
        # recolor only lands where the mask is bright.
        blend = strength
        if mask is not None:
            b, oh, ow = image.shape[0], image.shape[1], image.shape[2]
            mm = mask if mask.dim() == 3 else mask.unsqueeze(0)
            mfull = _resize_mask(mm.to(rgb.device), ow, oh).clamp(0.0, 1.0)
            fidx = torch.arange(b, device=rgb.device).clamp(max=mfull.shape[0] - 1)
            blend = strength * mfull[fidx].unsqueeze(-1)  # [B, H, W, 1]

        out = rgb * (1.0 - blend) + mapped * blend
        mask_out = _luminance(out)
        if image.shape[-1] > 3:
            out = torch.cat([out, image[..., 3:]], dim=-1)
        # Feed the resolved input to the live preview widget (it applies the
        # ramp client-side); partial-execution loads the image even when it
        # arrives via a resize/subgraph.
        _send_source_to_widget(getattr(getattr(cls, "hidden", None), "unique_id", None),
                               image, event="nkd-gradmap-source")
        return io.NodeOutput(out, mask_out)


class NKDGradientMapExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDGradientMap]


NODE_CLASS_MAPPINGS = {"NKDGradientMap": NKDGradientMap}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDGradientMap": "😺NKD Gradient Map"}
