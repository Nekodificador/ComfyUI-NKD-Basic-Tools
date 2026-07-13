import logging
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_crop_stitch import NKDInpaintCrop, NKDInpaintStitch
from .nkd_string_split import NKDStringSplit
from .nkd_prompt_variables import NKDPromptVariables
from .nkd_gradient_map import NKDGradientMap
from .nkd_gradient_generate import NKDGradientGenerate

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
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NKDInpaintCrop": "😺NKD Inpaint Crop",
    "NKDInpaintStitch": "😺NKD Inpaint Stitch",
    "NKDStringSplit": "😺NKD String Split",
    "NKDPromptVariables": "😺NKD Prompt Variables",
    "NKDGradientMap": "😺NKD Gradient Map",
    "NKDGradientGenerate": "😺NKD Gradient Generate",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
