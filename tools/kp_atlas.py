"""What does each implicit keypoint actually move?

LivePortrait never documents its 21 keypoints — they are unsupervised latents.
Everything anyone has written about them is inferred from how
the community's hand-tuned slider table happens to use them. This measures it:
push one keypoint on one axis, diff against neutral, and draw where the picture
moved.
"""
import sys, os, types, importlib
import numpy as np, cv2, torch
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CU = os.path.dirname(os.path.dirname(REPO))
sys.path.insert(0, CU)
pkg = types.ModuleType("nkdbt"); pkg.__path__ = [REPO]; sys.modules["nkdbt"] = pkg
eng = importlib.import_module("nkdbt.nkd_face_rig_engine")

if len(sys.argv) < 2:
    raise SystemExit("usage: python tools/kp_atlas.py <portrait.jpg> [out.png]")
src = sys.argv[1]
img = cv2.imread(src)
if img is None:
    raise SystemExit("could not read " + src)
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
out_path = sys.argv[2] if len(sys.argv) > 2 else "kp_atlas.png"
E = eng.Engine.get(); ps = E.prepare(rgb, 1.7)
base = E.render(ps, torch.zeros(1, 21, 3), np.zeros(3, np.float32), paste=False).astype(np.int16)
face = cv2.cvtColor(ps.crop_512, cv2.COLOR_RGB2BGR)

AMOUNT = 0.03
tiles, labels = [], []
for kp in range(21):
    e = torch.zeros(1, 21, 3)
    e[0, kp, 1] = AMOUNT                       # push it down the y axis
    out = E.render(ps, e, np.zeros(3, np.float32), paste=False).astype(np.int16)
    d = np.abs(out - base).sum(2).astype(np.float32)
    d = cv2.GaussianBlur(d, (0, 0), 4)
    peak = float(d.max())
    d = np.clip(d / (peak + 1e-6), 0, 1)
    heat = cv2.applyColorMap((d * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
    tile = cv2.addWeighted(face, 0.45, heat, 0.55, 0)
    ys, xs = np.nonzero(d > 0.6)
    cx = float(xs.mean()) if len(xs) else 0.0
    cy = float(ys.mean()) if len(ys) else 0.0
    cv2.circle(tile, (int(cx), int(cy)), 9, (255, 255, 255), 2)
    tile = cv2.resize(tile, (176, 176))
    cv2.rectangle(tile, (0, 156), (176, 176), (0, 0, 0), -1)
    side = "L" if cx < 246 else ("R" if cx > 266 else "C")
    cv2.putText(tile, "kp%d  %s  %.0f" % (kp, side, peak), (4, 171),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
    tiles.append(tile)
    labels.append((kp, side, round(cx, 1), round(cy, 1), round(peak, 1)))

while len(tiles) % 5:
    tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)]
cv2.imwrite(out_path, np.vstack(rows))
print("wrote", out_path)
print("kp  side   cx     cy    peak")
for kp, side, cx, cy, pk in labels:
    print("%2d   %s  %6.1f %6.1f  %6.1f" % (kp, side, cx, cy, pk))
