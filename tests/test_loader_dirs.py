"""model_directories: which models/ folder holds each file the loaders of a preset load.

No ComfyUI needed; nkd_loader's ComfyUI imports are stubbed:

    python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_loader_dirs.py
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

for name in ("folder_paths", "nodes", "comfy_api", "comfy_api.latest", "comfy_execution",
             "comfy_execution.graph_utils"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["comfy_api.latest"].io = types.SimpleNamespace(ComfyNode=object)
sys.modules["comfy_execution.graph_utils"].GraphBuilder = object

from nkd_loader import model_directories  # noqa: E402

LISTINGS = {
    "diffusion_models": ["flux2-klein\\klein.safetensors", "shared.safetensors"],
    "vae": ["flux2-vae.safetensors"],
    "text_encoders": ["qwen_3_8b.safetensors"],
    "loras": ["shared.safetensors"],
}


def test_each_file_gets_its_folder():
    got = model_directories(
        ["flux2-klein\\klein.safetensors", "flux2-vae.safetensors", "qwen_3_8b.safetensors"], LISTINGS)
    assert got == {"flux2-klein\\klein.safetensors": "diffusion_models",
                   "flux2-vae.safetensors": "vae",
                   "qwen_3_8b.safetensors": "text_encoders"}, got


def test_unknown_file_gets_no_folder():
    # A guessed folder would stop ComfyUI from matching the declared model, so there is none.
    assert model_directories(["nope.safetensors"], LISTINGS) == {}
    assert model_directories([], LISTINGS) == {}


def test_same_file_in_two_folders():
    assert model_directories(["shared.safetensors"], LISTINGS) == {"shared.safetensors": "diffusion_models"}


def test_subfolder_is_part_of_the_name():
    # The widget value carries the subfolder, so the plain file name is not a match.
    assert model_directories(["klein.safetensors"], LISTINGS) == {}


if __name__ == "__main__":
    test_each_file_gets_its_folder()
    test_unknown_file_gets_no_folder()
    test_same_file_in_two_folders()
    test_subfolder_is_part_of_the_name()
    print("loader dirs OK")
