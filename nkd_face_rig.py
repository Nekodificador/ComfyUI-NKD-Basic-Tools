# coding: utf-8
"""
😺NKD Face Rig — edit a portrait's expression with a rig instead of sliders.

The node is deliberately thin. The expression lives in one hidden STRING that
the canvas editor writes, exactly like the spline nodes: the graph stores a rig
pose, the node turns it into an image. Everything interesting is in
`nkd_face_rig_axes` (what the handles mean) and `nkd_face_rig_engine` (the
LivePortrait pipeline).

The source cache is what makes the editor feel live. Preparing a photo — crop,
landmarks, the appearance volume — costs about a second; rendering a new
expression from it costs 25 ms. So the prepared source is kept per node and
reused by the preview route while the editor is open, and only rebuilt when the
photo or the crop actually changes.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np
import torch
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from . import nkd_face_rig_axes as axes
from .nkd_face_rig_engine import Engine

NKDExpression = io.Custom("NKD_EXPRESSION")


@dataclass
class Expression:
    """A pose, in the units the engine composes with.

    Add and scale are all it needs to support: presets blend, chained rigs
    stack, and an intensity dial is a multiply. Same algebra as upstream's
    `ExpressionSet`, which is what made its saved expressions mixable.
    """

    exp: np.ndarray = field(default_factory=lambda: np.zeros((1, 21, 3), np.float32))
    rot: np.ndarray = field(default_factory=lambda: np.zeros(3, np.float32))
    scale: float = 0.0
    trans: np.ndarray = field(default_factory=lambda: np.zeros(2, np.float32))

    def __add__(self, other):
        return Expression(self.exp + other.exp, self.rot + other.rot,
                          self.scale + other.scale, self.trans + other.trans)

    def __mul__(self, k: float):
        return Expression(self.exp * k, self.rot * k, self.scale * k, self.trans * k)


# node_id -> (fingerprint, PreparedSource). One entry per node: a graph with
# three rigs on three photos keeps three, and re-running with the same photo
# reuses them.
_SOURCES: dict = {}


def _fingerprint(rgb: np.ndarray, crop_factor: float) -> str:
    return hashlib.blake2b(rgb.tobytes(), digest_size=16,
                           salt=b"nkdfacerig").hexdigest() + ":%.3f" % crop_factor


def prepared_source(node_id, rgb: np.ndarray, crop_factor: float):
    """The cached `PreparedSource` for this node, rebuilt only when it must be."""
    key = str(node_id)
    fp = _fingerprint(rgb, crop_factor)
    hit = _SOURCES.get(key)
    if hit is not None and hit[0] == fp:
        return hit[1]
    src = Engine.get().prepare(rgb, crop_factor)
    _SOURCES[key] = (fp, src)
    return src


def cached_source(node_id):
    """Whatever this node last prepared, or None. Used by the preview route."""
    hit = _SOURCES.get(str(node_id))
    return hit[1] if hit else None


def to_uint8(image: torch.Tensor) -> np.ndarray:
    """[B,H,W,C] float 0..1 -> the first frame as uint8 RGB.

    Truncation, not rounding, on purpose: the established expression pipeline
    converts with `.byte()`, and the off-by-ones it introduces feed the model.
    Byte-exact compatibility starts here.
    """
    return (image * 255).byte().cpu().numpy()[0]


def to_tensor(rgb: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(rgb.astype(np.float32) / 255.0)[None]


def pose_from_state(state: dict, library=None) -> Expression:
    """Rig state -> Expression, applying the axis library the state asks for."""
    lib = library if library is not None else axes.load_axes()
    if state.get("ortho"):
        lib = axes.orthogonalize(lib)
    weights = axes.blend(state.get("w") or {}, state.get("p") or {}, lib)
    exp, rot = axes.compose(weights, lib)
    return Expression(exp=exp, rot=rot + np.array(state.get("rot") or [0, 0, 0], np.float32),
                      scale=float(state.get("scale", 0.0)),
                      trans=np.array(state.get("trans") or [0, 0], np.float32))


class NKDFaceRig(io.ComfyNode):
    """Pose a portrait's face from a canvas rig."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFaceRig",
            display_name="😺NKD Face Rig",
            category="😺NKD Nodes/Face",
            description=(
                "Edit a portrait's expression with draggable controls sitting on the face "
                "itself, previewed live. Open the rig from the node's button; the handles "
                "hang off the detected landmarks, left and right eyes and brows move "
                "independently, and the expression presets are the standard FACS "
                "combinations rather than invented ones."
            ),
            inputs=[
                io.Image.Input("image", tooltip="The portrait to pose. Only the first frame is used."),
                io.String.Input(
                    "rig", multiline=True, default="",
                    tooltip="The rig pose, written by the editor. Editing it by hand is "
                            "allowed but the editor is easier."),
                io.Float.Input(
                    "crop_factor", default=2.0, min=1.5, max=3.0, step=0.05,
                    tooltip="How much around the face to take in. Larger keeps more hair "
                            "and shoulders but gives the model less face to work with."),
                io.Float.Input(
                    "src_ratio", default=1.0, min=0.0, max=1.0, step=0.01,
                    tooltip="How much of the expression already in the photo to keep. "
                            "Lower it to neutralise a face that is already smiling before "
                            "posing it."),
                io.Boolean.Input(
                    "stitching", default=True,
                    tooltip="Blend the posed face back into the original shoulders. Turn it "
                            "off only to see the raw crop."),
                io.Boolean.Input(
                    "enhanced_composite", default=True,
                    tooltip="Bicubic upsampling when pasting the 512 render back into the "
                            "picture. Off = classic bilinear paste, for byte-exact "
                            "compatibility with older expression workflows."),
                io.Boolean.Input(
                    "expressions", default=False,
                    tooltip="Show the expression preset sliders. They layer the standard "
                            "EMFACS combinations on top of whatever the handles say."),
                # The preset dials are native widgets so the graph shows and
                # serialises them like any other value; the `expressions`
                # toggle above folds them away (frontend behaviour).
                *[io.Float.Input(name, default=0.0, min=0.0, max=1.0, step=0.05,
                                 tooltip="Layered on top of the rig pose.")
                  for name in axes.PRESETS],
                NKDExpression.Input(
                    "expression", optional=True,
                    tooltip="An expression from another rig, added on top of this one."),
            ],
            outputs=[
                io.Image.Output(display_name="image"),
                io.Mask.Output(
                    display_name="face_mask",
                    tooltip="The feathered paste region, aligned with the output image — "
                            "feed it to a face detailer to refine exactly what the "
                            "512 renderer touched."),
                NKDExpression.Output(display_name="expression"),
            ],
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    def execute(cls, image, rig, crop_factor, src_ratio, stitching,
                enhanced_composite=True, expressions=False, expression=None,
                **presets):
        rgb = to_uint8(image)
        src = prepared_source(cls.hidden.unique_id, rgb, float(crop_factor))

        # The preset widgets are the single source of truth for the dials —
        # whatever `p` the rig JSON carries is a mirror kept by the editor and
        # is replaced, never added, so nothing applies twice.
        state = axes.deserialise(rig)
        state["p"] = {k: float(v) for k, v in presets.items() if v}
        pose = pose_from_state(state)
        if expression is not None:
            pose = pose + expression

        out = Engine.get().render(
            src, pose.exp, pose.rot, scale=pose.scale, trans=pose.trans,
            src_ratio=float(src_ratio), stitching=bool(stitching), paste=True,
            composite="enhanced" if enhanced_composite else "classic",
        )
        # The paste mask, aligned with the composited image: this is exactly
        # the region the 512 renderer touched, which is what a downstream
        # face detailer should be pointed at.
        mask = torch.from_numpy(src.mask_ori.mean(axis=2).astype(np.float32))[None]
        # No thumbnail: the editor in the node already shows the posed face,
        # and the preview was one more square of the same picture.
        return io.NodeOutput(to_tensor(out), mask, pose)


class NKDFaceRigExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list:
        return [NKDFaceRig]


async def comfy_entrypoint() -> NKDFaceRigExtension:
    return NKDFaceRigExtension()
