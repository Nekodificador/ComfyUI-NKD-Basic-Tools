"""NKD Inpaint Crop / Stitch — standalone crop-around-mask + composite-back pair.

Crop isolates the masked region (plus context padding), resamples it to a
megapixel budget for sampling, and packs everything Stitch needs into a single
NKD_CROPDATA cable. Stitch composites the processed patch back onto the
original image at its native resolution, feathered by the processed mask.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import Optional, Tuple
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui
from comfy_api.latest._io import comfytype, ComfyTypeIO

from .helpers import (
    _HAS_CV2,
    _box_preview,
    _crop_by_mask,
    _mask_fill_holes,
    _mask_grow,
    _megapixels_to_pixels,
    _post_blend,
    _resize_mask,
    _separate_regions,
    _uncrop,
)


def _apply_differential_diffusion(model, blend: float = 1.0):
    """Patch the model so the soft noise_mask drives per-pixel denoise strength.
    Same behavior as core's DifferentialDiffusion node (adapted from
    https://github.com/exx8/differential-diffusion), applied inline so the
    workflow doesn't need the extra node. `blend` mixes the per-step binary
    mask with the original soft mask (1.0 = full differential diffusion)."""
    def forward(sigma: torch.Tensor, denoise_mask: torch.Tensor, extra_options: dict):
        inner = extra_options["model"]
        step_sigmas = extra_options["sigmas"]
        sigma_to = inner.inner_model.model_sampling.sigma_min
        if step_sigmas[-1] > sigma_to:
            sigma_to = step_sigmas[-1]
        sigma_from = step_sigmas[0]
        ts_from = inner.inner_model.model_sampling.timestep(sigma_from)
        ts_to = inner.inner_model.model_sampling.timestep(sigma_to)
        current_ts = inner.inner_model.model_sampling.timestep(sigma[0])
        threshold = (current_ts - ts_to) / (ts_from - ts_to)
        binary_mask = (denoise_mask >= threshold).to(denoise_mask.dtype)
        if blend < 1.0:
            return blend * binary_mask + (1.0 - blend) * denoise_mask
        return binary_mask

    model = model.clone()
    model.set_model_denoise_mask_function(forward)
    return model


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
            is_output_node=True,
            inputs=[
                io.Model.Input("model", optional=True,
                               tooltip="Optional. When connected, the model output comes back "
                                       "patched with Differential Diffusion so the soft mask "
                                       "drives per-pixel denoise strength."),
                io.Vae.Input("vae", optional=True,
                             tooltip="Optional. When connected, the latent output is the crop "
                                     "already encoded with its noise_mask set — ready to sample."),
                io.Image.Input("image"),
                io.Mask.Input("mask"),
                io.Boolean.Input("invert_mask", default=False,
                                 tooltip="Invert the mask before processing."),
                io.Boolean.Input("fill_holes", default=True,
                                 tooltip="Fill fully-enclosed holes in the mask before processing."),
                io.Int.Input("mask_expand", default=20, min=0, max=512,
                             tooltip="Grow the mask outward by this many pixels before cropping."),
                io.Int.Input("mask_blur", default=10, min=0, max=256,
                             tooltip="Feather the mask edge by this many pixels. This same "
                                     "softness is used by Stitch when compositing back."),
                io.Float.Input("inpaint_blend", default=1.0, min=0.0, max=1.0, step=0.01,
                               tooltip="Strength of the Differential Diffusion mask (only used "
                                       "when model is connected). Controls how sharp the "
                                       "transition is between the regenerated area and the "
                                       "original. 1.0 = full differential diffusion; lower "
                                       "values fade the two together more gently."),
                io.Int.Input("padding", default=50, min=0, max=2048,
                             tooltip="Context around the mask included in the crop, in pixels."),
                io.Combo.Input("resize_mode",
                               options=["Automatic", "Megapixels", "Longest Side"],
                               default="Automatic",
                               tooltip="How the crop's sampling resolution is chosen. "
                                       "Automatic: keep native resolution while the crop fits "
                                       "between min/max, only rescaling when it falls outside. "
                                       "Megapixels: fixed pixel budget. Longest Side: exact "
                                       "size of the longest side."),
                io.Float.Input("megapixels", default=1.0, min=0.0, max=16.0, step=0.05,
                               tooltip="Resolution budget for the cropped region, in megapixels "
                                       "(1.0 = 1024×1024). The crop is resampled to this size "
                                       "for sampling and restored on Stitch. "
                                       "0 = native: no resample, pixel-perfect restore."),
                io.Int.Input("longest_side", default=1024, min=16, max=8192, step=16,
                             tooltip="Exact size of the crop's longest side after resampling, "
                                     "in pixels."),
                io.Int.Input("min_resolution", default=768, min=64, max=4096, step=16,
                             tooltip="Automatic mode: if the crop's short side is smaller than "
                                     "this, it is scaled up to reach it."),
                io.Int.Input("max_resolution", default=2048, min=64, max=16384, step=16,
                             tooltip="Automatic mode: if the crop's long side is larger than "
                                     "this, it is scaled down to fit it. Crops between min and "
                                     "max keep their native resolution (pixel-perfect restore)."),
                io.Boolean.Input("separate_regions", default=False,
                                 tooltip="Chained detailing: split the mask into individual "
                                         "regions (connected components, or one per mask when "
                                         "a mask batch is connected) and emit one crop per "
                                         "region as a list. Downstream sampler nodes run once "
                                         "per region automatically; Stitch composites them all "
                                         "back."),
                io.Float.Input("region_min_area", default=0.1, min=0.0, max=100.0, step=0.05,
                               tooltip="Discard regions smaller than this percentage of the "
                                       "image area."),
                io.Int.Input("max_regions", default=8, min=1, max=64,
                             tooltip="Process at most this many regions."),
                io.Combo.Input("region_order",
                               options=["Largest First", "Left to Right", "Top to Bottom"],
                               default="Largest First",
                               tooltip="Order in which the regions are detailed."),
            ],
            outputs=[
                io.Model.Output(display_name="model",
                                tooltip="Model patched with Differential Diffusion. "
                                        "Requires model."),
                io.Image.Output(display_name="image", is_output_list=True,
                                tooltip="Cropped region(s), resampled per resize mode. One "
                                        "list item per region; downstream nodes run once per "
                                        "item."),
                io.Mask.Output(display_name="mask", is_output_list=True,
                               tooltip="Processed mask cropped to each region."),
                io.Latent.Output(display_name="latent", is_output_list=True,
                                 tooltip="Encoded crop(s) with noise_mask set. Requires vae."),
                NKDCropDataType.Output("crop_data", is_output_list=True,
                                       tooltip="Everything Stitch needs to composite back."),
            ],
        )

    @classmethod
    def execute(cls, image, mask, invert_mask, fill_holes, mask_expand, mask_blur,
                inpaint_blend, padding, resize_mode, megapixels, longest_side,
                min_resolution, max_resolution, separate_regions=False,
                region_min_area=0.1, max_regions=8, region_order="Largest First",
                model=None, vae=None) -> io.NodeOutput:
        _, ih, iw, _ = image.shape
        m = mask if mask.dim() == 3 else mask.unsqueeze(0)
        m = _resize_mask(m, iw, ih)
        if invert_mask:
            m = 1.0 - m
        if fill_holes:
            m = _mask_fill_holes(m)

        if separate_regions:
            regions = _separate_regions(m, region_min_area / 100.0, max_regions,
                                        region_order)
            if not regions:
                regions = [m[0]]
            # One grow pass over the whole stack — GPU-batched.
            grown = _mask_grow(torch.stack(regions, dim=0), mask_expand, mask_blur)
            region_masks = [grown[i:i + 1] for i in range(grown.shape[0])]
            union = grown.max(dim=0, keepdim=True).values
        else:
            processed = _mask_grow(m, mask_expand, mask_blur)
            region_masks = [processed]
            union = processed

        target_pixels = longest = min_side = max_side = 0
        if resize_mode == "Automatic":
            min_side, max_side = min_resolution, max_resolution
        elif resize_mode == "Longest Side":
            longest = longest_side
        else:
            target_pixels = _megapixels_to_pixels(megapixels)

        shared_bg = image.cpu()
        images, masks, latents, datas, boxes = [], [], [], [], []
        for rm in region_masks:
            crop_img, crop_mask, crop_box, orig_size = _crop_by_mask(
                image, rm, padding, target_pixels, longest_side=longest,
                min_side=min_side, max_side=max_side
            )
            latent = None
            if vae is not None:
                samples = vae.encode(crop_img[:, :, :, :3])
                noise_mask = _resize_mask(crop_mask, samples.shape[-1], samples.shape[-2])
                latent = {"samples": samples, "noise_mask": noise_mask}
            x1, y1, x2, y2 = crop_box
            datas.append(NKDCropData(
                background=shared_bg,
                crop_box=crop_box,
                original_size=orig_size,
                # Region-sized slice: N full-res masks per bundle would bloat RAM.
                mask=rm[:, y1:y2, x1:x2].cpu(),
            ))
            images.append(crop_img)
            masks.append(crop_mask)
            latents.append(latent)
            boxes.append(crop_box)

        patched_model = (_apply_differential_diffusion(model, inpaint_blend)
                         if model is not None else None)

        preview = _box_preview(image, union, boxes)
        return io.NodeOutput(patched_model, images, masks, latents, datas,
                             ui=ui.PreviewImage(preview, cls=cls))


class NKDInpaintStitch(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDInpaintStitch",
            display_name="😺NKD Inpaint Stitch",
            category="😺NKD Nodes/Basic",
            description=(
                "Composite one or more processed crops back onto the original "
                "image at its native resolution, feathered by the masks from "
                "😺NKD Inpaint Crop. With separate_regions, all detailed regions "
                "are stitched sequentially in one pass."
            ),
            is_input_list=True,
            inputs=[
                io.Image.Input("image", tooltip="The processed (inpainted) crop."),
                NKDCropDataType.Input("crop_data"),
                io.Int.Input("feather", default=10, min=0, max=256,
                             tooltip="Extra edge feathering applied on composite, in pixels."),
                io.Float.Input("edge_hardness", default=0.0, min=0.0, max=1.0, step=0.05,
                               tooltip="Contrast on the blend mask edge (black/white point "
                                       "remap). Collapses the low-alpha fringe where the "
                                       "original background bleeds through as a halo. "
                                       "0 = off, 1 = hard cut."),
                io.Float.Input("match_colors", default=0.0, min=0.0, max=1.0, step=0.05,
                               tooltip="Pulls the patch's colors back toward the original "
                                       "image (statistics read from the unchanged background "
                                       "only). Corrects the white balance / saturation drift "
                                       "the model introduces. 0 = off, 1 = full match."),
                io.Boolean.Input("seamless_edges", default=False,
                                 tooltip="Poisson blending to erase any remaining color or "
                                         "lighting seam at the patch edge. Heavier than a "
                                         "normal blend and can smear textured edges — use "
                                         "when the boundary is still visible after color "
                                         "matching. Requires OpenCV."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="Original image with the patch composited back."),
            ],
        )

    @classmethod
    def execute(cls, image, crop_data, feather, edge_hardness, match_colors,
                seamless_edges) -> io.NodeOutput:
        # is_input_list: every input arrives as a list. Images/crop_datas carry
        # one entry per detailed region; widgets are single-value lists.
        patches, datas = image, crop_data
        feather = feather[0]
        edge_hardness = edge_hardness[0]
        match_colors = match_colors[0]
        seamless_edges = seamless_edges[0]

        device = patches[0].device
        bg = datas[0].background.to(device)
        # Batched sampling over a single-image crop: repeat the background per sample.
        max_b = max(p.shape[0] for p in patches)
        if bg.shape[0] == 1 and max_b > 1:
            bg = bg.repeat(max_b, 1, 1, 1)

        if seamless_edges and not _HAS_CV2:
            logging.warning("NKD Inpaint Stitch: seamless_edges requires OpenCV "
                            "(pip install opencv-python) — falling back to alpha blend.")
            seamless_edges = False
        post = match_colors > 0.0 or seamless_edges
        pristine = bg.clone() if post else None

        out = bg
        alpha_full = (torch.zeros(bg.shape[0], bg.shape[1], bg.shape[2],
                                  device=device, dtype=bg.dtype) if post else None)
        for patch, data in zip(patches, datas):
            mask = data.mask.to(device) if data.mask is not None else None
            out, region_alpha = _uncrop(patch, out, data.crop_box, data.original_size,
                                        mask, feather, hardness=edge_hardness)
            if post:
                x1, y1, x2, y2 = data.crop_box
                alpha_full[:, y1:y2, x1:x2] = torch.maximum(
                    alpha_full[:, y1:y2, x1:x2], region_alpha)

        if post:
            out = _post_blend(pristine, out, alpha_full, match_colors, seamless_edges)
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
