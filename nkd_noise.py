"""NKD Noise — procedural fractal noise generator (After Effects Fractal Noise
/ Blender Noise Texture in spirit). Value-noise fBm with domain-warp distortion,
animated and seamlessly loopable over a frame batch (4D time). Outputs the noise
both as an IMAGE and as a MASK (fog density, dissolves, compositing).

Pairs with 😺NKD Gradient Map to colorize the noise (tinted fog) with no color
controls of its own. Pure torch, no deps. A live client-side preview mirrors the
exact integer hash so what you see is what renders.
"""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .helpers import _fractal_noise, _resize_mask


class NKDNoise(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDNoise",
            display_name="😺NKD Noise",
            category="😺NKD Nodes/Basic",
            description=(
                "Procedural fractal noise (fBm) — clouds, fog, smoke, organic "
                "textures. Animate it over a frame batch and loop it seamlessly. "
                "Outputs an image and a mask; feed it into Gradient Map to tint it."
            ),
            inputs=[
                io.Int.Input("width", default=1024, min=8, max=8192, step=8),
                io.Int.Input("height", default=1024, min=8, max=8192, step=8),
                io.Int.Input("frames", default=1, min=1, max=1000,
                             display_name="Frames",
                             tooltip="Batch length. >1 makes an animated sequence."),
                io.Float.Input("scale", default=6.0, min=0.5, max=64.0, step=0.1,
                               display_name="Scale",
                               tooltip="Feature count across the frame — higher = smaller, "
                                       "busier features."),
                io.Int.Input("detail", default=4, min=1, max=8,
                             display_name="Detail",
                             tooltip="Fractal octaves — more = finer detail."),
                io.Float.Input("roughness", default=0.5, min=0.0, max=1.0, step=0.01,
                               display_name="Roughness",
                               tooltip="How much each finer octave contributes."),
                io.Float.Input("lacunarity", default=2.0, min=1.0, max=4.0, step=0.05,
                               display_name="Lacunarity",
                               tooltip="Frequency step between octaves."),
                io.Float.Input("distortion", default=0.0, min=0.0, max=10.0, step=0.05,
                               display_name="Distortion",
                               tooltip="Domain warp — swirls the pattern for an organic look."),
                io.Float.Input("contrast", default=1.0, min=0.0, max=4.0, step=0.05,
                               display_name="Contrast"),
                io.Float.Input("brightness", default=0.0, min=-1.0, max=1.0, step=0.01,
                               display_name="Brightness"),
                io.Float.Input("evolution", default=0.0, min=0.0, max=100.0, step=0.5,
                               display_name="Evolution",
                               tooltip="Animation speed — evolves the field across frames "
                                       "(the 4D time dimension)."),
                io.Boolean.Input("loop", default=False,
                                 display_name="Loop",
                                 tooltip="Seamless loop: the last frame flows back into the "
                                         "first over `frames`."),
                io.Float.Input("offset_x", default=0.0, min=-100.0, max=100.0, step=0.1,
                               display_name="Offset X"),
                io.Float.Input("offset_y", default=0.0, min=-100.0, max=100.0, step=0.1,
                               display_name="Offset Y"),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff,
                             control_after_generate=True, display_name="Seed"),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — confine the noise to the mask, feathered "
                                      "by its values."),
            ],
            outputs=[
                io.Image.Output(display_name="image", tooltip="The noise as a grayscale image."),
                io.Mask.Output(display_name="mask", tooltip="The noise as a mask."),
            ],
        )

    @classmethod
    def execute(cls, width, height, frames, scale, detail, roughness, lacunarity,
                distortion, contrast, brightness, evolution, loop, offset_x, offset_y,
                seed, mask=None) -> io.NodeOutput:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        field = _fractal_noise(width, height, frames, scale, detail, roughness,
                               lacunarity, distortion, contrast, brightness,
                               evolution, loop, offset_x, offset_y, seed, device)

        if mask is not None:
            mm = mask if mask.dim() == 3 else mask.unsqueeze(0)
            mfull = _resize_mask(mm.to(field.device), width, height).clamp(0.0, 1.0)
            fidx = torch.arange(field.shape[0], device=field.device).clamp(max=mfull.shape[0] - 1)
            field = field * mfull[fidx]

        image = field.unsqueeze(-1).expand(-1, -1, -1, 3).contiguous()
        return io.NodeOutput(image, field)


class NKDNoiseExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDNoise]


NODE_CLASS_MAPPINGS = {"NKDNoise": NKDNoise}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDNoise": "😺NKD Noise"}
