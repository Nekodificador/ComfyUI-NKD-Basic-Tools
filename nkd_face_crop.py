# coding: utf-8
"""
😺NKD Face Crop / Stitch / Mask — a face, straightened, and put back.

Face models work best on an upright, tightly framed head, and photographs are
neither. These three do that trade: find the face, rotate it level, hand you a
square crop at whatever size the model wants, and later paste the result back
along the same affine — so the head lands at its original angle with nothing
else in the picture touched.

It is the same shape as 😺NKD Inpaint Crop / Stitch, one cable carrying
everything the paste-back needs. What differs is that the region is found for
you and the transform carries a rotation, so the "box" is a matrix.

No dependency is added: the landmark model is the one 😺NKD Face Rig already
fetches, the detector is OpenCV's own 232 KB YuNet, and the mask is drawn from
the landmarks rather than segmented. `nkd_face_core` explains why each of those
is a licence decision as much as a performance one.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
import torch
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io
from comfy_api.latest._io import ComfyTypeIO, comfytype

from . import nkd_face_core as fc
from .helpers import _alpha_hardness, _mask_grow, _post_blend


def _to_numpy(image: torch.Tensor) -> np.ndarray:
    """[H, W, C] float 0..1 -> uint8 RGB, which is what cv2 and ONNX want."""
    return (image[..., :3].detach().clamp(0, 1) * 255).round().to(torch.uint8).cpu().numpy()


def _to_tensor(rgb: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(rgb.astype(np.float32) / 255.0)


@dataclass
class NKDFaceData:
    background: torch.Tensor          # [B, H, W, C] the original image (CPU)
    transforms: list                  # per frame: 3x3 crop -> original affine
    size: int                         # the side of the crop the transforms assume
    masks: Optional[torch.Tensor]     # [B, size, size] paste-back alpha, crop space


@comfytype(io_type="NKD_FACEDATA")
class NKDFaceDataType(ComfyTypeIO):
    Type = NKDFaceData


def _mask_inputs():
    """The mask controls, shared by Crop and Mask.

    A function rather than a constant: the same Input object handed to two
    schemas is one object with two owners, and nothing promises that stays
    harmless.
    """
    return (
        io.Int.Input("face_index", default=0, min=0, max=64,
                     display_name="Face",
                     tooltip="Which face to use when the picture has more than "
                             "one, in order of how sure the detector is. 0 is "
                             "the surest."),
        io.Combo.Input("mask_region", options=fc.REGION_NAMES, default="face",
                       display_name="Mask Region",
                       tooltip="What the mask covers. 'face' is the whole head area, "
                               "'face without features' leaves the eyes and mouth out "
                               "of it, 'skin' also leaves the eyebrows, 'features' is "
                               "only the eyes, brows and mouth, and 'none' returns an "
                               "empty mask."),
        io.Float.Input("forehead", default=1.0, min=0.0, max=2.0, step=0.05,
                       display_name="Forehead",
                       tooltip="How far above the eyebrows the mask reaches. The "
                               "landmarks stop at the brow, so this is an estimate: "
                               "1.0 lands near the hairline on most faces, lower keeps "
                               "the mask below it, higher takes in more scalp."),
        io.Boolean.Input("refine_edges", default=False, display_name="Refine Edges",
                         tooltip="Let the picture decide the last few pixels of the "
                                 "outline instead of the polygon, so the edge follows "
                                 "hair and jaw rather than cutting across them. "
                                 "Slower, and it cannot see through anything held in "
                                 "front of the face."),
    )


def _measure(rgb: np.ndarray, padding: float, index: int = 0):
    """Landmarks for one face in one frame, or a plain error when there is none."""
    boxes = fc.face_boxes(rgb)
    if boxes and index >= len(boxes):
        raise RuntimeError(
            "😺NKD Face Crop: asked for face %d but only %d %s found."
            % (index, len(boxes), "was" if len(boxes) == 1 else "were")
        )
    # Only the face asked for gets measured — the landmark walk is the
    # expensive half, and a group photo would otherwise pay for all of it.
    lmk, settled = fc.FaceLandmarks.get().locate(
        rgb, crop_factor=padding, box=boxes[index] if boxes else None)
    if not settled:
        # The landmark model always returns 203 points, even for a photo of a
        # wall, so "it returned something" is not evidence. The walk failing to
        # settle is the only signal they mean nothing, and silently cropping the
        # middle of the picture is the worse answer.
        raise RuntimeError(
            "😺NKD Face Crop: no face found — the landmark search never settled. "
            "Check the image actually contains a face large enough to find."
        )
    return lmk


class NKDFaceCrop(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFaceCrop",
            display_name="😺NKD Face Crop",
            category="😺NKD Nodes/Face",
            description=(
                "Find the face, rotate it upright and crop it square at the size "
                "your model wants, with a mask drawn from the facial landmarks. "
                "Feed the result to 😺NKD Face Stitch to put it back at its "
                "original angle."
            ),
            inputs=[
                io.Image.Input("image"),
                io.Int.Input("size", default=512, min=64, max=4096, step=64,
                             display_name="Size",
                             tooltip="Side of the square crop, in pixels."),
                io.Float.Input("padding", default=1.7, min=1.0, max=4.0, step=0.05,
                               display_name="Padding",
                               tooltip="How much wider than the face the crop is. "
                                       "1.0 is the face alone; 1.7 leaves room for "
                                       "hair and chin."),
                io.Boolean.Input("upright", default=True, display_name="Upright",
                                 tooltip="Rotate the crop so the head is level. "
                                         "Turn off to keep the original angle and "
                                         "crop axis-aligned."),
                io.Float.Input("offset", default=-0.125, min=-0.5, max=0.5, step=0.01,
                               display_name="Offset",
                               tooltip="Slides the crop along the face's own axis, "
                                       "as a fraction of its size. Negative moves it "
                                       "up, taking in more forehead."),
                *_mask_inputs(),
            ],
            outputs=[
                io.Image.Output(display_name="face",
                                tooltip="The square, upright crop."),
                io.Mask.Output(display_name="mask",
                               tooltip="The face mask, in the crop's coordinates."),
                NKDFaceDataType.Output(display_name="face_data"),
                io.Float.Output(display_name="roll",
                                tooltip="Degrees of tilt taken out of the first "
                                        "frame, positive clockwise."),
            ],
        )

    @classmethod
    def execute(cls, image, size, padding, upright, offset,
                face_index, mask_region, forehead, refine_edges) -> io.NodeOutput:
        crops, masks, transforms, rolls = [], [], [], []
        for frame in image:
            rgb = _to_numpy(frame)
            lmk = _measure(rgb, padding, face_index)
            a = fc.align(rgb, lmk, size=size, padding=padding,
                         upright=upright, offset=offset)
            m = fc.region_mask(a["lmk_crop"], size, size, mask_region, forehead)
            if refine_edges and mask_region != "none":
                m = fc.refine(a["crop"], m)
            crops.append(_to_tensor(a["crop"]))
            masks.append(m)
            transforms.append(a["M_c2o"])
            rolls.append(a["roll"])

        out = torch.stack(crops)
        mask = torch.stack(masks)
        # An empty mask still has to paste something back, or Stitch becomes a
        # no-op the moment somebody picks "none". The whole square is the
        # honest default there.
        paste = mask if mask_region != "none" else torch.ones_like(mask)
        data = NKDFaceData(background=image.cpu(), transforms=transforms,
                           size=int(size), masks=paste)
        return io.NodeOutput(out, mask, data, rolls[0] if rolls else 0.0)


class NKDFaceMask(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFaceMask",
            display_name="😺NKD Face Mask",
            category="😺NKD Nodes/Face",
            description=(
                "A mask of the face, drawn from its landmarks, in the image's own "
                "coordinates. No segmentation model and no extra download — the "
                "same landmarks 😺NKD Face Rig uses, filled in."
            ),
            inputs=[
                io.Image.Input("image"),
                io.Float.Input("padding", default=1.7, min=1.0, max=4.0, step=0.05,
                               display_name="Search Padding",
                               tooltip="How wide the face search frames the head "
                                       "while it looks. Only affects finding the "
                                       "face, not the mask."),
                *_mask_inputs(),
                io.Int.Input("feather", default=0, min=0, max=256,
                             display_name="Feather",
                             tooltip="Softens the mask edge, in pixels."),
                io.Int.Input("expand", default=0, min=-256, max=256,
                             display_name="Expand",
                             tooltip="Grows (or shrinks, when negative) the mask "
                                     "before feathering, in pixels."),
            ],
            outputs=[
                io.Mask.Output(display_name="mask"),
            ],
        )

    @classmethod
    def execute(cls, image, padding, face_index, mask_region, forehead,
                refine_edges, feather, expand) -> io.NodeOutput:
        out = []
        for frame in image:
            rgb = _to_numpy(frame)
            h, w = rgb.shape[:2]
            lmk = _measure(rgb, padding, face_index)
            m = fc.region_mask(lmk, w, h, mask_region, forehead)
            if refine_edges and mask_region != "none":
                m = fc.refine(rgb, m)
            out.append(m)
        mask = torch.stack(out)
        if expand or feather:
            mask = _mask_grow(mask, expand, feather)
        return io.NodeOutput(mask.to(image.device))


class NKDFaceStitch(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFaceStitch",
            display_name="😺NKD Face Stitch",
            category="😺NKD Nodes/Face",
            description=(
                "Put the processed face back where it came from, at its original "
                "angle and size, blended with the mask from 😺NKD Face Crop."
            ),
            inputs=[
                io.Image.Input("image", tooltip="The processed face crop."),
                NKDFaceDataType.Input("face_data"),
                io.Int.Input("feather", default=12, min=0, max=256,
                             display_name="Feather",
                             tooltip="Softens the edge of the pasted area, in "
                                     "pixels of the original image."),
                io.Float.Input("edge_hardness", default=0.0, min=0.0, max=1.0, step=0.05,
                               display_name="Edge Hardness",
                               tooltip="Firms up the blend edge to stop the original "
                                       "face from ghosting through as a halo. "
                                       "0 = off, 1 = hard edge."),
                io.Float.Input("match_colors", default=0.0, min=0.0, max=1.0, step=0.05,
                               display_name="Match Colors",
                               tooltip="Pulls the colors of the new face back toward "
                                       "the original photo. 0 = off, 1 = full match."),
                io.Boolean.Input("seamless_edges", default=False,
                                 display_name="Seamless Edges",
                                 tooltip="Extra pass that erases any remaining color "
                                         "or lighting seam at the edge. Heavier, and "
                                         "can smear fine texture."),
            ],
            outputs=[
                io.Image.Output(display_name="image"),
            ],
        )

    @classmethod
    def execute(cls, image, face_data, feather, edge_hardness, match_colors,
                seamless_edges) -> io.NodeOutput:
        device = image.device
        bg = face_data.background.to(device)
        frames = max(bg.shape[0], image.shape[0])
        if bg.shape[0] == 1 and frames > 1:
            bg = bg.repeat(frames, 1, 1, 1)
        h, w = bg.shape[1], bg.shape[2]

        pasted, alphas = [], []
        for i in range(frames):
            patch = image[min(i, image.shape[0] - 1)]
            m = face_data.transforms[min(i, len(face_data.transforms) - 1)]
            # The patch does not have to come back at the size it left: a
            # detailer or an upscaler changes it. Rescaling the transform is
            # cheaper and sharper than resizing the patch first.
            scale = face_data.size / float(patch.shape[1])
            m = np.asarray(m, np.float64) @ np.diag([scale, scale, 1.0])

            pasted.append(_to_tensor(fc.warp_back(_to_numpy(patch), m, w, h,
                                                  interp=cv2.INTER_CUBIC)))
            crop_alpha = face_data.masks[min(i, face_data.masks.shape[0] - 1)]
            alphas.append(torch.from_numpy(
                fc.warp_back(crop_alpha.cpu().numpy().astype(np.float32), m, w, h)))

        patch_full = torch.stack(pasted).to(device=device, dtype=bg.dtype)
        alpha = torch.stack(alphas).to(device=device, dtype=bg.dtype).clamp(0, 1)
        if feather:
            alpha = _mask_grow(alpha, 0, feather)
        alpha = _alpha_hardness(alpha, edge_hardness)

        out = bg.clone()
        a = alpha.unsqueeze(-1)
        out[..., :3] = patch_full[..., :3] * a + bg[..., :3] * (1.0 - a)
        if match_colors > 0.0 or seamless_edges:
            out = _post_blend(bg, out, alpha, match_colors, seamless_edges)
        return io.NodeOutput(out)


class NKDFaceCropExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDFaceCrop, NKDFaceMask, NKDFaceStitch]


async def comfy_entrypoint() -> NKDFaceCropExtension:
    return NKDFaceCropExtension()


NODE_CLASS_MAPPINGS = {
    "NKDFaceCrop": NKDFaceCrop,
    "NKDFaceMask": NKDFaceMask,
    "NKDFaceStitch": NKDFaceStitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NKDFaceCrop": "😺NKD Face Crop",
    "NKDFaceMask": "😺NKD Face Mask",
    "NKDFaceStitch": "😺NKD Face Stitch",
}
