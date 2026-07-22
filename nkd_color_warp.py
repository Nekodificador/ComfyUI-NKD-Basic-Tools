"""NKDColorWarp — OKLab polar-mesh color grading baked to a 3D LUT."""
import json
import os
import numpy as np

from color_core import mesh as _mesh, lut as _lut, cube as _cube

_LUT_SIZE = 33
_IDENTITY = json.dumps(_mesh.to_dict(_mesh.identity()))


def apply_mesh_to_batch(img, mesh_json, size=_LUT_SIZE):
    """Border helper. img: numpy (N,H,W,3) or (H,W,3) in [0,1]. Returns same shape/dtype."""
    arr = np.asarray(img)
    dtype = arr.dtype
    work = arr.astype(np.float64)
    m = _mesh.from_dict(json.loads(mesh_json)) if mesh_json else _mesh.identity()
    lut = _lut.bake(m, size=size)
    out = _lut.apply(lut, work)
    return out.astype(dtype)


def bake_cube(mesh_json, path, size=_LUT_SIZE, title="NKD Color Warp"):
    m = _mesh.from_dict(json.loads(mesh_json)) if mesh_json else _mesh.identity()
    _cube.write(path, _lut.bake(m, size=size), title=title)
    return path


# --- ComfyUI V3 node (only imported inside ComfyUI; guarded so tests skip it) ---
try:
    import torch
    from comfy_api.latest import ComfyExtension, io  # noqa: F401
    import folder_paths

    class NKDColorWarp(io.ComfyNode):
        @classmethod
        def define_schema(cls):
            return io.Schema(
                node_id="NKDColorWarp",
                display_name="😺NKD Color Warp",
                category="😺NKD Nodes/Basic",
                is_output_node=True,
                inputs=[
                    io.Image.Input("image"),
                    io.String.Input("mesh", multiline=True, default=_IDENTITY,
                                    socketless=True),
                    io.Boolean.Input("save_lut", default=False),
                    io.String.Input("lut_name", default="nkd_color_warp", multiline=False),
                ],
                hidden=[io.Hidden.unique_id],
                outputs=[io.Image.Output()],
            )

        @classmethod
        def execute(cls, image, mesh, save_lut, lut_name, unique_id=None):
            np_img = image.cpu().numpy().astype(np.float64)  # (N,H,W,3)
            out = apply_mesh_to_batch(np_img, mesh, size=_LUT_SIZE)
            if save_lut:
                out_dir = folder_paths.get_output_directory()
                path = os.path.join(out_dir, f"{lut_name}.cube")
                bake_cube(mesh, path, size=_LUT_SIZE)
            _push_source(unique_id, np_img)
            return io.NodeOutput(torch.from_numpy(out).to(image.device).to(image.dtype))

except Exception:  # not inside ComfyUI (e.g. running unit tests)
    NKDColorWarp = None


def _push_source(unique_id, np_img):
    """Filled in Task 7."""
    return
