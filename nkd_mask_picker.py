"""😺NKD Mask Picker: pick objects by hovering and clicking on the node's own preview.

Analyze runs SAM3's segment-everything: the image is encoded ONCE, then a point grid goes through
SAM's light prompt encoder + mask decoder, keeping its 3 granularity levels (fine / middle / whole).
The widget gets every surviving mask run-length encoded at <=512 px and does hover and clicks on its
own. A pick is the (point, level) that produced its mask, or for a forced pick, made where nothing was
listed, its own points as one prompt; execute() re-decodes exactly that mask at full resolution and refines
it like SAM3_Detect's refine_iterations; edges="vitmatte" then mattes its edge with ViTMatte on a trimap
built from that mask.
"""
from __future__ import annotations

import base64
import io as _io
import logging
import os

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from huggingface_hub import hf_hub_download
from torchvision.ops import nms
from transformers import VitMatteForImageMatting

import comfy.model_management
import comfy.model_patcher
import comfy.utils
import folder_paths
from comfy.ops import cast_to_input
from comfy_api.latest import io
from comfy_extras.nodes_sam3 import _refine_mask

from . import picker_core as core

GRID = 32            # 32x32 points -> 3072 candidate masks
BATCH = 128          # points per decoder call  # ponytail: fixed; 256 measured 6 GB peak with the model
PREVIEW = 512        # long side of what the widget hit-tests against
BACKDROP = 2048      # long side of the photo the full-screen view shows
IOU_MIN, NMS_IOU, AREA_MIN = 0.8, 0.7, 0.0005  # IoU is the head's logit: ComfyUI's SAM3 applies no sigmoid
# SAM scores whole figures low on busy or stylized images (sequins, fur): masks over 1 % of the image get a looser bar,
# unless they touch 2+ image borders -- those are speckled patches of background, not figures
BIG_AREA, BIG_IOU_MIN, BIG_STABLE_GAP = 0.01, -1.0, 0.2   # big masks: stability may be this much lower
VITMATTE_REPO = "hustvl/vitmatte-small-composition-1k"
VITMATTE_DIR = os.path.join(folder_paths.models_dir, "vitmatte", "vitmatte-small-composition-1k")
MATTE_PAD = 0.2      # crop = the object's box grown by this fraction of its long side
MATTE_MAX = 1024     # long side ViTMatte runs at; a 3000 px crop uncapped asked 38 GB
SEAM = 0.005         # a group's pieces are bridged across gaps up to twice this fraction of the image's long side
_vitmatte = []       # the one ModelPatcher, created on first use


def _heads(sam):
    tr = sam.tracker
    # SAM3.1 (multiplex) keeps a separate interactive (single-object) prompt encoder and decoder
    if sam.detector.backbone["vision_backbone"].multiplex:
        return tr.interactive_sam_prompt_encoder, tr.interactive_sam_mask_decoder
    return tr.sam_prompt_encoder, tr.sam_mask_decoder


def _encode(sam, frame):
    """The image features SAM3Model.forward_segment computes, once per image (mirrors its feature path)."""
    bb = sam.detector.backbone["vision_backbone"]
    if bb.multiplex:
        _, _, feats, _ = bb(frame, tracker_mode="interactive")
    else:
        _, _, feats, _ = bb(frame, need_tracker=True)
        if sam.detector.scalp > 0:
            feats = feats[:-sam.detector.scalp]
    high_res, feat = list(feats[:-1]), feats[-1]
    no_mem = getattr(sam.tracker, "interactivity_no_mem_embed", None)
    if no_mem is None:
        no_mem = getattr(sam.tracker, "no_mem_embed", None)
    if no_mem is not None:
        b, c, h, w = feat.shape
        flat = feat.flatten(2).permute(0, 2, 1)
        feat = (flat + cast_to_input(no_mem, flat)).view(b, h, w, c).permute(0, 3, 1, 2)
    return feat, high_res


def _decode(sam, feat, high_res, points):
    """points [N, P, 2] in 0..1 -> ([N, 3, h, w] mask logits, [N, 3] predicted IoU), one prompt of P positive clicks each."""
    penc, mdec = _heads(sam)
    coords = (points * sam.tracker.image_size).to(feat.device)
    labels = torch.ones(points.shape[:2], dtype=torch.int32, device=feat.device)
    sparse, dense = penc(points=(coords, labels), boxes=None, masks=None)
    logits, iou, _, _ = mdec(image_embeddings=feat, image_pe=cast_to_input(penc.get_dense_pe(), feat),
                             sparse_prompt_embeddings=cast_to_input(sparse, feat),
                             dense_prompt_embeddings=cast_to_input(dense, feat),
                             high_res_features=high_res, multimask_output=True, return_all=True)
    return logits.float(), iou.float()


def _boxes(masks):
    """[M, h, w] bool -> [M, 4] xyxy for NMS, without a Python loop (one GPU sync, not M)."""
    h, w = masks.shape[-2:]
    cols, rows = masks.any(1), masks.any(2)
    xs, ys = torch.arange(w, device=masks.device), torch.arange(h, device=masks.device)
    x1, x2 = torch.where(cols, xs, w).amin(1), torch.where(cols, xs, -1).amax(1) + 1
    y1, y2 = torch.where(rows, ys, h).amin(1), torch.where(rows, ys, -1).amax(1) + 1
    return torch.stack([x1, y1, x2, y2], 1).float()


def _everything(sam, feat, high_res, min_quality, merge_similar):
    """-> (logits [M, h, w], score [M], point [M, 2] in 0..1, level [M]) after quality filter, NMS and dedupe.
    min_quality: the stability a mask needs; merge_similar: the mask IoU past which a weaker mask is a copy."""
    g = (torch.arange(GRID, dtype=torch.float32) + 0.5) / GRID
    grid = torch.stack(torch.meshgrid(g, g, indexing="xy"), -1).reshape(-1, 2)
    kept, scores, sources = [], [], []
    for start in range(0, len(grid), BATCH):
        logits, score = _decode(sam, feat, high_res, grid[start:start + BATCH, None])
        logits, score = logits.flatten(0, 1), score.flatten()
        # stability: how much the mask changes when its threshold moves by +-1 logit
        stable = (logits > 1).flatten(1).sum(1) / (logits > -1).flatten(1).sum(1).clamp(min=1)
        on = logits > 0
        area = on.flatten(1).float().mean(1)
        borders = on[:, 0].any(1).int() + on[:, -1].any(1).int() + on[:, :, 0].any(1).int() + on[:, :, -1].any(1).int()
        keep = ((score > IOU_MIN) & (stable > min_quality) & (area > AREA_MIN)) | \
               ((score > BIG_IOU_MIN) & (stable > min_quality - BIG_STABLE_GAP) & (area > BIG_AREA) & (borders <= 1))
        kept.append(logits[keep]); scores.append(score[keep])
        sources.append(torch.nonzero(keep)[:, 0] + start * 3)
    logits, score, source = torch.cat(kept), torch.cat(scores), torch.cat(sources)
    keep = nms(_boxes(logits > 0), score, NMS_IOU)
    logits, score, source = logits[keep], score[keep], source[keep].cpu()
    # box NMS misses near-duplicates whose boxes differ (one stray pixel moves a box): compare the masks, best score first
    on = (logits > 0).flatten(1).half()
    inter = (on @ on.T).float()
    area = inter.diagonal()
    overlap = (inter / (area[:, None] + area[None] - inter).clamp(min=1)).cpu()
    keep = []
    for i in range(len(overlap)):
        if not keep or overlap[i, keep].max() <= merge_similar:
            keep.append(i)
    logits, score, source = logits[keep], score[keep], source[keep]
    return logits, score, grid[source // 3], source % 3


def _entries(logits, score, keys, ph, pw) -> list[dict]:
    """Payload masks: keys[i] (the prompt and level behind mask i) + its score, area and run lengths at ph x pw."""
    masks = (F.interpolate(logits[None], size=(ph, pw), mode="bilinear", align_corners=False)[0] > 0).cpu().numpy() if len(logits) else []
    return [{**k, "score": round(float(sc), 3), "area": int(m.sum()), "rle": core.rle(m)} for k, sc, m in zip(keys, score, masks)]


def _payload(image, logits, score, point, level) -> dict:
    h, w = image.shape[1], image.shape[2]
    s = PREVIEW / max(h, w)
    ph, pw = max(1, round(h * s)), max(1, round(w * s))

    def jpeg(long_side):
        k = min(1.0, long_side / max(h, w))
        img = comfy.utils.common_upscale(image[..., :3].movedim(-1, 1), max(1, round(w * k)), max(1, round(h * k)),
                                         "bilinear", "disabled")[0].movedim(0, -1)
        buf = _io.BytesIO()
        Image.fromarray((img.clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)).save(buf, "JPEG", quality=85)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    keys = [{"x": round(float(p[0]), 5), "y": round(float(p[1]), 5), "level": int(lv)} for p, lv in zip(point, level)]
    return {"w": pw, "h": ph, "image": jpeg(PREVIEW), "image_hd": jpeg(BACKDROP),
            "masks": _entries(logits, score, keys, ph, pw)}


def _vitmatte_patcher():
    if not _vitmatte:
        files = ("config.json", "model.safetensors")
        if not all(os.path.exists(os.path.join(VITMATTE_DIR, f)) for f in files):
            logging.info("[NKD Mask Picker] Downloading ViTMatte (99 MB) into %s", VITMATTE_DIR)
            try:
                for f in files:
                    hf_hub_download(repo_id=VITMATTE_REPO, filename=f, local_dir=VITMATTE_DIR)
            except Exception as exc:
                raise RuntimeError(
                    "Could not download ViTMatte from {}: {}\n"
                    "Place config.json and model.safetensors manually under {} with:\n"
                    '  huggingface-cli download {} config.json model.safetensors --local-dir "{}"'
                    .format(VITMATTE_REPO, exc, VITMATTE_DIR, VITMATTE_REPO, VITMATTE_DIR)) from exc
        model = VitMatteForImageMatting.from_pretrained(VITMATTE_DIR).eval()
        # ponytail: in a ModuleList because ModelPatcher assigns .device, a read-only property on HF models
        _vitmatte.append(comfy.model_patcher.ModelPatcher(torch.nn.ModuleList([model]),
                                                          load_device=comfy.model_management.get_torch_device(),
                                                          offload_device=comfy.model_management.unet_offload_device()))
    return _vitmatte[0]


def _matte(vitmatte, rgb, mask, box, margin, device):
    """rgb [H, W, 3], mask [H, W] 0/1 with box = core.box_of(mask) -> alpha [H, W] on mask's device,
    1 / 0 where the trimap is sure, so 0 outside the trimap's band."""
    height, width = mask.shape
    pad = round((MATTE_PAD + margin) * max(box[2] - box[0], box[3] - box[1]))
    x1, y1, x2, y2 = max(0, box[0] - pad), max(0, box[1] - pad), min(width, box[2] + pad), min(height, box[3] + pad)
    h, w = y2 - y1, x2 - x1
    crop = rgb[y1:y2, x1:x2, :3].to(device, torch.float32).movedim(-1, 0)[None]
    m = mask[y1:y2, x1:x2] > 0.5
    s = min(1.0, MATTE_MAX / max(h, w))
    th, tw = max(1, round(h * s)), max(1, round(w * s))
    if s < 1:
        crop = F.interpolate(crop, size=(th, tw), mode="bilinear", align_corners=False, antialias=True)
        m = F.interpolate(m[None, None].float(), size=(th, tw), mode="nearest")[0, 0] > 0.5
    tri = torch.from_numpy(core.trimap(m.cpu().numpy(), margin)).to(device)
    # what VitMatteImageProcessor does: rgb normalized with mean = std = 0.5, trimap as is, zero pad to a multiple of 32
    x = F.pad(torch.cat([(crop - 0.5) / 0.5, tri[None, None]], 1), (0, -tw % 32, 0, -th % 32))
    alpha = vitmatte(pixel_values=x).alphas[:, :, :th, :tw]
    alpha = torch.where(tri == 0.5, alpha, tri)
    if s < 1:
        alpha = F.interpolate(alpha, size=(h, w), mode="bilinear", align_corners=False)
    out = torch.zeros_like(mask)
    out[y1:y2, x1:x2] = alpha[0, 0].to(out)
    return out


class NKDMaskPicker(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDMaskPicker",
            display_name="😺NKD Mask Picker",
            category="😺NKD Nodes/Masking",
            description="Press Analyze, then hover the preview to see what can be masked and click to pick it. "
                        "Drag across objects to pick them as one entry of separated masks and bboxes. Shift adds, Alt+click or Alt+drag cuts holes in what is marked, "
                        "the mouse wheel steps to a bigger or smaller object. Click or drag where nothing is listed to "
                        "make SAM look there.",
            inputs=[
                io.Image.Input("image", tooltip="Only the first image of a batch is used."),
                io.Model.Input("model", tooltip="SAM3 or SAM3.1, from Load Checkpoint."),
                io.DynamicCombo.Input("edges", options=[
                    io.DynamicCombo.Option("vitmatte", [
                        io.Float.Input("edge_margin", default=0.08, min=0.0, max=0.3, step=0.01,
                                       tooltip="How far past SAM's edge the matte may look, as a fraction of the "
                                               "object's size. Raise it for hair and fur, lower it for low-contrast parts."),
                    ]),
                    io.DynamicCombo.Option("sam", [
                        io.Int.Input("refine_iterations", default=2, min=0, max=5,
                                     tooltip="SAM passes that re-segment each picked object in a crop around it, like "
                                             "SAM3 Detect's option. 0: the mask as previewed."),
                    ]),
                ], tooltip="vitmatte: an alpha matte of each object's edge, so hair, fur and soft borders come out "
                           "soft. sam: SAM's hard edge."),
                io.Float.Input("min_quality", default=0.9, min=0.5, max=1.0, step=0.01, advanced=True,
                               tooltip="How sure SAM must be of an object to list it. Lower lists more, doubtful ones "
                                       "too; higher lists fewer, cleaner ones. Press Analyze again after changing it."),
                io.Float.Input("merge_similar", default=0.8, min=0.5, max=1.0, step=0.01, advanced=True,
                               tooltip="How much two objects must overlap to count as the same one; the weaker goes. "
                                       "Lower merges more look-alikes. Press Analyze again after changing it."),
                io.String.Input("selection", default="", multiline=False, socketless=True,
                                tooltip="Written by the preview when you click."),
            ],
            outputs=[
                io.Mask.Output(display_name="combined mask", tooltip="Every pick in one mask, with the cuts applied."),
                io.Mask.Output(display_name="separated masks",
                               tooltip="One mask per object or drag, as a batch; Inpaint Crop gives each its own crop."),
                io.BoundingBox.Output(display_name="bboxes"),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, image, model, edges, min_quality, merge_similar, selection) -> io.NodeOutput:
        # vitmatte refines the shape with SAM's default 2 passes first: past that the matte decides the edge anyway
        refine_iterations = edges.get("refine_iterations", 2)
        edge_margin = edges.get("edge_margin", 0.0)
        edges = edges["edges"]
        image = image[:1]  # ponytail: first frame only; video isn't supported yet
        height, width = image.shape[1], image.shape[2]
        comfy.model_management.load_model_gpu(model)
        sam = model.model.diffusion_model
        device, dtype = comfy.model_management.get_torch_device(), model.model.get_dtype()
        size = sam.tracker.image_size
        frame = comfy.utils.common_upscale(image[..., :3].movedim(-1, 1), size, size, "bilinear", "disabled").to(device, dtype)
        feat, high_res = _encode(sam, frame)
        found = _everything(sam, feat, high_res, min_quality, merge_similar)
        payload = _payload(image, *found)

        # grid picks from another image no longer match a listed mask: drop them instead of decoding arbitrary ones.
        # Forced picks carry their own points and are always decoded
        listed = [(p[0].item(), p[1].item(), lv.item()) for p, lv in zip(found[2], found[3])]
        requested = core.parse_selection(selection)
        picks, prompts = [], []
        for p in requested:
            if "points" in p:
                hit = p["points"]
            else:
                hit = next(([[x, y]] for x, y, lv in listed if abs(p["x"] - x) < 1e-3 and abs(p["y"] - y) < 1e-3 and p["level"] == lv), None)
            if hit:
                picks.append(p)
                prompts.append(hit)
        if len(requested) > len(picks):
            logging.warning("[NKD Mask Picker] %d picks no longer match this image and were skipped", len(requested) - len(picks))
        lows = [None] * len(picks)
        for n in {len(pr) for pr in prompts}:   # one decoder call per prompt size
            idx = [i for i, pr in enumerate(prompts) if len(pr) == n]
            logits, score = _decode(sam, feat, high_res, torch.tensor([prompts[i] for i in idx]))
            for i, lg, sc in zip(idx, logits, score):
                lows[i] = lg, sc
        forced = set()
        for p, (lg, sc) in zip(picks, lows):
            if "points" in p and str(p["points"]) not in forced:
                forced.add(str(p["points"]))
                payload["masks"] += _entries(lg, sc, [{"points": p["points"], "level": lv} for lv in range(3)],
                                             payload["h"], payload["w"])
        idev = comfy.model_management.intermediate_device()
        masks = []
        for pick, (lg, _) in zip(picks, lows):
            lg = lg[pick["level"]]
            full = F.interpolate(lg[None, None], size=(height, width), mode="bilinear", align_corners=False)[0, 0] > 0
            box = core.box_of(full)
            if refine_iterations and box:
                full = _refine_mask(sam, image[0], lg, torch.tensor(box, dtype=torch.float32),
                                    height, width, device, dtype, refine_iterations)[0] > 0
            masks.append(core.drop_specks(full.float().to(idev)))
        del frame, feat, high_res, found, lows
        # a group (one stroke) is one object: its pieces matte as one, or their soft edges leave seams where they touch
        merged = core.merge_groups(masks, [p["mode"] for p in picks], [p["group"] for p in picks])
        radius = max(2, round(SEAM * max(height, width)))
        masks = [core.solid(pieces, radius) if len(pieces) > 1 else pieces[0] for pieces, _ in merged]
        if edges == "vitmatte" and masks:
            patcher = _vitmatte_patcher()
            comfy.model_management.load_models_gpu([patcher], force_full_load=True)
            for i, m in enumerate(masks):
                box = core.box_of(m)
                if not box:
                    continue
                alpha = _matte(patcher.model[0], image[0], m, box, edge_margin, patcher.load_device)
                hard = m > 0.5
                rest = 1 - m
                borders = int(hard[0].any()) + int(hard[-1].any()) + int(hard[:, 0].any()) + int(hard[:, -1].any())
                if borders >= 2 and hard.float().mean() > 0.25 and (rest_box := core.box_of(rest)):
                    # ViTMatte mattes foregrounds: a background pick comes out better as 1 - the matte of the rest.
                    # Not for smaller picks: the rest is then most of the image, matted at 1024 px into a wide halo
                    inverse = 1 - _matte(patcher.model[0], image[0], rest, rest_box, edge_margin, patcher.load_device)
                    alpha = max((alpha, inverse), key=lambda a: ((a > 0.5) & hard).sum() / ((a > 0.5) | hard).sum())
                masks[i] = alpha
        mask, added = core.compose(masks, [mode for _, mode in merged], torch.zeros((height, width), device=idev))
        out_masks = torch.stack(added) if added else torch.zeros((1, height, width), device=idev)
        return io.NodeOutput(mask[None], out_masks, core.bbox_frame(added), ui={"nkd_picker": [payload]})
