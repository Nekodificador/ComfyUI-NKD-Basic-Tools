"""NKD Inpaint Crop / Stitch — standalone crop-around-mask + composite-back pair.

Crop isolates the masked region (plus context padding), resamples it to a
megapixel budget for sampling, and packs everything Stitch needs into a single
NKD_CROPDATA cable. Stitch composites the processed patch back onto the
original image at its native resolution, feathered by the processed mask.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Tuple
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io
from comfy_api.latest._io import comfytype, ComfyTypeIO

from .helpers import (
    _crop_by_mask,
    _mask_fill_holes,
    _mask_grow,
    _megapixels_to_pixels,
    _resize_mask,
    _uncrop,
)


@dataclass
class NKDCropData:
    background: torch.Tensor                 # [B, H, W, C] original image (kept on CPU)
    crop_box: Tuple[int, int, int, int]      # (x1, y1, x2, y2) in original coords
    original_size: Tuple[int, int]           # (H, W)
    mask: Optional[torch.Tensor]             # [B, H, W] processed mask, original res (CPU)


@comfytype(io_type="NKD_CROPDATA")
class NKDCropDataType(ComfyTypeIO):
    Type = NKDCropData


class NKDInpaintCrop(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDInpaintCrop",
            display_name="😺NKD Inpaint Crop",
            category="😺NKD Nodes/Basic",
            description=(
                "Crop the image around the mask (plus context padding) and "
                "resample the crop to a megapixel budget for sampling. "
                "Connect crop_data to 😺NKD Inpaint Stitch to composite back."
            ),
            inputs=[
                io.Image.Input("image"),
                io.Mask.Input("mask"),
                io.Boolean.Input("fill_holes", default=True,
                                 tooltip="Fill fully-enclosed holes in the mask before processing."),
                io.Int.Input("mask_expand", default=20, min=0, max=512,
                             tooltip="Grow the mask outward by this many pixels before cropping."),
                io.Int.Input("mask_blur", default=10, min=0, max=256,
                             tooltip="Feather the mask edge by this many pixels. This same "
                                     "softness is used by Stitch when compositing back."),
                io.Int.Input("padding", default=50, min=0, max=2048,
                             tooltip="Context around the mask included in the crop, in pixels."),
                io.Float.Input("megapixels", default=1.0, min=0.05, max=16.0, step=0.05,
                               tooltip="Resolution budget for the cropped region, in megapixels "
                                       "(1.0 = 1024×1024). The crop is resampled to this size "
                                       "for sampling and restored on Stitch."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="Cropped region, resampled to the megapixel budget."),
                io.Mask.Output(display_name="mask",
                               tooltip="Processed mask cropped to the same region."),
                NKDCropDataType.Output("crop_data",
                                       tooltip="Everything Stitch needs to composite back."),
            ],
        )

    @classmethod
    def execute(cls, image, mask, fill_holes, mask_expand, mask_blur, padding, megapixels) -> io.NodeOutput:
        _, ih, iw, _ = image.shape
        m = mask if mask.dim() == 3 else mask.unsqueeze(0)
        m = _resize_mask(m, iw, ih)
        if fill_holes:
            m = _mask_fill_holes(m)
        processed = _mask_grow(m, mask_expand, mask_blur)

        crop_img, crop_mask, crop_box, orig_size = _crop_by_mask(
            image, processed, padding, _megapixels_to_pixels(megapixels)
        )

        data = NKDCropData(
            background=image.cpu(),
            crop_box=crop_box,
            original_size=orig_size,
            mask=processed.cpu(),
        )
        return io.NodeOutput(crop_img, crop_mask, data)


class NKDInpaintStitch(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDInpaintStitch",
            display_name="😺NKD Inpaint Stitch",
            category="😺NKD Nodes/Basic",
            description=(
                "Composite a processed crop back onto the original image at its "
                "native resolution, feathered by the mask from 😺NKD Inpaint Crop."
            ),
            inputs=[
                io.Image.Input("image", tooltip="The processed (inpainted) crop."),
                NKDCropDataType.Input("crop_data"),
                io.Int.Input("feather", default=10, min=0, max=256,
                             tooltip="Extra edge feathering applied on composite, in pixels."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="Original image with the patch composited back."),
            ],
        )

    @classmethod
    def execute(cls, image, crop_data, feather) -> io.NodeOutput:
        bg = crop_data.background.to(image.device)
        mask = crop_data.mask.to(image.device) if crop_data.mask is not None else None
        # Batched sampling over a single-image crop: repeat the background per sample.
        if bg.shape[0] == 1 and image.shape[0] > 1:
            bg = bg.repeat(image.shape[0], 1, 1, 1)
        out = _uncrop(image, bg, crop_data.crop_box, crop_data.original_size, mask, feather)
        return io.NodeOutput(out)


class NKDBasicToolsExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDInpaintCrop, NKDInpaintStitch]


async def comfy_entrypoint() -> NKDBasicToolsExtension:
    return NKDBasicToolsExtension()


# Legacy mappings required for custom_nodes/ discovery
NODE_CLASS_MAPPINGS = {
    "NKDInpaintCrop": NKDInpaintCrop,
    "NKDInpaintStitch": NKDInpaintStitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NKDInpaintCrop": "😺NKD Inpaint Crop",
    "NKDInpaintStitch": "😺NKD Inpaint Stitch",
}
