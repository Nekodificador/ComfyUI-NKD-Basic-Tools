"""Manual GPU check for NKD Mask Picker with a real SAM3 checkpoint. Not a unit test.

    python tests/check_maskpicker_live.py <sam3 checkpoint path> <image> ["x,y;x,y;..."]

The optional points (0..1) name the pieces of one object to group, e.g. a sofa and its cushions: each
picks the largest listed mask under it below 15 % of the image. Without them the 2 biggest figures are grouped.

Inits DynamicVRAM (aimdo) like main.py and runs in inference mode like ComfyUI runs nodes.
"""
import json
import os
import sys
import time
import types

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_COMFY = os.path.dirname(os.path.dirname(_PACK))
sys.path.insert(0, _COMFY)
os.chdir(_COMFY)

import comfy.options  # noqa: E402,F401
import comfy_aimdo.control  # noqa: E402
comfy_aimdo.control.init(simple_vram_headroom=None, nvml_pressure=True)

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
import comfy.memory_management  # noqa: E402
import comfy.model_management  # noqa: E402
import comfy.model_patcher  # noqa: E402

assert comfy_aimdo.control.init_devices((d.index, 0) for d in comfy.model_management.get_all_torch_devices())
comfy.model_patcher.CoreModelPatcher = comfy.model_patcher.ModelPatcherDynamic
comfy.memory_management.aimdo_enabled = True
import comfy.sd  # noqa: E402

_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_PACK]
sys.modules["nkdbt"] = _pkg
from nkdbt.nkd_mask_picker import SEAM, NKDMaskPicker  # noqa: E402
import nkdbt.picker_core as core  # noqa: E402

_inference = torch.inference_mode()  # keep a reference: a temporary is collected and the mode drops
_inference.__enter__()
model = comfy.sd.load_checkpoint_guess_config(sys.argv[1])[0]
pil = Image.open(sys.argv[2]).convert("RGB")
image = torch.from_numpy(np.asarray(pil, dtype=np.float32) / 255.0)[None]
H, W = image.shape[1:3]


def picker(iters, edges, sel, img=None):
    """The node with edges "sam" + refine_iterations, or "vitmatte" (its refine is fixed at 2)"""
    opt = {"edges": "sam", "refine_iterations": iters} if edges == "sam" else {"edges": "vitmatte", "edge_margin": 0.08}
    return NKDMaskPicker.execute(image if img is None else img, model, opt, 0.9, 0.8, sel)

for run in ("warmup", "timed"):
    torch.cuda.synchronize(); t = time.perf_counter()
    out = picker(0, "sam", "")
    torch.cuda.synchronize(); dt = time.perf_counter() - t
payload = out.ui["nkd_picker"][0]
segs = payload["masks"]
print(f"analyze: {len(segs)} masks in {dt:.2f}s, payload {len(json.dumps(payload)) / 1024:.0f} KB at {payload['w']}x{payload['h']}")
assert 15 <= len(segs) <= 400 and payload["image"].startswith("data:image/jpeg;base64,")
assert all(sum(s["rle"]) == payload["w"] * payload["h"] for s in segs)
mask, masks, bboxes = out.args
assert mask.shape == (1, H, W) and mask.sum() == 0 and masks.shape == (1, H, W)

# pick the 2 biggest confident figures (strict bar, not background patches), cut the smallest one out, with every edge mode
def borders(s):
    """image borders the mask reaches within 2 preview pixels (a mask 1 px short in the preview touches at full size)"""
    m = core.unrle(s["rle"], payload["h"], payload["w"])
    return int(m[:2].any()) + int(m[-2:].any()) + int(m[:, :2].any()) + int(m[:, -2:].any())
by_area = sorted([s for s in segs if borders(s) <= 1 and s["score"] > 0.8 and s["area"] < 0.15 * payload["w"] * payload["h"]],
                 key=lambda s: -s["area"])
sel = {"picks": [{"x": s["x"], "y": s["y"], "level": s["level"], "mode": "add"} for s in by_area[:2]]
                + [{"x": by_area[-1]["x"], "y": by_area[-1]["y"], "level": by_area[-1]["level"], "mode": "sub"}]}
hard = None
for iters, edges in ((0, "sam"), (1, "sam"), (2, "sam"), (5, "sam"), (2, "vitmatte"), (2, "vitmatte")):   # vitmatte twice: the first run loads it
    torch.cuda.synchronize(); t = time.perf_counter()
    mask, masks, bboxes = picker(iters, edges, json.dumps(sel)).args
    torch.cuda.synchronize(); dt = time.perf_counter() - t
    listed = core.unrle(by_area[0]["rle"], payload["h"], payload["w"])
    got = torch.nn.functional.interpolate(masks[:1, None], size=listed.shape, mode="nearest")[0, 0].numpy() > 0.5
    iou = (got & listed).sum() / max(1, (got | listed).sum())
    print(f"refine={iters} edges={edges}: 2 picks + 1 cut in {dt:.2f}s | masks {tuple(masks.shape)} | "
          f"IoU(first pick, listed) {iou:.3f} | bboxes {len(bboxes[0])}")
    assert masks.shape == (2, H, W) and len(bboxes[0]) == 2
    if iters == 0:
        assert iou > 0.9
    if iters == 2 and edges == "sam":
        hard = masks[0] > 0.5                                        # the matte refines this exact mask
    elif edges == "vitmatte":
        soft = masks[0]
        iou_off = ((soft > 0.5) & hard).sum().item() / max(1, ((soft > 0.5) | hard).sum().item())
        n_soft = ((soft > 0.02) & (soft < 0.98)).sum().item()
        x1, y1, x2, y2 = core.box_of(hard)
        g = max(x2 - x1, y2 - y1) // 2                               # the box grown by 50 % of its long side
        away = torch.ones_like(soft, dtype=torch.bool)
        away[max(0, y1 - g):y2 + g, max(0, x1 - g):x2 + g] = False
        n_away = (soft[away] != 0).sum().item()
        print(f"  vitmatte vs sam IoU {iou_off:.3f}, {n_soft} soft pixels, range {soft.min():.3f}..{soft.max():.3f}, "
              f"{n_away} nonzero of {away.sum().item()} pixels away from the object")
        # 0.8: the matte also drops the stray islands SAM adds to busy figures (seen on Mewtown, 0.825, cleaner)
        assert iou_off > 0.8 and soft.min() >= 0 and soft.max() <= 1 and n_soft > 100 and n_away == 0

# a background pick (2+ borders, over 25 %) is matted as 1 - the matte of the rest when that fits SAM better
bg = [s for s in segs if borders(s) >= 2 and s["area"] > 0.3 * payload["w"] * payload["h"]]
if bg:
    b = max(bg, key=lambda s: s["area"])
    one = json.dumps({"picks": [{"x": b["x"], "y": b["y"], "level": b["level"], "mode": "add"}]})
    hard = picker(2, "sam", one).args[1][0] > 0.5
    soft = picker(2, "vitmatte", one).args[1][0]
    iou_bg = ((soft > 0.5) & hard).sum().item() / max(1, ((soft > 0.5) | hard).sum().item())
    print(f"background pick ({b['area'] / (payload['w'] * payload['h']) * 100:.0f} %): vitmatte vs sam IoU {iou_bg:.3f}")
    assert iou_bg > 0.85
# a stroke: picks sharing a group are one entry of masks and bboxes, the max of the separate ones
two = [{"x": s["x"], "y": s["y"], "level": s["level"], "mode": "add"} for s in by_area[:2]]
apart = picker(0, "sam", json.dumps({"picks": two})).args[1]
mask, masks, bboxes = picker(0, "sam", json.dumps({"picks": [dict(p, group=4) for p in two]})).args
print(f"grouped: {len(two)} picks -> masks {tuple(masks.shape)}, bboxes {len(bboxes[0])}")
assert apart.shape[0] == 2 and masks.shape == (1, H, W) and len(bboxes[0]) == 1
assert (masks[0] >= apart.amax(0)).all() and torch.equal(mask[0], masks[0])   # the union, seams closed

# a group mattes as one object: no seam inside it where its pieces touch
if len(sys.argv) > 3 and sys.argv[3]:
    pieces = []
    for xy in sys.argv[3].split(";"):
        x, y = map(float, xy.split(","))
        i = int(y * payload["h"]) * payload["w"] + int(x * payload["w"])
        under = [s for s in segs if s["area"] < 0.15 * payload["w"] * payload["h"]
                 and core.unrle(s["rle"], payload["h"], payload["w"]).ravel()[i]]
        pieces.append(max(under, key=lambda s: s["area"]))
else:
    pieces = by_area[:2]
group = [{"x": s["x"], "y": s["y"], "level": s["level"], "mode": "add"} for s in pieces]
print("group pieces, % of the image:", [round(s["area"] / (payload["w"] * payload["h"]) * 100, 2) for s in pieces])
one = json.dumps({"picks": [dict(p, group=1) for p in group]})
hard = picker(2, "sam", one).args[1][0]
x1, y1, x2, y2 = core.box_of(hard)
r = int(0.02 * max(x2 - x1, y2 - y1)) + 3          # past the trimap's inward band, where the matte may be soft by design
core_px = -torch.nn.functional.max_pool2d(-hard[None, None], 2 * r + 1, 1, r)[0, 0] > 0.5
apart = picker(2, "sam", json.dumps({"picks": group})).args[1]
t = time.perf_counter()
core.solid(list(apart), max(2, round(SEAM * max(H, W))))
print(f"grouping step (bridge + hole fill) on {len(apart)} pieces at {W}x{H}: {(time.perf_counter() - t) * 1000:.0f} ms")
touch = (torch.nn.functional.max_pool2d(apart[:, None], 7, 1, 3)[:, 0] > 0.5).sum(0) >= 2   # within 3 px of 2+ pieces
touch &= core_px
for kind, pick_sel in (("separate", json.dumps({"picks": group})), ("grouped", one)):
    torch.cuda.synchronize(); t = time.perf_counter()
    soft = picker(2, "vitmatte", pick_sel).args[0][0]
    torch.cuda.synchronize(); dt = time.perf_counter() - t
    print(f"seam check, {len(group)} pieces {kind} ({dt:.2f}s): min alpha inside the union eroded by {r} px {soft[core_px].min():.3f}, "
          f"{(soft[core_px] < 0.9).sum().item()} of {core_px.sum().item()} pixels under 0.9, "
          f"{(soft[touch] < 0.9).sum().item()} of {touch.sum().item()} where pieces touch")
    if kind == "separate" and not touch.any():
        print("  the pieces don't touch inside the union: no seam to show")   # printed, not asserted: ViTMatte may close a seam
assert soft[core_px].min() > 0.9

# a forced pick: its points as one prompt, listed with its 3 levels, bypassing the quality filter and NMS
body = [[0.72, 0.72], [0.82, 0.58], [0.62, 0.78]]
out = picker(2, "vitmatte", json.dumps({"picks": [{"points": body, "level": 1, "mode": "add", "group": 0}]}))
forced = [s for s in out.ui["nkd_picker"][0]["masks"] if "points" in s]
mask = out.args[0]
print(f"forced pick, {len(body)} points: levels scored {[s['score'] for s in forced]}, areas {[s['area'] for s in forced]}, "
      f"mask covers {mask.gt(0.5).float().mean().item() * 100:.1f} %")
assert len(forced) == 3 and [s["level"] for s in forced] == [0, 1, 2] and forced[0]["points"] == body
assert len(out.ui["nkd_picker"][0]["masks"]) == len(segs) + 3 and mask.gt(0.5).any()
print("peak VRAM GB %.2f" % (torch.cuda.max_memory_allocated() / 2**30))

# a flat image may segment into nothing: still a payload and an empty (1, H, W) mask
flat = picker(2, "vitmatte", "", img=torch.full((1, 512, 768, 3), 0.5))
assert "image" in flat.ui["nkd_picker"][0] and flat.args[0].shape == (1, 512, 768) and flat.args[0].sum() == 0
print(f"blank image: {len(flat.ui['nkd_picker'][0]['masks'])} masks, no crash")
