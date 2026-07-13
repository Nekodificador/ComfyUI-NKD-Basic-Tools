"""NKD Gradient Generate — a gradient image (linear/radial/angular/diamond),
no reference image needed, drawn live as you edit the ramp or drag the
on-canvas handles."""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_color_ramp import (
    _DEFAULT_HANDLES,
    _DEFAULT_RAMP,
    _parse_handles,
    _parse_ramp,
    _position_field,
    _sample_ramp,
)


class NKDGradientGenerate(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDGradientGenerate",
            display_name="😺NKD Gradient Generate",
            category="😺NKD Nodes/Basic",
            description=(
                "Generate a gradient image from a color ramp — linear, "
                "radial, angular (conic) or diamond. Drag the handles on the "
                "preview to set direction and extent; edit the ramp below."
            ),
            inputs=[
                io.Int.Input("width", default=1024, min=8, max=8192, step=8),
                io.Int.Input("height", default=1024, min=8, max=8192, step=8),
                io.Combo.Input("shape", options=["Linear", "Radial", "Angular", "Diamond"],
                               default="Linear"),
                io.String.Input("handles", multiline=False, default=_DEFAULT_HANDLES,
                                socketless=True,
                                tooltip="Gradient handles, dragged on the preview above."),
                io.String.Input("ramp", multiline=False, default=_DEFAULT_RAMP,
                                socketless=True,
                                tooltip="The color ramp, edited above."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="The generated gradient."),
            ],
        )

    @classmethod
    def execute(cls, width, height, shape, handles, ramp) -> io.NodeOutput:
        stops = _parse_ramp(ramp)
        p0, p1 = _parse_handles(handles)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        t = _position_field(shape, width, height, p0, p1, device)
        out = _sample_ramp(stops, t).unsqueeze(0).cpu()
        return io.NodeOutput(out)


class NKDGradientGenerateExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDGradientGenerate]


NODE_CLASS_MAPPINGS = {"NKDGradientGenerate": NKDGradientGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDGradientGenerate": "😺NKD Gradient Generate"}
