"""NKD Frequency Separate / Combine — detail-transfer frequency separation.

Two primitives, Fusion/Nuke style: Separate splits an image into a low-
frequency base and a high-frequency detail layer; Combine merges someone's HF
with someone else's LF. The classic use is detail restoration after a relight:
take the HF of the original (all the pores/texture) + the relit result as LF,
recombine inside the subject mask -> relit image with the original micro-detail.

Design notes (see the Micelio plan for the why):
  * The math runs in LINEAR light when `linear` is on. This matters for divide
    mode and for chroma-safe detail (a per-pixel scalar multiply only preserves
    hue/saturation when channels are linear).
  * `detail` = Luminance builds the HF from luminance only, so Combine's
    multiply modulates brightness without touching color -- exact, unlike a
    "luminosity" blend which shifts hue/saturation in gamma/HSL.
  * HF/LF pass between the two nodes in WORK space (linear when linear=on) and
    the HF is raw/lossless (may exceed [0,1]); it is an intermediate, not a
    picture. `mode` and `linear` must match between Separate and Combine.
"""
from __future__ import annotations
import torch
import torch.nn.functional as F
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

try:
    from .helpers import _luminance, _resize_mask, _srgb_to_linear, _linear_to_srgb
except ImportError:  # standalone (tests) vs. package (ComfyUI) import context
    from helpers import _luminance, _resize_mask, _srgb_to_linear, _linear_to_srgb

_EPS = 1e-6


# ---------------------------------------------------------------------------
# Low-frequency filters. All take/return NCHW on the working device.
# ---------------------------------------------------------------------------

def _work_device(x: torch.Tensor) -> torch.Tensor:
    """ComfyUI hands images over on CPU; the separable passes are seconds there
    at native resolution. Hop to CUDA for the heavy work."""
    if x.device.type == "cpu" and torch.cuda.is_available():
        return x.to("cuda")
    return x


def _box(x: torch.Tensor, r: int) -> torch.Tensor:
    """Separable box mean, radius r, replicate-padded (no border darkening)."""
    if r < 1:
        return x
    k = 2 * r + 1
    c = x.shape[1]
    kh = torch.ones(c, 1, 1, k, device=x.device, dtype=x.dtype) / k
    kv = kh.transpose(2, 3)
    x = F.conv2d(F.pad(x, (r, r, 0, 0), mode="replicate"), kh, groups=c)
    x = F.conv2d(F.pad(x, (0, 0, r, r), mode="replicate"), kv, groups=c)
    return x


def _gaussian(x: torch.Tensor, r: int) -> torch.Tensor:
    if r < 1:
        return x
    sigma = max(r / 2.0, 0.5)
    k = 2 * r + 1
    t = torch.arange(k, device=x.device, dtype=x.dtype) - r
    g = torch.exp(-(t * t) / (2 * sigma * sigma))
    g = g / g.sum()
    c = x.shape[1]
    kh = g.view(1, 1, 1, k).repeat(c, 1, 1, 1)
    kv = kh.transpose(2, 3)
    x = F.conv2d(F.pad(x, (r, r, 0, 0), mode="replicate"), kh, groups=c)
    x = F.conv2d(F.pad(x, (0, 0, r, r), mode="replicate"), kv, groups=c)
    return x


def _median(x: torch.Tensor, r: int) -> torch.Tensor:
    """Windowed median, radius r. Not separable; chunked over rows to bound
    memory. ponytail: median is the blemish-only method — modest radius; the
    window is (2r+1)^2 so cost climbs fast. Cap keeps it sane."""
    if r < 1:
        return x
    r = min(r, 7)
    k = 2 * r + 1
    b, c, h, w = x.shape
    xp = F.pad(x, (r, r, r, r), mode="replicate")
    out = torch.empty_like(x)
    rows = max(1, 64 // (k * k) + 1)  # row-chunk to bound the unfold buffer
    for y0 in range(0, h, rows):
        y1 = min(y0 + rows, h)
        patch = xp[:, :, y0:y1 + 2 * r, :].unfold(2, k, 1).unfold(3, k, 1)
        patch = patch.contiguous().view(b, c, y1 - y0, w, k * k)
        out[:, :, y0:y1, :] = patch.median(dim=-1).values
    return out


def _guided(x: torch.Tensor, guide: torch.Tensor, r: int, eps: float) -> torch.Tensor:
    """Guided filter (He 2013). guide == x -> self-guided edge-preserving blur;
    guide != x -> joint filter (used by rolling guidance). O(N) box filters, no
    gradient reversal, faster than bilateral."""
    r = max(r, 1)
    mean_g = _box(guide, r)
    mean_x = _box(x, r)
    corr_gg = _box(guide * guide, r)
    corr_gx = _box(guide * x, r)
    var_g = corr_gg - mean_g * mean_g
    cov_gx = corr_gx - mean_g * mean_x
    a = cov_gx / (var_g + eps)
    b = mean_x - a * mean_g
    return _box(a, r) * guide + _box(b, r)


def _rolling_guidance(x: torch.Tensor, r: int, eps: float, iters: int = 4) -> torch.Tensor:
    """Rolling Guidance Filter (Zhang 2014). Removes texture BY SCALE while
    snapping back to real edges: gaussian kills small structure, then joint
    guided filtering rolls the guidance back onto the large edges."""
    g = _gaussian(x, r)
    for _ in range(iters):
        g = _guided(x, g, r, eps)
    return g


def _low_freq(img: torch.Tensor, method: str, radius: int, edge: float) -> torch.Tensor:
    """img NCHW -> low-frequency NCHW. edge in [0,1] -> guided/RGF eps."""
    eps = max(edge, 1e-3) ** 2
    if method == "Gaussian":
        return _gaussian(img, radius)
    if method == "Median":
        return _median(img, radius)
    if method == "Rolling Guidance":
        return _rolling_guidance(img, radius, eps)
    return _guided(img, img, radius, eps)  # Guided (default)


# ---------------------------------------------------------------------------
# Node backends
# ---------------------------------------------------------------------------

def _to_nchw(image: torch.Tensor) -> torch.Tensor:
    return image[..., :3].permute(0, 3, 1, 2).contiguous()


def _to_nhwc(x: torch.Tensor) -> torch.Tensor:
    return x.permute(0, 2, 3, 1).contiguous()


def _send_source_to_widget(unique_id, image: torch.Tensor,
                           event: str = "nkd-freq-source") -> None:
    """Push the RESOLVED input image (post resize/subgraph) to this node's live
    preview widget, so partial-executing the node loads the image into the
    preview even when the source isn't a directly-connected Load Image. Sends
    raw RGB bytes (≤512px) as base64 — no ui.PreviewImage, so no thumbnails."""
    if not unique_id:
        return
    try:
        from server import PromptServer  # type: ignore
        import base64
    except Exception:
        return
    t = image[0:1, ..., :3]
    h, w = int(t.shape[1]), int(t.shape[2])
    scale = min(512.0 / h, 512.0 / w, 1.0)
    s = t.permute(0, 3, 1, 2).float()
    if scale < 1.0:
        s = F.interpolate(s, size=(int(h * scale), int(w * scale)), mode="area")
    s = s.squeeze(0).permute(1, 2, 0)  # HWC
    ph, pw = int(s.shape[0]), int(s.shape[1])
    arr = s.clamp(0.0, 1.0).mul(255).byte().cpu().numpy()
    b64 = base64.b64encode(arr.tobytes()).decode("ascii")
    PromptServer.instance.send_sync(
        event, {"node_id": unique_id, "img": b64, "width": pw, "height": ph})


class NKDFrequencySeparate(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFrequencySeparate",
            display_name="😺NKD Frequency Separate",
            category="😺NKD Nodes/Basic",
            is_output_node=True,  # runnable on its own (blue play) → caches the
                                  # real GPU-computed HF/LF preview
            description=(
                "Split an image into a soft base (low frequency) and a fine "
                "detail layer (high frequency). Pair with Frequency Combine to "
                "transfer texture between images — e.g. restore skin detail onto "
                "a relit result."
            ),
            inputs=[
                io.Image.Input("image"),
                io.Combo.Input("method",
                               options=["Gaussian", "Guided", "Rolling Guidance", "Median"],
                               default="Guided",
                               tooltip="How the base is smoothed. Guided keeps edges "
                                       "clean without the halo Gaussian leaves; Rolling "
                                       "Guidance erases texture by size while keeping "
                                       "shapes; Median is for spot blemishes."),
                io.Int.Input("radius", default=8, min=1, max=128,
                             tooltip="Detail scale. Larger = coarser base, more goes "
                                     "into the detail layer."),
                io.Float.Input("edge_threshold", default=0.1, min=0.0, max=1.0, step=0.01,
                               tooltip="How strongly edges are protected (Guided / "
                                       "Rolling Guidance). Lower = sharper edges kept."),
                io.Combo.Input("mode", options=["Divide", "Subtract"], default="Divide",
                               tooltip="How detail is encoded. Divide (ratio) is "
                                       "lighting-invariant — best for transferring "
                                       "detail between differently-lit images."),
                io.Combo.Input("detail", options=["Luminance", "RGB"], default="Luminance",
                               tooltip="Luminance keeps detail achromatic so a Divide "
                                       "recombine never touches color. RGB carries the "
                                       "chromatic detail too."),
                io.Boolean.Input("linear", default=True,
                                 tooltip="Process in linear light (correct). Turn off "
                                         "to work in gamma like classic Photoshop."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — attenuate the detail layer outside "
                                      "the mask."),
            ],
            hidden=[io.Hidden.unique_id],  # to target this node's preview widget
            outputs=[
                io.Image.Output(display_name="high_frequency",
                                tooltip="Full detail layer, whole image (intermediate)."),
                io.Image.Output(display_name="low_frequency",
                                tooltip="Soft base (intermediate — feed Combine)."),
                io.Image.Output(display_name="high_frequency_masked",
                                tooltip="Detail neutralised outside the mask (feathered "
                                        "by its values). Same as high_frequency when no "
                                        "mask is connected."),
            ],
        )

    @classmethod
    def execute(cls, image, method, radius, edge_threshold, mode, detail, linear,
                mask=None) -> io.NodeOutput:
        src = _to_nchw(image)
        work = _work_device(src)
        if linear:
            work = _srgb_to_linear(work)

        lf = _low_freq(work, method, int(radius), float(edge_threshold))

        if detail == "Luminance":
            lw = torch.tensor((0.2126, 0.7152, 0.0722), device=work.device,
                              dtype=work.dtype).view(1, 3, 1, 1)
            luma_img = (work * lw).sum(1, keepdim=True)
            luma_lf = (lf * lw).sum(1, keepdim=True)
            if mode == "Divide":
                hf = (luma_img / (luma_lf + _EPS)).repeat(1, 3, 1, 1)
            else:
                hf = (luma_img - luma_lf).repeat(1, 3, 1, 1)
        else:  # RGB
            hf = work / (lf + _EPS) if mode == "Divide" else work - lf

        # The masked variant neutralises the detail outside the mask (feathered
        # by its values), while `high_frequency` stays the full-image detail —
        # both come out at once so you can pick per branch. neutral = the value
        # Combine treats as "no detail" (1.0 for Divide's ratio, 0.0 for
        # Subtract's difference).
        hf_masked = hf
        if mask is not None:
            m = _resize_mask(mask.to(work.device), work.shape[3], work.shape[2])
            m = m.clamp(0.0, 1.0).unsqueeze(1)  # [B,1,H,W]
            fidx = torch.arange(work.shape[0], device=work.device).clamp(max=m.shape[0] - 1)
            m = m[fidx]
            neutral = 1.0 if mode == "Divide" else 0.0
            hf_masked = hf * m + neutral * (1.0 - m)

        # LF goes out in DISPLAY (sRGB) space so it previews correctly and pairs
        # with Combine (whose low_frequency input — often a relit image — is
        # sRGB and gets re-linearized there). HF stays a raw linear-domain
        # ratio/diff: an abstract intermediate, not a picture.
        lf_disp = _linear_to_srgb(lf) if linear else lf
        hf_out = _to_nhwc(hf).to(image.device)
        lf_out = _to_nhwc(lf_disp).to(image.device)
        hf_masked_out = _to_nhwc(hf_masked).to(image.device)
        # Feed the resolved input to the live preview widget (partial-execution
        # loads the image even when it arrives via a resize/subgraph).
        _send_source_to_widget(getattr(getattr(cls, "hidden", None), "unique_id", None), image)
        return io.NodeOutput(hf_out, lf_out, hf_masked_out)


class NKDFrequencyCombine(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDFrequencyCombine",
            display_name="😺NKD Frequency Combine",
            category="😺NKD Nodes/Basic",
            description=(
                "Merge a high-frequency detail layer onto a low-frequency base. "
                "Feed the HF from one image and the LF (or any target) from "
                "another to transfer detail. mode / linear must match the "
                "Separate that produced the HF."
            ),
            inputs=[
                io.Image.Input("high_frequency"),
                io.Image.Input("low_frequency",
                               tooltip="Base image the detail lands on (e.g. the relit "
                                       "result)."),
                io.Combo.Input("mode", options=["Divide", "Subtract"], default="Divide",
                               tooltip="Must match the Separate that made the HF."),
                io.Boolean.Input("linear", default=True,
                                 tooltip="Must match the Separate that made the HF."),
                io.Float.Input("detail_strength", default=1.0, min=0.0, max=2.0, step=0.01,
                               tooltip="Attenuate (<1) or boost (>1) the transferred "
                                       "detail. 1.0 restores it faithfully."),
                io.Mask.Input("mask", optional=True,
                              tooltip="Optional — apply the detail only inside the mask "
                                      "(feathered by its values)."),
                io.Float.Input("mask_feather", default=0.0, min=0.0, max=64.0, step=1.0,
                               tooltip="Soften the mask edge before applying."),
            ],
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="Base with the detail recombined."),
            ],
        )

    @classmethod
    def execute(cls, high_frequency, low_frequency, mode, linear, detail_strength,
                mask=None, mask_feather=0.0) -> io.NodeOutput:
        hf = _work_device(_to_nchw(high_frequency))
        base = _to_nchw(low_frequency).to(hf.device)
        # HF and LF share a resolution in the intended flow; guard mismatches.
        if base.shape[2:] != hf.shape[2:]:
            base = F.interpolate(base, size=hf.shape[2:], mode="bilinear", align_corners=False)
        lf = _srgb_to_linear(base) if linear else base

        s = float(detail_strength)
        if mode == "Divide":
            recombined = lf * (hf.clamp(min=0.0) ** s)
        else:
            recombined = lf + hf * s

        # The mask limits where detail lands: 0 -> base only, 1 -> full detail.
        if mask is not None:
            m = _resize_mask(mask.to(hf.device), hf.shape[3], hf.shape[2]).clamp(0.0, 1.0)
            if mask_feather >= 1:
                try:
                    from .helpers import _mask_grow
                except ImportError:
                    from helpers import _mask_grow
                m = _mask_grow(m, 0, int(mask_feather)).to(hf.device)
            m = m.unsqueeze(1)
            fidx = torch.arange(hf.shape[0], device=hf.device).clamp(max=m.shape[0] - 1)
            m = m[fidx]
            recombined = lf * (1.0 - m) + recombined * m

        out = _linear_to_srgb(recombined) if linear else recombined
        out = out.clamp(0.0, 1.0)
        out = _to_nhwc(out).to(low_frequency.device)
        if low_frequency.shape[-1] > 3:
            out = torch.cat([out, low_frequency[..., 3:]], dim=-1)
        return io.NodeOutput(out)


class NKDFrequencyExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDFrequencySeparate, NKDFrequencyCombine]


NODE_CLASS_MAPPINGS = {
    "NKDFrequencySeparate": NKDFrequencySeparate,
    "NKDFrequencyCombine": NKDFrequencyCombine,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "NKDFrequencySeparate": "😺NKD Frequency Separate",
    "NKDFrequencyCombine": "😺NKD Frequency Combine",
}
