"""😺NKD Normal Detail — put the pores back into a normal map.

Model normals (Marigold, DSINE, …) get the big shape right and wash out the
micro-detail: pores, stubble, single hairs. A derivative normal of the photo
has that detail and nothing else worth keeping. This node builds the second
from the photo — band-passed, so the photo's shading never turns into fake
slopes — and blends it onto the first with a method meant for normals.

Conventions: tangent-space, +R right, +G up (OpenGL). The base passes through
untouched, so only the detail's Y sign matters — `flip_detail_y` for DirectX.
"""
from __future__ import annotations

import logging

import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from . import mask_core
from .helpers import _luminance, _resize_auto, _resize_mask, preview_frames
from .nkd_frequency import _gaussian

_BLENDS = ["Reoriented", "UDN", "Overlay"]
_RESOLUTIONS = ["image", "normals"]
# Scharr 3×3: better rotational symmetry than Sobel, same cost.
_SCHARR_X = torch.tensor([[-3.0, 0.0, 3.0], [-10.0, 0.0, 10.0], [-3.0, 0.0, 3.0]]) / 32.0
_EPS = 1e-6


def _gradient(h: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """Scharr dx, dy of a [B,1,H,W] height, replicate-padded."""
    kx = _SCHARR_X.to(device=h.device, dtype=h.dtype).view(1, 1, 3, 3)
    ky = kx.transpose(2, 3)
    hp = F.pad(h, (1, 1, 1, 1), mode="replicate")
    return F.conv2d(hp, kx), F.conv2d(hp, ky)


def _unit(n: torch.Tensor) -> torch.Tensor:
    return n / n.norm(dim=1, keepdim=True).clamp_min(_EPS)


def detail_normal(image: torch.Tensor, bands, noise_reduction: int,
                  flip_y: bool) -> torch.Tensor:
    """Micro-detail normal [B,3,H,W] in [-1,1] from a photo [B,3,H,W].

    Each band is a high-pass of the luminance (height − blur(height, radius)),
    differentiated and soft-clipped. High-pass is the point: differentiating
    the raw luminance turns the photo's lighting into slopes; the residual
    only carries the frequency the radius lets through, and the big shape is
    the base map's job.
    """
    h = _luminance(image.permute(0, 2, 3, 1)).unsqueeze(1)          # [B,1,H,W]
    h = _gaussian(h, int(noise_reduction))
    nx = torch.zeros_like(h)
    ny = torch.zeros_like(h)
    for radius, strength in bands:
        if radius < 1 or strength <= 0:
            continue
        band = h - _gaussian(h, int(radius))
        dx, dy = _gradient(band)
        # tanh soft-clip: a silhouette edge (hair on background) is a huge
        # gradient that would otherwise flatten the base under it.
        nx = nx + torch.tanh(-dx * strength)
        ny = ny + torch.tanh(dy * strength)
    if flip_y:
        ny = -ny
    return _unit(torch.cat([nx, ny, torch.ones_like(h)], dim=1))


def blend_normals(n: torch.Tensor, d: torch.Tensor, mode: str) -> torch.Tensor:
    """Blend detail d onto base n, both [B,3,H,W] unit vectors in [-1,1]."""
    if mode == "Reoriented":
        # Barré-Brisebois & Hill: rotate the detail onto the base's surface.
        t = n + torch.tensor([0.0, 0.0, 1.0], device=n.device, dtype=n.dtype).view(1, 3, 1, 1)
        u = d * torch.tensor([-1.0, -1.0, 1.0], device=n.device, dtype=n.dtype).view(1, 3, 1, 1)
        r = t * (t * u).sum(1, keepdim=True) / t[:, 2:3].clamp_min(_EPS) - u
    elif mode == "UDN":
        r = torch.cat([n[:, :2] + d[:, :2], n[:, 2:3]], dim=1)
    else:
        # Overlay on the 0..1 encoding, R/G only: the manual ImageBlend pipeline.
        # Blue keeps the base's: overlaying a flat blue (1.0) would bend it.
        a, b = n[:, :2] * 0.5 + 0.5, d[:, :2] * 0.5 + 0.5
        xy = torch.where(a < 0.5, 2 * a * b, 1 - 2 * (1 - a) * (1 - b)) * 2 - 1
        r = torch.cat([xy, n[:, 2:3]], dim=1)
    return _unit(r)


def apply_normal_detail(normals, image, resolution, amount, blend, bands,
                        noise_reduction, flip_y, mask=None):
    """The whole node minus ComfyUI. Returns (blended, detail) as [B,H,W,3]."""
    src_device, src_dtype = normals.device, normals.dtype
    nb, nh, nw = normals.shape[:3]
    ib, ih, iw = image.shape[:3]
    if abs(nw / nh - iw / ih) > 0.01:
        logging.warning("[NKD Normal Detail] aspect mismatch: normals %dx%d vs image %dx%d "
                        "— resized anyway, but the detail will not line up. Fix the crop "
                        "upstream.", nw, nh, iw, ih)
    if resolution == "normals":
        w, h = nw, nh
    else:
        w, h = iw, ih

    def run(device):
        n = _resize_auto(normals[..., :3].to(device), w, h).permute(0, 3, 1, 2) * 2 - 1
        n = _unit(n)  # interpolation shortens the vectors → flat bands without this
        img = _resize_auto(image[..., :3].to(device), w, h).permute(0, 3, 1, 2)
        b = max(n.shape[0], img.shape[0])
        if n.shape[0] != b:
            n = n[:1].expand(b, -1, -1, -1)
        if img.shape[0] != b:
            img = img[:1].expand(b, -1, -1, -1)

        d = detail_normal(img, bands, noise_reduction, flip_y)
        gain = torch.full((1, 1, 1, 1), float(amount), device=device, dtype=d.dtype)
        if mask is not None:
            m = _resize_mask(mask.to(device), w, h).clamp(0.0, 1.0).unsqueeze(1)  # [Bm,1,H,W]
            fidx = torch.arange(b, device=device).clamp(max=m.shape[0] - 1)
            gain = gain * m[fidx]
        # amount 0 → detail is (0,0,1) → every blend hands the base back exactly.
        d = _unit(torch.cat([d[:, :2] * gain, d[:, 2:3]], dim=1))
        out = blend_normals(n, d, blend)
        enc = lambda x: (x.permute(0, 2, 3, 1) * 0.5 + 0.5).clamp(0.0, 1.0)
        return enc(out), enc(d)

    device = mask_core._work_device(normals)
    try:
        out, det = run(device)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        out, det = run(torch.device("cpu"))
    if normals.shape[-1] > 3 and (w, h) == (nw, nh):
        out = torch.cat([out, normals[..., 3:].to(out.device)], dim=-1)
    return (out.to(device=src_device, dtype=src_dtype),
            det.to(device=src_device, dtype=src_dtype))


class NKDNormalDetail(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDNormalDetail",
            display_name="😺NKD Normal Detail",
            category="😺NKD Nodes/Basic",
            is_output_node=True,
            description=(
                "Adds micro-detail (pores, stubble, hair) from the photo to any "
                "normal map. Model normals get the shape, the photo gets the "
                "texture, blended the way normals should be."
            ),
            inputs=[
                io.Image.Input("normals", tooltip="The base normal map (Marigold, DSINE, "
                                                  "any tangent-space map)."),
                io.Image.Input("image", tooltip="The photo the micro-detail is read from."),
                io.Combo.Input("resolution", options=_RESOLUTIONS, default="image",
                               display_name="Resolution",
                               tooltip="image: output at the photo's size — the base is "
                                       "upscaled and the detail is read at full "
                                       "resolution, where the pores live. normals: "
                                       "output at the base's size, photo downscaled. "
                                       "Radii are in pixels of this working size."),
                io.Float.Input("amount", default=1.0, min=0.0, max=2.0, step=0.01,
                               display_name="Amount",
                               tooltip="How much detail lands on the base. 0 = base "
                                       "untouched."),
                io.Combo.Input("blend", options=_BLENDS, default="Reoriented",
                               display_name="Blend",
                               tooltip="Reoriented rotates the detail onto the base's "
                                       "surface (correct on slopes). UDN is the cheap "
                                       "sum. Overlay is the per-channel Photoshop "
                                       "blend, for comparison."),
                io.Int.Input("fine_radius", default=2, min=0, max=32,
                             display_name="Fine Radius",
                             tooltip="Size of the finest detail in pixels (pores, "
                                     "stubble). 0 turns the band off."),
                io.Float.Input("fine_strength", default=4.0, min=0.0, max=20.0, step=0.1,
                               display_name="Fine Strength",
                               tooltip="Slope strength of the fine band."),
                io.Int.Input("medium_radius", default=8, min=0, max=128,
                             display_name="Medium Radius",
                             tooltip="Size of the medium detail in pixels (wrinkles, "
                                     "hair locks, fabric). 0 turns the band off."),
                io.Float.Input("medium_strength", default=2.0, min=0.0, max=20.0, step=0.1,
                               display_name="Medium Strength",
                               tooltip="Slope strength of the medium band."),
                io.Int.Input("noise_reduction", default=0, min=0, max=8,
                             display_name="Noise Reduction",
                             tooltip="Blur the photo before reading detail, so grain "
                                     "and compression do not become bumps."),
                io.Boolean.Input("flip_detail_y", default=False,
                                 display_name="Flip Detail Y",
                                 tooltip="Invert the detail's green channel for a "
                                         "DirectX-style base (+Y down)."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — confine the detail to the mask, "
                                      "feathered by its values."),
            ],
            outputs=[
                io.Image.Output(display_name="normals",
                                tooltip="The base with the detail blended in."),
                io.Image.Output(display_name="detail",
                                tooltip="The micro-detail normal on its own — preview "
                                        "it to tune the radii."),
            ],
        )

    @classmethod
    def execute(cls, normals, image, resolution, amount, blend, fine_radius,
                fine_strength, medium_radius, medium_strength, noise_reduction,
                flip_detail_y, mask=None) -> io.NodeOutput:
        out, det = apply_normal_detail(
            normals, image, resolution, amount, blend,
            [(fine_radius, fine_strength), (medium_radius, medium_strength)],
            noise_reduction, flip_detail_y, mask)
        return io.NodeOutput(out, det, ui=ui.PreviewImage(preview_frames(out), cls=cls))


class NKDNormalDetailExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDNormalDetail]


async def comfy_entrypoint() -> NKDNormalDetailExtension:
    return NKDNormalDetailExtension()


NODE_CLASS_MAPPINGS = {"NKDNormalDetail": NKDNormalDetail}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDNormalDetail": "😺NKD Normal Detail"}


if __name__ == "__main__":
    # Self-check: a flat photo carries no detail, so every blend must hand the
    # base back; amount=0 must do the same on a textured photo.
    torch.manual_seed(0)
    base = _unit(torch.randn(1, 3, 16, 16) * 0.3 + torch.tensor([0, 0, 1.0]).view(1, 3, 1, 1))
    base_img = base.permute(0, 2, 3, 1) * 0.5 + 0.5
    flat = torch.full((1, 16, 16, 3), 0.4)
    noisy = torch.rand(1, 16, 16, 3)
    for mode in _BLENDS:
        out, _ = apply_normal_detail(base_img, flat, "image", 1.0, mode, [(2, 2.0), (4, 1.0)], 0, False)
        assert (out - base_img).abs().max() < 1e-4, mode
        out, _ = apply_normal_detail(base_img, noisy, "image", 0.0, mode, [(2, 2.0), (4, 1.0)], 0, False)
        assert (out - base_img).abs().max() < 1e-4, mode + " amount=0"
    out, det = apply_normal_detail(base_img, torch.rand(1, 32, 32, 3), "normals", 1.0, "Reoriented", [(2, 2.0)], 0, False)
    assert out.shape == (1, 16, 16, 3) and det.shape == (1, 16, 16, 3)
    assert (det - 0.5).abs().max() > 0.05, "textured photo must produce detail"
    print("ok")
