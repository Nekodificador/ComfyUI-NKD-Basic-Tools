"""NKD Film Grain — Lightroom / Camera Raw-style grain.

Three controls, exactly like Lightroom: Amount, Size, Roughness. Monochrome by
default (luminance grain), with an optional Color slider for dye-cloud color
grain. Gaussian noise generated at reduced resolution then upscaled (so Size is
real grain size, not just opacity), Roughness mixes a fine and a coarse noise
field (Lightroom's actual method), composited additively in gamma space.

Video: each frame gets an INDEPENDENT noise field by default (`animate`), so
grain shimmers like real film emulsion instead of sitting frozen on the glass.
Reduced-res noise for all frames is generated up front (cheap, deterministic);
the full-res upscale + composite runs in frame chunks to bound VRAM.

Pure torch, no external deps, no models. Synthesis of the best compatible ideas
from radiance (reduced-res→upscale architecture), Lightroom (2-frequency
roughness) and VRGamedevgirl's FastFilmGrain (per-frame animated grain).
"""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .helpers import _film_grain


class NKDFilmGrain(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFilmGrain",
            display_name="😺NKD Film Grain",
            category="😺NKD Nodes/Basic",
            description=(
                "Lightroom / Camera Raw-style film grain: Amount, Size and "
                "Roughness. Monochrome by default; raise Color for dye-cloud "
                "color grain. On a video batch each frame gets fresh grain so "
                "it shimmers like real emulsion."
            ),
            inputs=[
                io.Image.Input("image"),
                io.Float.Input("amount", default=25.0, min=0.0, max=100.0, step=0.5,
                               display_name="Amount",
                               tooltip="How much grain shows through (Lightroom Amount)."),
                io.Float.Input("size", default=25.0, min=0.0, max=100.0, step=0.5,
                               display_name="Size",
                               tooltip="Grain size — bigger = coarser, chunkier grain."),
                io.Float.Input("roughness", default=50.0, min=0.0, max=100.0, step=0.5,
                               display_name="Roughness",
                               tooltip="Irregularity of the grain: blends a fine and a "
                                       "coarse field, like Lightroom."),
                io.Float.Input("color", default=0.0, min=0.0, max=100.0, step=1.0,
                               display_name="Color",
                               tooltip="0 = clean monochrome grain. Raise for colored "
                                       "dye-cloud grain."),
                io.Boolean.Input("animate", default=True,
                                 display_name="Animate (video)",
                                 tooltip="Fresh grain on every frame of the batch — real "
                                         "film shimmer. Off = the same static grain on all "
                                         "frames."),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff,
                             control_after_generate=True,
                             display_name="Seed",
                             tooltip="Same seed, same grain."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — confine the grain to the mask, "
                                      "feathered by its values (soft edges blend in)."),
            ],
            outputs=[
                io.Image.Output(display_name="image", tooltip="The grained image."),
            ],
        )

    @classmethod
    def execute(cls, image, amount, size, roughness, color, animate, seed,
                mask=None) -> io.NodeOutput:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        out = _film_grain(image, amount, size, roughness, color, seed, animate,
                          mask=mask, device=device)
        return io.NodeOutput(out)


class NKDFilmGrainExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDFilmGrain]


NODE_CLASS_MAPPINGS = {"NKDFilmGrain": NKDFilmGrain}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDFilmGrain": "😺NKD Film Grain"}
