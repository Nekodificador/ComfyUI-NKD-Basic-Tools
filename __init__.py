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
from .nkd_minimax_guides import NKDMiniMaxGuides
from . import nkd_spline_preview  # noqa: F401 — registers /nkd/spline/preview

try:
    from .nkd_face_crop import NKDFaceCrop, NKDFaceMask, NKDFaceStitch
except Exception as exc:  # onnxruntime and friends are optional
    NKDFaceCrop = NKDFaceMask = NKDFaceStitch = None
    logging.warning("[NKD Basic Tools] 😺NKD Face Crop unavailable: %s", exc)

try:
    from .nkd_face_rig import NKDFaceRig
    from . import nkd_face_rig_routes  # noqa: F401 — registers /nkd/facerig/*
except Exception as exc:  # onnxruntime and friends are optional
    NKDFaceRig = None
    logging.warning("[NKD Basic Tools] 😺NKD Face Rig unavailable: %s", exc)

logging.info("[NKD Basic Tools] loaded — Crop outputs: model, image, mask, latent, crop_data")

WEB_DIRECTORY = "./js"


class NKDBasicToolsExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        nodes = [
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
            NKDMiniMaxGuides,
        ]
        if NKDFaceCrop is not None:
            nodes += [NKDFaceCrop, NKDFaceMask, NKDFaceStitch]
        if NKDFaceRig is not None:
            nodes.append(NKDFaceRig)
        return nodes


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
    "NKDMiniMaxGuides": NKDMiniMaxGuides,
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
    "NKDMiniMaxGuides": "😺NKD MiniMax Guides",
}

if NKDFaceCrop is not None:
    NODE_CLASS_MAPPINGS["NKDFaceCrop"] = NKDFaceCrop
    NODE_CLASS_MAPPINGS["NKDFaceMask"] = NKDFaceMask
    NODE_CLASS_MAPPINGS["NKDFaceStitch"] = NKDFaceStitch
    NODE_DISPLAY_NAME_MAPPINGS["NKDFaceCrop"] = "😺NKD Face Crop"
    NODE_DISPLAY_NAME_MAPPINGS["NKDFaceMask"] = "😺NKD Face Mask"
    NODE_DISPLAY_NAME_MAPPINGS["NKDFaceStitch"] = "😺NKD Face Stitch"

if NKDFaceRig is not None:
    NODE_CLASS_MAPPINGS["NKDFaceRig"] = NKDFaceRig
    NODE_DISPLAY_NAME_MAPPINGS["NKDFaceRig"] = "😺NKD Face Rig"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
