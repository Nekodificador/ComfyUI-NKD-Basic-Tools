"""NKD Gradient Map — remap image luminance through a color ramp."""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_color_ramp import _DEFAULT_RAMP, _parse_ramp, _sample_ramp

_LUMA_WEIGHTS = (0.2126, 0.7152, 0.0722)  # Rec.709


class NKDGradientMap(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDGradientMap",
            display_name="😺NKD Gradient Map",
            category="😺NKD Nodes/Basic",
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
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="The recolored image."),
            ],
        )

    @classmethod
    def execute(cls, image, ramp, invert, strength) -> io.NodeOutput:
        stops = _parse_ramp(ramp)
        rgb = image[..., :3]
        luma = (rgb * torch.tensor(_LUMA_WEIGHTS, device=rgb.device, dtype=rgb.dtype)).sum(-1)
        if invert:
            luma = 1.0 - luma
        mapped = _sample_ramp(stops, luma)
        out = rgb * (1.0 - strength) + mapped * strength
        if image.shape[-1] > 3:
            out = torch.cat([out, image[..., 3:]], dim=-1)
        return io.NodeOutput(out)


class NKDGradientMapExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDGradientMap]


NODE_CLASS_MAPPINGS = {"NKDGradientMap": NKDGradientMap}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDGradientMap": "😺NKD Gradient Map"}
