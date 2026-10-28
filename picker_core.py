"""Pure helpers for 😺NKD Mask Picker: the editor's selection format, the run-length encoding of the
masks sent to it, composing picks into one mask and the ViTMatte trimap. No ComfyUI imports."""
from __future__ import annotations

import json

import numpy as np
import torch
from scipy.ndimage import distance_transform_edt, label, maximum_filter, minimum_filter


def parse_selection(text: str) -> list[dict]:
    """The editor's hidden widget: {"picks": [{"x", "y", "level", "mode", "group"}]}, x and y in 0..1 of the
    image, level 0..2 (SAM's fine / middle / whole mask for that point), mode add or sub. A forced pick has
    "points": [[x, y], ...] (one prompt) instead of x and y; a points-mode object also has "labels" (1 positive,
    0 negative, one per point) and its level is SAM's choice. Picks sharing a group are one object; a pick
    without one (older workflows) is its own."""
    if not text.strip():
        return []
    picks = []
    for i, p in enumerate(json.loads(text).get("picks", [])):
        pick = {"points": [[float(x), float(y)] for x, y in p["points"]]} if "points" in p else {"x": float(p["x"]), "y": float(p["y"])}
        if "labels" in p:
            pick["labels"] = [int(v) for v in p["labels"]]
        pick.update(level=int(p["level"]), mode="sub" if p.get("mode") == "sub" else "add", group=int(p.get("group", -1 - i)))
        picks.append(pick)
    return picks


def rle(mask: np.ndarray) -> list[int]:
    """Row-major run lengths of a bool mask, starting with a (possibly empty) run of zeros."""
    flat = np.asarray(mask, dtype=np.uint8).ravel()
    change = np.flatnonzero(np.diff(flat)) + 1
    runs = np.diff(np.concatenate([[0], change, [flat.size]])).tolist()
    return runs if flat[0] == 0 else [0] + runs


def unrle(runs: list[int], h: int, w: int) -> np.ndarray:
    """Inverse of rle(); the widget decodes the same way."""
    out = np.zeros(h * w, dtype=bool)
    pos, on = 0, False
    for r in runs:
        out[pos:pos + r] = on
        pos, on = pos + r, not on
    return out.reshape(h, w)


def box_of(mask: torch.Tensor) -> list[int] | None:
    """[x1, y1, x2, y2) in pixels of the mask's nonzero area, None when empty."""
    ys, xs = torch.nonzero(mask > 0.5, as_tuple=True)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def bbox_frame(masks: list[torch.Tensor]) -> list:
    """Native BOUNDING_BOX for one frame, like SAM3 / RT-DETR: [boxes], one box per non-empty mask."""
    boxes = [{"x": b[0], "y": b[1], "width": b[2] - b[0], "height": b[3] - b[1]}
             for b in (box_of(m) for m in masks) if b]
    return [boxes]


def merge_groups(masks: list[torch.Tensor], modes: list[str], groups: list[int]) -> list[tuple[list[torch.Tensor], str]]:
    """-> [(pieces, mode)]: one entry per group of add picks, placed at its first pick, and one per sub pick,
    so compose() still applies adds and cuts in pick order. A group's picks are assumed consecutive (a
    stroke's are), so moving its later picks up to the first changes nothing in between."""
    out, at = [], {}
    for m, mode, g in zip(masks, modes, groups):
        if mode == "add" and g in at:
            out[at[g]][0].append(m)
        else:
            if mode == "add":
                at[g] = len(out)
            out.append(([m], mode))
    return out


def solid(pieces: list[torch.Tensor], radius: int, hole_frac: float = 0.01) -> torch.Tensor:
    """Hard 0/1 pieces of one object -> their union, with the gaps between different pieces up to 2 * radius
    px wide bridged and the holes under hole_frac of its area filled. A piece's own concavities stay open,
    bigger holes are real and stay. Works in the union's box grown by 2 * radius, so it costs what the object does."""
    union = pieces[0]
    for p in pieces[1:]:
        union = torch.maximum(union, p)
    box = box_of(union)
    if not box:
        return union
    h, w = union.shape
    pad = 2 * radius   # so the closing's erosion sees background past the dilation, except at the image's edge
    x1, y1, x2, y2 = max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)
    k = 2 * radius + 1
    # scipy's square filters, not max_pool2d: a 25 px kernel there took 1.3 s on CPU at 2304x1728, these 0.1 s
    crop = np.stack([(p[y1:y2, x1:x2] > 0.5).cpu().numpy() for p in pieces])   # cropped first: 20 full 8K pieces are GBs
    # how many pieces each pixel is within 2 * radius of: a gap the closing fills is bridged from both sides
    near = maximum_filter(crop, size=(1, 2 * k - 1, 2 * k - 1), mode="constant").sum(0)
    u = crop.any(0)
    closed = minimum_filter(maximum_filter(u, size=k, mode="constant"), size=k, mode="constant", cval=1)
    hard = u | (closed & (near >= 2))                             # the closing, only where two pieces meet
    holes, count = label(~hard)
    if count:
        fill = np.bincount(holes.ravel()) < hole_frac * hard.sum()
        fill[0] = False
        fill[np.unique(np.concatenate([holes[0], holes[-1], holes[:, 0], holes[:, -1]]))] = False  # open to the outside
        hard |= fill[holes]
    out = union.clone()
    out[y1:y2, x1:x2] = torch.from_numpy(hard).to(union)
    return out


def compose(masks: list[torch.Tensor], modes: list[str], base: torch.Tensor) -> tuple[torch.Tensor, list[torch.Tensor]]:
    """Apply picks in order: add = max, sub = cut out of what is selected so far, the selection and each
    added mask alike. base is the empty selection, allocated by the caller on the masks' device.
    -> (the selection, the added masks as picked and cut, minus the ones cut away entirely)."""
    mask = base
    added = []
    for m, mode in zip(masks, modes):
        if mode == "add":
            mask = torch.maximum(mask, m)
            added.append(m)
        else:
            mask = mask * (1 - m)
            added = [a * (1 - m) for a in added]
    return mask, [a for a in added if a.any()]


def clean(mask: np.ndarray, frac: float = 0.01) -> np.ndarray:
    """bool mask without its specks, SAM's own small-region cleanup: drops 8-connected islands under frac of its
    area and fills holes under frac of it. Background that reaches the image border is never a hole."""
    regions, count = label(mask, structure=np.ones((3, 3)))
    if not count:
        return mask
    areas = np.bincount(regions.ravel())
    keep = areas >= frac * mask.sum()
    keep[0] = False
    mask = keep[regions]
    holes, count = label(~mask)
    fill = np.bincount(holes.ravel()) < frac * mask.sum()
    fill[0] = False
    fill[np.unique(np.concatenate([holes[0], holes[-1], holes[:, 0], holes[:, -1]]))] = False
    return mask | fill[holes]


def drop_specks(mask: torch.Tensor, frac: float = 0.01) -> torch.Tensor:
    """clean() on mask > 0.5, as a 0/1 mask of mask's dtype and device."""
    return torch.from_numpy(clean((mask > 0.5).cpu().numpy(), frac)).to(mask.device, mask.dtype)


def trimap(mask: np.ndarray, margin: float) -> np.ndarray:
    """ViTMatte trimap of a bool mask: 1 = sure foreground, 0 = sure background, 0.5 = let the matte decide.
    The unknown band reaches margin * the object's long side past its edge, and 2% of it inward, capped at a
    third of the object's thickness so thin parts (a zipper) keep a foreground core."""
    out = np.zeros(mask.shape, np.float32)
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return out
    side = max(xs.max() - xs.min(), ys.max() - ys.min()) + 1
    d_in = distance_transform_edt(mask)
    thick = d_in.max()
    r_out = max(2, round(margin * side))
    r_in = max(2, round(0.02 * side))
    r_in = max(1, min(r_in, int(thick / 3)))
    out[distance_transform_edt(~mask) <= r_out] = 0.5
    # 1-2 px thick: no pixel is deeper than r_in, keep the medial ones as the core
    out[d_in > r_in if thick > r_in else d_in >= thick] = 1
    return out
