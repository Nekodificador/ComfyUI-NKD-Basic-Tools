"""NKDColorWarp — OKLab polar-mesh color grading baked to a 3D LUT."""
import json
import os
import numpy as np

try:
    from .color_core import mesh as _mesh, lut as _lut, cube as _cube, ryb as _ryb  # ComfyUI (package)
except ImportError:
    from color_core import mesh as _mesh, lut as _lut, cube as _cube, ryb as _ryb   # standalone tests (sys.path)

_LUT_SIZE = 33
# Default mesh: columns anchored on the RYB wheel layout (engine OKLCh hues of
# 12 display-uniform spokes), so nodes sit exactly on the cells they edit.
_HUES = np.unwrap(_ryb.display_to_hue(np.arange(12) * 30.0), period=360.0)
_IDENTITY = json.dumps(_mesh.to_dict(_mesh.identity(hues=_HUES)))


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
    from comfy_api.latest import ComfyExtension, io, ui  # noqa: F401
    import folder_paths

    try:
        from .helpers import node_id, preview_frames
    except ImportError:
        from helpers import node_id, preview_frames

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
            _push_source(node_id(cls, unique_id), np_img)
            out_t = torch.from_numpy(out).to(image.device).to(image.dtype)
            return io.NodeOutput(out_t, ui=ui.PreviewImage(preview_frames(out_t), cls=cls))

except Exception:  # not inside ComfyUI (e.g. running unit tests)
    NKDColorWarp = None


# Last frame each node resolved, in insertion order (dict), so the oldest goes
# first when it overflows. A few MB per entry at most — the frames are ≤1024px.
_SOURCE_CACHE: dict = {}
_SOURCE_CACHE_MAX = 8

try:
    from server import PromptServer as _PS
    from aiohttp import web as _web

    @_PS.instance.routes.get("/nkd/colorwarp/source")
    async def _nkd_colorwarp_source(request):
        """The frame this node last resolved, for the editor to open on.

        Same payload as the websocket push. Needed because the push rides on
        execution, and a node whose inputs did not change is served from the
        executor's cache and never runs.
        """
        payload = _SOURCE_CACHE.get(request.rel_url.query.get("node_id", ""))
        if payload is None:
            return _web.Response(status=404, text="no frame for that node yet")
        return _web.json_response(payload)
except Exception:  # not inside ComfyUI (unit tests import this module bare)
    pass


def _push_source(unique_id, np_img):
    if unique_id is None:
        return
    try:
        from server import PromptServer
        import base64
        frame = np.clip(np_img[0], 0.0, 1.0)  # first frame, HWC (float)
        # 16-bit companion (<=256 longest side, little-endian) for the viewer's
        # scatter cloud: reconstructed from this instead of the 8-bit preview,
        # so strong warps don't magnify quantization into streaks. The uint8
        # frame below stays for the on-screen preview (displays are 8-bit).
        sh, sw = frame.shape[:2]
        s_step = max(int(np.ceil(max(sh, sw) / 256)), 1)
        s16 = frame[::s_step, ::s_step]
        s16_h, s16_w = s16.shape[:2]
        s16_buf = (s16 * 65535.0 + 0.5).astype("<u2").tobytes()
        h, w = frame.shape[:2]
        longest = max(h, w)
        if longest > 1024:
            step = int(np.ceil(longest / 1024))
            frame = frame[::step, ::step]
            h, w = frame.shape[:2]
        buf = (frame * 255.0 + 0.5).astype(np.uint8).tobytes()
        payload = {
            "node": str(unique_id),
            "width": w, "height": h,
            "data": base64.b64encode(buf).decode("ascii"),
            "s16_width": s16_w, "s16_height": s16_h,
            "scatter16": base64.b64encode(s16_buf).decode("ascii"),
        }
        # Keep it: the push only fires when this node actually executes, and
        # ComfyUI skips it whenever nothing upstream changed — which is the
        # normal state when you go to open the editor. The frontend fetches
        # this over /nkd/colorwarp/source instead of forcing a re-run.
        _SOURCE_CACHE[str(unique_id)] = payload
        while len(_SOURCE_CACHE) > _SOURCE_CACHE_MAX:
            _SOURCE_CACHE.pop(next(iter(_SOURCE_CACHE)))
        PromptServer.instance.send_sync("nkd-colorwarp-source", payload)
    except Exception:
        pass  # a missing backdrop must never fail a render
