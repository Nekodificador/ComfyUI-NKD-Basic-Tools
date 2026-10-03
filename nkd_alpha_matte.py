"""😺NKD Alpha Matte — a roto mask turned into a clean RGBA cut-out.

Core's Join Image with Alpha takes the mask as "1 = transparent", so a subject
mask from SAM & co. cuts the subject out instead of keeping it, and it leaves the
soft edge as it is: hair and motion blur still carry the colour of the old
background and halo once composited over a new one.

The edge fix is the blur-fusion foreground estimate (Forte & Pitié, "Approximate
Fast Foreground Colour Estimation", ICIP 2021): estimate the local foreground and
background colours with alpha-weighted blurs, then solve the compositing equation
I = αF + (1-α)B for F. Run twice, wide then tight. Fully opaque pixels come out
untouched; only the semi-transparent band changes.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

import comfy.utils

from . import mask_core

# Frames per trip to the accelerator: the estimate keeps ~a dozen full-res
# buffers alive, so an 81-frame 1080p clip goes through in chunks.
_CHUNK = 8
_EPS = 1e-5


def _blur(x: torch.Tensor, radius: float) -> torch.Tensor:
    b, c, h, w = x.shape
    # A wide blur is all low frequencies: run it on a downscaled copy so its cost
    # stops growing with the radius, then scale the result back up.
    s = max(1, int(radius // 8))
    small = F.interpolate(x, scale_factor=1 / s, mode="area") if s > 1 else x
    sh, sw = small.shape[-2:]
    out = mask_core.blur(small.reshape(b * c, 1, sh, sw), radius / s).reshape(b, c, sh, sw)
    return F.interpolate(out, size=(h, w), mode="bilinear") if s > 1 else out


def _fusion(image, fg, bg, a, radius):
    """One blur-fusion step. All [B, C, H, W] on the same device."""
    blur_a = _blur(a, radius)
    f_hat = _blur(fg * a, radius) / (blur_a + _EPS)
    b_hat = _blur(bg * (1 - a), radius) / (_blur(1 - a, radius) + _EPS)
    f = f_hat + a * (image - a * f_hat - (1 - a) * b_hat)
    return f.clamp(0.0, 1.0), b_hat


def estimate_foreground(image: torch.Tensor, alpha: torch.Tensor,
                  wide: float = 90.0, tight: float = 6.0) -> torch.Tensor:
    """Foreground colour for `image` [B, H, W, 3] under `alpha` [B, H, W]."""
    i = image.movedim(-1, 1)
    a = alpha.unsqueeze(1)
    fg, bg = _fusion(i, i, i, a, wide)
    fg, _ = _fusion(i, fg, bg, a, tight)
    return fg.movedim(1, -1)


class NKDAlphaMatte(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDAlphaMatte",
            display_name="😺NKD Alpha Matte",
            category="😺NKD Nodes/Compositing",
            search_aliases=["alpha", "transparency", "cutout", "rgba", "roto", "decontaminate",
                            "remove background"],
            description=(
                "Turns an image and a roto mask into a transparent cut-out (RGBA), frame by "
                "frame for video. Shapes the edge on the GPU and cleans the old background's "
                "colour out of the soft parts (hair, motion blur), so it doesn't halo over a "
                "new background."
            ),
            inputs=[
                io.Image.Input("image", tooltip="Image or video frames."),
                io.Mask.Input("mask", tooltip="Roto mask, one per frame or one for all. "
                                              "Resized to the image if it differs."),
                io.Boolean.Input("mask_is_subject", default=True,
                                 display_name="Mask Is Subject",
                                 tooltip="On: white in the mask is what you keep (SAM, "
                                         "rembg, painted masks). Off: white is what becomes "
                                         "transparent, as Load Image's alpha mask."),
                io.Float.Input("black_point", default=0.0, min=0.0, max=1.0, step=0.01,
                               display_name="Black Point",
                               tooltip="Alpha at or below this becomes fully transparent. "
                                       "Raise it to clear the faint haze a roto model "
                                       "leaves around the subject."),
                io.Float.Input("white_point", default=1.0, min=0.0, max=1.0, step=0.01,
                               display_name="White Point",
                               tooltip="Alpha at or above this becomes fully opaque. Lower "
                                       "it to make a subject that came out slightly see-"
                                       "through solid again. Set both to the same value "
                                       "for a hard matte."),
                io.Int.Input("expand", default=0, min=-256, max=256,
                             display_name="Expand / Choke",
                             tooltip="Grow the matte by this many pixels, or choke it with "
                                     "a negative value to lose a rim of old background."),
                io.Int.Input("feather", default=0, min=0, max=128,
                             display_name="Feather",
                             tooltip="Soften the edge by this many pixels."),
                io.Int.Input("smooth_in_time", default=0, min=0, max=16,
                             display_name="Smooth In Time",
                             tooltip="Video only. Average each frame's matte with this many "
                                     "frames either side, to stop the edge from boiling."),
                io.Boolean.Input("decontaminate", default=True,
                                 display_name="Decontaminate Edges",
                                 tooltip="Rebuild the subject's own colour where the edge is "
                                         "semi-transparent, so the old background doesn't "
                                         "show through as a halo. Opaque pixels are left "
                                         "exactly as they were."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="RGBA cut-out, straight (not premultiplied) alpha. "
                                        "Save Image keeps the transparency."),
                io.Mask.Output(display_name="alpha",
                               tooltip="The matte that was applied, 1 = opaque."),
            ],
        )

    @classmethod
    def execute(cls, image, mask, mask_is_subject, expand, feather, smooth_in_time,
                decontaminate, black_point=0.0, white_point=1.0) -> io.NodeOutput:
        rgb = image[..., :3]
        if mask.dim() == 2:
            mask = mask.unsqueeze(0)
        if mask.shape[-2:] != rgb.shape[1:3]:
            mask = F.interpolate(mask.unsqueeze(1), size=rgb.shape[1:3],
                                 mode="bilinear").squeeze(1)
        batch = max(rgb.shape[0], mask.shape[0])
        rgb = comfy.utils.repeat_to_batch_size(rgb, batch)
        mask = comfy.utils.repeat_to_batch_size(mask, batch)

        alpha = mask_core.process(mask, invert=not mask_is_subject,
                                  temporal_smooth_frames=smooth_in_time,
                                  expand_px=expand, feather_px=feather)
        # Levels on the FINISHED matte, after the feather: they are there to tighten what
        # comes out, and run any earlier the feather would just soften it again.
        alpha = mask_core.levels(alpha, black_point, white_point)
        if decontaminate:
            device = mask_core._work_device(rgb)
            rgb = torch.cat([
                estimate_foreground(rgb[i:i + _CHUNK].to(device, torch.float32),
                                    alpha[i:i + _CHUNK].to(device, torch.float32)).to(rgb)
                for i in range(0, batch, _CHUNK)])
        return io.NodeOutput(torch.cat([rgb, alpha.unsqueeze(-1).to(rgb)], dim=-1), alpha)


class NKDAlphaMatteExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDAlphaMatte]


async def comfy_entrypoint() -> NKDAlphaMatteExtension:
    return NKDAlphaMatteExtension()


NODE_CLASS_MAPPINGS = {"NKDAlphaMatte": NKDAlphaMatte}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDAlphaMatte": "😺NKD Alpha Matte"}
