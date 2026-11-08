"""😺NKD Mask Painter — paint a mask straight on the node, over any image the graph made.

Transport is 😺NKD Paint's: the frontend paints a white RGBA layer, uploads it to
`input/nkd_masks/` under the SHA-1 of the PNG, and only that filename travels in the
socketless `image` string. The mask is the layer's alpha. Same content, same name, so
the execution cache keys on the mask for free.

The upstream `mask` is combined here, every run:
  Add / Subtract / Intersect: set operations on (painted, upstream). Nothing is baked,
    the painted layer stays what you painted.
  Use as start / Replace: the upstream is BAKED into the layer, written as a new mask
    file whose name goes back to the frontend (`nkd_layer`), which adopts it. Use as
    start bakes when nothing is painted, Replace whenever the upstream changes.
The upstream itself is also written to temp (`nkd_upstream`) so the editor can show
the combined result before the next run, and Reseed can bake it by hand.

Workflows from before carry a `$<node>-<n>` id in `image`; their mask lives in the old
backup `input/nkd_masks/<node>_mask.png` (L, 255 = masked) and is migrated on first run.
"""
import hashlib
import io as _bio
import os

import folder_paths
import node_helpers
import numpy as np
import torch
from PIL import Image as PILImage
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io
from comfy_api.latest._io import _UIOutput

from .helpers import _safe_annotated_path, _safe_join, _safe_name, node_id, push_source

_SUBFOLDER = "nkd_masks"

# node id -> fingerprint of the last image / upstream mask this node saw. Only for
# on_image_change and Replace, which are about "did it change since last run".
_image_fp: dict[str, tuple] = {}
_upstream_fp: dict[str, tuple] = {}


def _fp(t: torch.Tensor) -> tuple:
    """Cheap content fingerprint: shape, five samples and the sum of the first frame."""
    t = t[0].cpu().float()
    h, w = int(t.shape[0]), int(t.shape[1])
    pts = [t[0, 0], t[0, w - 1], t[h - 1, 0], t[h - 1, w - 1], t[h // 2, w // 2]]
    return (tuple(t.shape), *(p.sum().item() for p in pts), t.sum().item())


def _resize(m: np.ndarray, h: int, w: int) -> np.ndarray:
    if m.shape == (h, w):
        return m
    u8 = PILImage.fromarray((np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(u8.resize((w, h), PILImage.BILINEAR), dtype=np.float32) / 255.0


def _load_layer(value: str, uid: str) -> np.ndarray | None:
    """The painted mask, [H,W] float 1 = masked, at the file's own size. None = nothing painted."""
    value = (value or "").strip()
    if value.startswith("$"):
        p = _safe_join(folder_paths.get_input_directory(), _SUBFOLDER,
                       _safe_name(uid.replace(":", "_"), "node") + "_mask.png")
        if not p or not os.path.isfile(p):
            return None
        return np.asarray(node_helpers.pillow(PILImage.open, p).convert("L"), dtype=np.float32) / 255.0
    if not value:
        return None
    p = _safe_annotated_path(value)
    if not p or not os.path.isfile(p):
        raise ValueError(f"😺NKD Mask Painter: mask file not found in ComfyUI's input folder: {value!r}")
    png = node_helpers.pillow(PILImage.open, p).convert("RGBA")
    return np.asarray(png.getchannel("A"), dtype=np.float32) / 255.0


def _save_layer(m: np.ndarray) -> str:
    """Write a mask the way the frontend does (white, mask in alpha), named by content."""
    a = PILImage.fromarray((np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8))
    png = PILImage.new("RGBA", a.size, (255, 255, 255, 0))
    png.putalpha(a)
    buf = _bio.BytesIO()
    png.save(buf, format="PNG", compress_level=4)
    name = "nkd_mask_" + hashlib.sha1(buf.getvalue()).hexdigest()[:16] + ".png"
    d = os.path.join(folder_paths.get_input_directory(), _SUBFOLDER)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name), "wb") as f:
        f.write(buf.getvalue())
    return f"{_SUBFOLDER}/{name}"


def _save_upstream(m: np.ndarray, uid: str) -> dict:
    name = "nkd_mask_painter_up_" + _safe_name(uid.replace(":", "_"), "node") + ".png"
    PILImage.fromarray((np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8)).save(
        os.path.join(folder_paths.get_temp_directory(), name), compress_level=1)
    return {"filename": name, "subfolder": "", "type": "temp"}


class _MaskPainterUI(_UIOutput):
    def __init__(self, layer: str | None, upstream: dict | None):
        super().__init__()
        self.layer, self.upstream = layer, upstream

    def as_dict(self) -> dict:
        d = {}
        if self.layer is not None:
            d["nkd_layer"] = [self.layer]
        if self.upstream is not None:
            d["nkd_upstream"] = [self.upstream]
        return d


class NKDMaskPainter(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="NKDMaskPainter",
            display_name="😺NKD Mask Painter",
            category="😺NKD Nodes/Masking",
            description=(
                "Paint a mask straight on the node, over any image the graph made. "
                "Brush, eraser and lasso fill. Outputs the image, the mask and its inverse. "
                "Instantiate the node multiple times for independent masks."
            ),
            inputs=[
                io.Image.Input("images"),
                io.String.Input("image", default="", socketless=True),
                io.Combo.Input(
                    "on_image_change",
                    options=["clear_mask", "keep_mask"],
                    default="clear_mask",
                    display_name="On Image Change",
                    tooltip="clear_mask: wipe the painted mask when the input image changes.\n"
                            "keep_mask: keep the painted mask even when the input image changes.",
                ),
                io.Combo.Input(
                    "mask_input_mode",
                    options=["Use as start", "Replace", "Add",
                             "Subtract", "Intersect", "Disconnected"],
                    default="Use as start",
                    display_name="Mask Input Mode",
                    tooltip=(
                        "How to combine the optional `mask` input with what you have painted:\n"
                        "Use as start: copy the upstream mask into the canvas when nothing is "
                        "painted yet. After that your edits stick.\n"
                        "Replace: copy the upstream mask into the canvas every time it changes.\n"
                        "Add: painted plus upstream.\n"
                        "Subtract: painted minus upstream.\n"
                        "Intersect: only where both are set.\n"
                        "Add, Subtract and Intersect never touch what you painted: the editor "
                        "shows the result, Reseed copies the upstream mask into the canvas.\n"
                        "Disconnected: the input is connected but ignored."
                    ),
                ),
                io.Mask.Input(
                    "mask",
                    optional=True,
                    tooltip="Optional upstream mask to start from or combine with what you paint.",
                ),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
                io.Mask.Output("MASK"),
                io.Mask.Output("MASK (inverted)"),
            ],
            is_output_node=True,
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    def execute(cls, images, image, on_image_change, mask_input_mode="Use as start", mask=None):
        uid = str(node_id(cls))
        H, W = int(images.shape[1]), int(images.shape[2])
        push_source(uid, images, event="nkd-paint-source")

        painted = _load_layer(image, uid)
        layer_out = None   # a new layer value for the frontend to adopt; "" = cleared
        if painted is not None:
            painted = _resize(painted, H, W)
        if image.strip().startswith("$"):
            layer_out = _save_layer(painted) if painted is not None else ""

        fp = _fp(images)
        prev = _image_fp.get(uid)
        _image_fp[uid] = fp
        if prev is not None and prev != fp and on_image_change == "clear_mask" and painted is not None:
            painted, layer_out = None, ""

        out = painted if painted is not None else np.zeros((H, W), np.float32)
        upstream_ref = None
        if mask is not None and mask_input_mode != "Disconnected":
            up = _resize(np.clip(mask[0].cpu().float().numpy(), 0, 1), H, W)
            upstream_ref = _save_upstream(up, uid)
            if mask_input_mode == "Use as start":
                if painted is None or painted.max() <= 0:
                    out, layer_out = up, _save_layer(up)
            elif mask_input_mode == "Replace":
                ufp = _fp(mask)
                if _upstream_fp.get(uid) != ufp:
                    out, layer_out = up, _save_layer(up)
                _upstream_fp[uid] = ufp
            elif mask_input_mode == "Add":
                out = np.maximum(out, up)
            elif mask_input_mode == "Subtract":
                out = np.clip(out - up, 0, 1)
            elif mask_input_mode == "Intersect":
                out = np.minimum(out, up)

        m = torch.from_numpy(np.ascontiguousarray(out, dtype=np.float32)).unsqueeze(0)
        return io.NodeOutput(images, m, 1.0 - m, ui=_MaskPainterUI(layer_out, upstream_ref))


class NKDMaskPainterExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMaskPainter]


async def comfy_entrypoint() -> NKDMaskPainterExtension:
    return NKDMaskPainterExtension()


NODE_CLASS_MAPPINGS = {"NKDMaskPainter": NKDMaskPainter}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDMaskPainter": "😺NKD Mask Painter"}
