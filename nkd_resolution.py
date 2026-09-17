"""NKD Resolution Selector — width/height from an aspect ratio and a megapixel
budget. Same idea as the native Resolution Selector, with the full ratio list
of NKD Klein Presampling plus "As Reference" (an image) and "Custom".
"""
from __future__ import annotations
import math
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

# (w_parts, h_parts) — None means "derive from the image or the custom size".
_ASPECT_RATIOS = {
    "As Reference":    None,
    "Custom":          None,
    "1:1":             (1, 1),
    "2:3 Vertical":    (2, 3),
    "3:4 Vertical":    (3, 4),
    "3:5 Vertical":    (3, 5),
    "4:5 Vertical":    (4, 5),
    "5:7 Vertical":    (5, 7),
    "5:8 Vertical":    (5, 8),
    "7:9 Vertical":    (7, 9),
    "9:16 Vertical":   (9, 16),
    "9:19 Vertical":   (9, 19),
    "9:21 Vertical":   (9, 21),
    "9:32 Vertical":   (9, 32),
    "3:2 Horizontal":  (3, 2),
    "4:3 Horizontal":  (4, 3),
    "5:3 Horizontal":  (5, 3),
    "5:4 Horizontal":  (5, 4),
    "7:5 Horizontal":  (7, 5),
    "8:5 Horizontal":  (8, 5),
    "9:7 Horizontal":  (9, 7),
    "16:9 Horizontal": (16, 9),
    "19:9 Horizontal": (19, 9),
    "21:9 Horizontal": (21, 9),
    "32:9 Horizontal": (32, 9),
}


def _fit(w_parts: float, h_parts: float, megapixels: float, multiple: int) -> tuple[int, int]:
    scale = math.sqrt(megapixels * 1024 * 1024 / (w_parts * h_parts))
    return (max(multiple, round(w_parts * scale / multiple) * multiple),
            max(multiple, round(h_parts * scale / multiple) * multiple))


class NKDResolutionSelector(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDResolutionSelector",
            display_name="😺NKD Resolution Selector",
            category="😺NKD Nodes/Basic",
            description=(
                "Width and height from an aspect ratio and a megapixel budget. "
                "Same ratio list as NKD Klein Presampling, plus 'As Reference' "
                "to copy the shape of an image and 'Custom' for your own size."
            ),
            inputs=[
                io.Combo.Input("aspect_ratio", options=list(_ASPECT_RATIOS),
                               default="1:1", display_name="Aspect Ratio",
                               tooltip="The shape of the output. 'As Reference' copies "
                                       "the shape of the connected image. 'Custom' uses "
                                       "Custom Width and Custom Height."),
                io.Float.Input("megapixels", default=1.0, min=0.1, max=16.0, step=0.1,
                               display_name="Megapixels",
                               tooltip="Target size in megapixels. 1.0 MP ≈ 1024×1024 "
                                       "for a square. Ignored by 'Custom'."),
                io.ResolutionPreview.Input("preview",
                                           tooltip="Live preview of the output resolution."),
                io.Int.Input("custom_width", default=1024, min=64, max=8192, step=8,
                             display_name="Custom Width",
                             tooltip="Width in pixels. Only used when Aspect Ratio is Custom."),
                io.Int.Input("custom_height", default=1024, min=64, max=8192, step=8,
                             display_name="Custom Height",
                             tooltip="Height in pixels. Only used when Aspect Ratio is Custom."),
                io.Image.Input("image", optional=True,
                               tooltip="Shape source for 'As Reference'."),
                io.Int.Input("multiple", default=16, min=8, max=128, step=4, advanced=True,
                             display_name="Multiple",
                             tooltip="Round the result to a multiple of this. 16 is safe "
                                     "for every current model, 8 for SD-era ones."),
            ],
            outputs=[
                io.Int.Output(display_name="width"),
                io.Int.Output(display_name="height"),
            ],
        )

    @classmethod
    def execute(cls, aspect_ratio: str, megapixels: float, custom_width: int,
                custom_height: int, multiple: int, image=None, preview=None) -> io.NodeOutput:
        parts = _ASPECT_RATIOS[aspect_ratio]
        if aspect_ratio == "As Reference" and image is not None:
            parts = (image.shape[2], image.shape[1])
        if parts is None:  # Custom, or As Reference with nothing plugged in
            return io.NodeOutput(*_fit(custom_width, custom_height,
                                       custom_width * custom_height / 1024 / 1024, multiple))
        return io.NodeOutput(*_fit(*parts, megapixels, multiple))


class NKDResolutionExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDResolutionSelector]


async def comfy_entrypoint() -> NKDResolutionExtension:
    return NKDResolutionExtension()


if __name__ == "__main__":
    assert _fit(1, 1, 1.0, 16) == (1024, 1024)
    assert _fit(16, 9, 1.0, 16) == (1360, 768)
    assert _fit(1000, 1000, 1000 * 1000 / 1024 / 1024, 16) == (992, 992)
    print("ok")
