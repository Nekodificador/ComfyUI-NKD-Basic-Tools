"""😺NKD Path Blur — draw the motion, get the motion blur.

Photoshop's Path Blur, or VirtualRig's vectors: draw strokes across the image
and every pixel smears along the direction the nearest strokes imply. The
strokes are sparse; the blur needs a direction at every pixel, so the gap
between the two is where all the work is — see `blur_core.flow_field`.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from . import blur_core, mask_core
from .helpers import node_id, preview_frames, push_source

_DEFAULT_PATHS = '{"v":1,"paths":[]}'
# The flow field is smooth by construction, so it is solved at this size and
# upsampled. Bigger costs more and changes nothing visible.
_FIELD_SIZE = 512
# More taps than this and the cost stops buying anything; fewer than this and a
# fast smear breaks into visible steps. Strength is capped to match.
_MIN_TAPS, _MAX_TAPS = 9, 33


class NKDPathBlur(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDPathBlur",
            display_name="😺NKD Path Blur",
            category="😺NKD Nodes/Basic",
            description=(
                "Draw strokes showing which way things move and the image smears "
                "along them — directional motion blur that curves, instead of the "
                "one straight angle a normal motion blur gives you. Each stroke "
                "has its own speed — and Ctrl-dragging a point gives that point "
                "its own on top, so one stroke can accelerate along its length — "
                "and the direction between strokes is blended, "
                "so a few strokes describe a whole frame. Areas far from every "
                "stroke stay sharp. Note there is no occlusion information here: "
                "at the ends of a stroke the background will smear over whatever "
                "is in front of it, which is what the mask input is for."
            ),
            is_output_node=True,
            inputs=[
                io.Image.Input("image"),
                io.String.Input("paths", default=_DEFAULT_PATHS, multiline=False,
                                socketless=True),
                io.Float.Input("strength", default=24.0, min=0.0, max=256.0, step=1.0,
                               display_name="Strength",
                               tooltip="How far a pixel travels, in pixels, where a "
                                       "full-speed stroke passes. Very high values break "
                                       "the smear into visible steps — the sampling is "
                                       "capped, so past a point it ghosts rather than blurs."),
                io.Float.Input("spread", default=0.15, min=0.02, max=1.0, step=0.01,
                               display_name="Spread",
                               tooltip="How far each stroke's influence reaches, as a "
                                       "fraction of the image. Small keeps the blur tight "
                                       "around the strokes; large blends them into one "
                                       "smooth field across the whole frame."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional. Where the mask is white the original image "
                                      "is kept — the usual way to stop a blurred background "
                                      "from smearing over the subject."),
            ],
            hidden=[io.Hidden.unique_id],
            outputs=[io.Image.Output()],
        )

    @classmethod
    def execute(cls, image, paths, strength, spread, mask=None, unique_id=None) -> io.NodeOutput:
        push_source(node_id(cls, unique_id), image, mask=mask)
        out = apply_path_blur(image, paths, strength, spread, mask)
        return io.NodeOutput(out, ui=ui.PreviewImage(preview_frames(out), cls=cls))


class NKDPathBlurExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDPathBlur]


async def comfy_entrypoint() -> NKDPathBlurExtension:
    return NKDPathBlurExtension()


NODE_CLASS_MAPPINGS = {"NKDPathBlur": NKDPathBlur}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDPathBlur": "😺NKD Path Blur"}


def apply_path_blur(image, paths, strength, spread, mask=None):
    """The whole node, minus ComfyUI. Shared with the editor's preview route so
    what the editor shows is what the graph renders — the only way a preview is
    worth trusting."""
    items = blur_core.parse_items(paths, "paths")
    if not items or strength <= 0.0:
        return image

    src_device, src_dtype = image.device, image.dtype
    b, h, w, _ = image.shape

    def run(device):
        scale = _FIELD_SIZE / max(h, w)
        fh = max(8, min(h, int(round(h * scale)))) if scale < 1 else h
        fw = max(8, min(w, int(round(w * scale)))) if scale < 1 else w

        got = blur_core.flow_field(items, fh, fw, spread, device)
        if got is None:
            return None
        direction, speed, conf = got

        up = dict(size=(h, w), mode="bilinear", align_corners=False)
        direction = F.interpolate(direction, **up)
        direction = direction / (direction.norm(dim=1, keepdim=True) + 1e-9)
        amount = F.interpolate(speed * conf, **up) * float(strength)
        flow = direction * amount                                  # [1,2,H,W] px

        taps = int(float(amount.max())) | 1
        taps = max(_MIN_TAPS, min(_MAX_TAPS, taps))

        img = image.to(device=device, dtype=torch.float32).permute(0, 3, 1, 2)

        def blur_chunk(t):
            return blur_core.line_blur(t, flow.expand(t.shape[0], -1, -1, -1), taps)

        out = mask_core._map_frames(blur_chunk, img)

        if mask is not None:
            m = mask.to(device=device, dtype=torch.float32)
            if m.dim() == 2:
                m = m.unsqueeze(0)
            m = m.unsqueeze(1)
            if m.shape[-2:] != (h, w):
                m = F.interpolate(m, size=(h, w), mode="bilinear", align_corners=False)
            if m.shape[0] != b:
                m = m[:1].expand(b, -1, -1, -1)
            out = out * (1.0 - m) + img * m

        return out.permute(0, 2, 3, 1)

    device = mask_core._work_device(image)
    try:
        out = run(device)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        out = run(torch.device("cpu"))
    if out is None:
        return image
    return out.to(device=src_device, dtype=src_dtype)
