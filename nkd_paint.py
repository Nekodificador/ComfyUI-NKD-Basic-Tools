"""😺NKD Paint — quick strokes over an optional base image, straight on the node.

Transport mirrors ComfyUI core's Painter (comfy_extras/nodes_painter.py): the
frontend paints an RGBA layer, uploads it as a PNG to `input/nkd_paint/` and only
the filename crosses in the socketless `layer` string. The filename is the SHA-1
of the PNG, so the default execution cache keys on the content for free and no
fingerprint hook is needed. Compositing happens here, never in the browser.
"""
from __future__ import annotations

import numpy as np
import torch
from PIL import Image
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

import folder_paths
import node_helpers

from .helpers import node_id, push_source


def _hex_rgb(hex_color: str) -> tuple[float, float, float]:
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        return (0.0, 0.0, 0.0)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def _solid(h: int, w: int, rgb: tuple[float, float, float]) -> torch.Tensor:
    return torch.tensor(rgb, dtype=torch.float32).view(1, 1, 1, 3).expand(1, h, w, 3).clone()


class NKDPaint(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDPaint",
            display_name="😺NKD Paint",
            category="😺NKD Nodes/Utils",
            # Output node, like Mask Painter: Run refreshes the backdrop even with nothing downstream.
            is_output_node=True,
            description="Paint or scribble straight on the node, over an image or a blank canvas. "
                        "Outputs the untouched image, the painted one, the strokes alone and their exact mask.",
            inputs=[
                io.Image.Input("image", optional=True,
                               tooltip="Optional base image. Sets the canvas size and shows behind the strokes."),
                io.String.Input("layer", default="", socketless=True),
                io.Int.Input("width", default=1024, min=64, max=4096, step=8,
                             tooltip="Canvas width when no image is connected."),
                io.Int.Input("height", default=1024, min=64, max=4096, step=8,
                             tooltip="Canvas height when no image is connected."),
                io.Color.Input("bg_color", default="#000000",
                               tooltip="What the strokes output shows where nothing is painted (and the canvas colour when no image is connected)."),
                io.Boolean.Input("controlnet", default=False,
                                 tooltip="Scribble mode: the brush is always white and strokes is white on black."),
            ],
            outputs=[
                io.Image.Output("image", display_name="image", tooltip="The base image untouched, so the graph can continue from it."),
                io.Image.Output("painted", display_name="painted", tooltip="Strokes blended over the base."),
                io.Image.Output("strokes", display_name="strokes", tooltip="Strokes alone, straight colour with bg_color where there is nothing (white on black in controlnet mode)."),
                io.Mask.Output("mask", display_name="mask", tooltip="Alpha of the strokes."),
            ],
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    def execute(cls, layer: str, width: int, height: int, bg_color: str = "#000000",
                controlnet: bool = False, image=None, unique_id=None) -> io.NodeOutput:
        bg = _hex_rgb(bg_color)
        if image is not None:
            base = image[:1, :, :, :3].cpu().float()
            h, w = base.shape[1], base.shape[2]
        else:
            h, w = height, width
            base = _solid(h, w, bg)

        push_source(node_id(cls, unique_id), base, event="nkd-paint-source")

        stroke_bg = _solid(h, w, (0.0, 0.0, 0.0) if controlnet else bg)

        layer = (layer or "").strip()
        if not layer:
            return io.NodeOutput(base, base, stroke_bg, torch.zeros((1, h, w), dtype=torch.float32))

        png = node_helpers.pillow(Image.open, folder_paths.get_annotated_filepath(layer)).convert("RGBA")
        if png.size != (w, h):
            png = png.resize((w, h), Image.LANCZOS)
        arr = torch.from_numpy(np.asarray(png, dtype=np.float32) / 255.0).unsqueeze(0)  # [1,H,W,4]
        rgb, a = arr[..., :3], arr[..., 3:4]
        if controlnet:
            rgb = torch.ones_like(rgb)

        blended = rgb * a + base * (1.0 - a)
        if controlnet:
            # Soft edges become grey: that IS the line's intensity for a scribble ControlNet.
            strokes = rgb * a + stroke_bg * (1.0 - a)
        else:
            # Straight (unpremultiplied) colour: pair with `mask` in Join Image with Alpha and
            # the soft edges come out clean instead of darkened by bg_color.
            strokes = torch.where(a > 0, rgb, stroke_bg)
        return io.NodeOutput(base, blended, strokes, a[..., 0])


class NKDPaintExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDPaint]


async def comfy_entrypoint() -> NKDPaintExtension:
    return NKDPaintExtension()


NODE_CLASS_MAPPINGS = {"NKDPaint": NKDPaint}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDPaint": "😺NKD Paint"}
