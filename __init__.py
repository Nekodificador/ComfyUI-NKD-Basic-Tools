import logging
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_crop_stitch import NKDInpaintCrop, NKDInpaintStitch
from .nkd_string_split import NKDStringSplit
from .nkd_prompt_variables import NKDPromptVariables
from .nkd_gradient_map import NKDGradientMap
from .nkd_gradient_generate import NKDGradientGenerate
from .nkd_film_grain import NKDFilmGrain
from .nkd_noise import NKDNoise
from .nkd_frequency import NKDFrequencySeparate, NKDFrequencyCombine
from .nkd_color_warp import NKDColorWarp
from .nkd_mask_ops import NKDMaskOps, NKDMaskOpsLean
from .nkd_av_latent import NKDAudioMask, NKDAVLatent, NKDAVLatentExtend
from .nkd_mask_painter import NKDMaskPainter
from .nkd_vector_mask import NKDVectorMask
from .nkd_field_blur import NKDFieldBlur
from .nkd_path_blur import NKDPathBlur
from . import nkd_spline_preview  # noqa: F401 — registers /nkd/spline/preview

logging.info("[NKD Basic Tools] loaded — Crop outputs: model, image, mask, latent, crop_data")

WEB_DIRECTORY = "./js"


class NKDBasicToolsExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            NKDInpaintCrop,
            NKDInpaintStitch,
            NKDStringSplit,
            NKDPromptVariables,
            NKDGradientMap,
            NKDGradientGenerate,
            NKDFilmGrain,
            NKDNoise,
            NKDFrequencySeparate,
            NKDFrequencyCombine,
            NKDColorWarp,
            NKDMaskOps,
            NKDMaskOpsLean,
            NKDAudioMask,
            NKDAVLatent,
            NKDAVLatentExtend,
            NKDMaskPainter,
            NKDVectorMask,
            NKDFieldBlur,
            NKDPathBlur,
        ]


async def comfy_entrypoint() -> NKDBasicToolsExtension:
    return NKDBasicToolsExtension()


# Legacy mappings required for custom_nodes/ discovery
NODE_CLASS_MAPPINGS = {
    "NKDInpaintCrop": NKDInpaintCrop,
    "NKDInpaintStitch": NKDInpaintStitch,
    "NKDStringSplit": NKDStringSplit,
    "NKDPromptVariables": NKDPromptVariables,
    "NKDGradientMap": NKDGradientMap,
    "NKDGradientGenerate": NKDGradientGenerate,
    "NKDFilmGrain": NKDFilmGrain,
    "NKDNoise": NKDNoise,
    "NKDFrequencySeparate": NKDFrequencySeparate,
    "NKDFrequencyCombine": NKDFrequencyCombine,
    "NKDColorWarp": NKDColorWarp,
    "NKDMaskOps": NKDMaskOps,
    "NKDMaskOpsLean": NKDMaskOpsLean,
    "NKDAudioMask": NKDAudioMask,
    "NKDAVLatent": NKDAVLatent,
    "NKDAVLatentExtend": NKDAVLatentExtend,
    "NKDMaskPainter": NKDMaskPainter,
    "NKDVectorMask": NKDVectorMask,
    "NKDFieldBlur": NKDFieldBlur,
    "NKDPathBlur": NKDPathBlur,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NKDInpaintCrop": "😺NKD Inpaint Crop",
    "NKDInpaintStitch": "😺NKD Inpaint Stitch",
    "NKDStringSplit": "😺NKD String Split",
    "NKDPromptVariables": "😺NKD Prompt Variables",
    "NKDGradientMap": "😺NKD Gradient Map",
    "NKDGradientGenerate": "😺NKD Gradient Generate",
    "NKDFilmGrain": "😺NKD Film Grain",
    "NKDNoise": "😺NKD Noise",
    "NKDFrequencySeparate": "😺NKD Frequency Separate",
    "NKDFrequencyCombine": "😺NKD Frequency Combine",
    "NKDColorWarp": "😺NKD Color Warp",
    "NKDMaskOps": "😺NKD Mask Ops",
    "NKDMaskOpsLean": "😺NKD Mask Ops Lean",
    "NKDAudioMask": "😺NKD Audio Mask",
    "NKDAVLatent": "😺NKD AV Latent",
    "NKDAVLatentExtend": "😺NKD AV Latent Extend",
    "NKDMaskPainter": "😺NKD Mask Painter",
    "NKDVectorMask": "😺NKD Vector Mask",
    "NKDFieldBlur": "😺NKD Field Blur",
    "NKDPathBlur": "😺NKD Path Blur",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
