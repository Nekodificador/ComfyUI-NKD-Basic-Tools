"""NKD Gradient Generate — a gradient image (linear/radial/angular/diamond),
no reference image needed, drawn live as you edit the ramp."""
from __future__ import annotations
import math
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from .nkd_color_ramp import _DEFAULT_RAMP, _parse_ramp, _sample_ramp


def _position_field(shape: str, width: int, height: int, angle: float,
                    center_x: float, center_y: float, device) -> torch.Tensor:
    """Returns a [H, W] tensor in [0, 1] describing where each pixel falls
    along the gradient, per shape."""
    ys = torch.linspace(0.0, 1.0, height, device=device).view(height, 1).expand(height, width)
    xs = torch.linspace(0.0, 1.0, width, device=device).view(1, width).expand(height, width)
    dx, dy = xs - center_x, ys - center_y

    if shape == "Radial":
        corners = [(-center_x, -center_y), (1 - center_x, -center_y),
                  (-center_x, 1 - center_y), (1 - center_x, 1 - center_y)]
        max_dist = max(math.hypot(cx, cy) for cx, cy in corners) or 1.0
        return (torch.hypot(dx, dy) / max_dist).clamp(0.0, 1.0)

    if shape == "Angular":
        theta = torch.atan2(dy, dx) + math.radians(angle)
        return (theta / (2 * math.pi)) % 1.0

    if shape == "Diamond":
        corners = [(-center_x, -center_y), (1 - center_x, -center_y),
                  (-center_x, 1 - center_y), (1 - center_x, 1 - center_y)]
        max_extent = max(abs(cx) + abs(cy) for cx, cy in corners) or 1.0
        return ((dx.abs() + dy.abs()) / max_extent).clamp(0.0, 1.0)

    # Linear (default): project every pixel onto the angled axis, normalised
    # so the gradient spans corner-to-corner regardless of angle.
    rad = math.radians(angle)
    ax, ay = math.cos(rad), math.sin(rad)
    proj = dx * ax + dy * ay
    corners = [(-center_x, -center_y), (1 - center_x, -center_y),
              (-center_x, 1 - center_y), (1 - center_x, 1 - center_y)]
    projections = [cx * ax + cy * ay for cx, cy in corners]
    lo, hi = min(projections), max(projections)
    span = (hi - lo) or 1.0
    return ((proj - lo) / span).clamp(0.0, 1.0)


class NKDGradientGenerate(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDGradientGenerate",
            display_name="😺NKD Gradient Generate",
            category="😺NKD Nodes/Basic",
            description=(
                "Generate a gradient image from a color ramp — linear, "
                "radial, angular (conic) or diamond. Drawn live as you edit "
                "the ramp, no guessing needed."
            ),
            is_output_node=True,
            inputs=[
                io.Int.Input("width", default=1024, min=8, max=8192, step=8),
                io.Int.Input("height", default=1024, min=8, max=8192, step=8),
                io.Combo.Input("shape", options=["Linear", "Radial", "Angular", "Diamond"],
                               default="Linear"),
                io.Float.Input("angle", default=0.0, min=-360.0, max=360.0, step=1.0,
                               display_name="Angle",
                               tooltip="Direction of the gradient, in degrees. "
                                       "Used by Linear and Angular."),
                io.Float.Input("center_x", default=0.5, min=0.0, max=1.0, step=0.01,
                               display_name="Center X",
                               tooltip="Horizontal center, as a fraction of the width. "
                                       "Used by Radial, Angular and Diamond."),
                io.Float.Input("center_y", default=0.5, min=0.0, max=1.0, step=0.01,
                               display_name="Center Y",
                               tooltip="Vertical center, as a fraction of the height. "
                                       "Used by Radial, Angular and Diamond."),
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
    def execute(cls, width, height, shape, angle, center_x, center_y, ramp) -> io.NodeOutput:
        stops = _parse_ramp(ramp)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        t = _position_field(shape, width, height, angle, center_x, center_y, device)
        out = _sample_ramp(stops, t).unsqueeze(0).cpu()
        return io.NodeOutput(out, ui=ui.PreviewImage(out, cls=cls))


class NKDGradientGenerateExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDGradientGenerate]


NODE_CLASS_MAPPINGS = {"NKDGradientGenerate": NKDGradientGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDGradientGenerate": "😺NKD Gradient Generate"}
