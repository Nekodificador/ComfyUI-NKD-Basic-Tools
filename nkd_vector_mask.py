"""😺NKD Vector Mask — hand-drawn Bezier / B-spline shapes as a mask.

Rotoscoping in the graph instead of a round trip through Photoshop or Nuke: draw
closed shapes over the image, get a MASK. Shapes are stored as control points in
the workflow, so they stay editable forever and survive a resolution change.

The curve maths lives in the editor, not here — see `blur_core` for why. This
node only ever sees the flattened polylines.
"""
from __future__ import annotations

import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from . import blur_core, mask_core
from .helpers import node_id, preview_frames, push_source

_DEFAULT_SHAPES = '{"v":1,"shapes":[]}'


class NKDVectorMask(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDVectorMask",
            display_name="😺NKD Vector Mask",
            category="😺NKD Nodes/Masking",
            description=(
                "Draw mask shapes by hand over the image with a pen tool and get "
                "a MASK out. Points can be smooth Bezier with handles, or "
                "B-spline for the fewest possible points on an organic outline — "
                "per shape, and mixable. Double-click a point for a hard corner. "
                "Shapes marked Subtract cut holes out of the ones before them, "
                "each with its own feather, so a soft cut-out is one shape rather "
                "than a second node. Ctrl-drag a point to pull out a feather clone "
                "and place it where the edge should have faded to nothing, so one "
                "part of the outline blends away while the rest stays crisp. "
                "The shapes live in the workflow as control "
                "points, so they stay editable and survive a resolution change."
            ),
            is_output_node=True,
            inputs=[
                io.Image.Input("image", tooltip="The image to draw over. Its size sets the mask size."),
                io.String.Input("shapes", default=_DEFAULT_SHAPES, multiline=False,
                                socketless=True),
                io.Int.Input("expand", default=0, min=-512, max=512,
                             display_name="Expand / Contract",
                             tooltip="Grow every shape outward by this many pixels, or shrink "
                                     "it with a negative value. Runs after the shapes are "
                                     "combined."),
                io.Int.Input("feather", default=0, min=0, max=256,
                             display_name="Feather",
                             tooltip="Soften the whole mask edge by this many pixels. Shapes "
                                     "can also carry their own feather in the editor — this "
                                     "one is on top of that, and runs last."),
                io.Boolean.Input("invert", default=False, display_name="Invert",
                                 tooltip="Swap masked and unmasked."),
            ],
            hidden=[io.Hidden.unique_id],
            outputs=[
                io.Mask.Output(display_name="mask"),
                io.Image.Output(display_name="image"),
            ],
        )

    @classmethod
    def execute(cls, image, shapes, expand, feather, invert, unique_id=None) -> io.NodeOutput:
        # Pushed before anything else can fail: without a backdrop there is
        # nothing to draw on, and an empty shape list is the normal first run.
        push_source(node_id(cls, unique_id), image)

        h, w = int(image.shape[1]), int(image.shape[2])
        cov = blur_core.rasterize(blur_core.parse_items(shapes, "shapes"), w, h)
        out = mask_core.process(cov[None].to(image.device),
                                expand_px=expand, feather_px=feather, invert=invert)
        # One shape set covers the whole batch (v1 has no keyframes). expand()
        # is a view, so a 81-frame clip costs one frame of memory.
        out = out.expand(image.shape[0], h, w)
        return io.NodeOutput(out, image, ui=ui.PreviewMask(preview_frames(out), cls=cls))


class NKDVectorMaskExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDVectorMask]


async def comfy_entrypoint() -> NKDVectorMaskExtension:
    return NKDVectorMaskExtension()


NODE_CLASS_MAPPINGS = {"NKDVectorMask": NKDVectorMask}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDVectorMask": "😺NKD Vector Mask"}
