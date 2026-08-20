# coding: utf-8
"""
Checks for the face crop and mask geometry. No GPU, no models, no ComfyUI.

    python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_face_mask.py

Everything here runs on a synthetic set of 203 landmarks laid out the way the
atlas says the real ones are, so the arithmetic can be checked without an ONNX
session: rotating that face by a known angle must show up as that angle in
`roll_degrees`, the alignment must take exactly that angle back out, and the
mask must land on the features it claims to.
"""
import importlib
import os
import sys
import types

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
COMFY = os.path.dirname(os.path.dirname(REPO))
sys.path.insert(0, COMFY)
_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [REPO]
sys.modules["nkdbt"] = _pkg
fc = importlib.import_module("nkdbt.nkd_face_core")


def ring(cx, cy, rx, ry, n, start=0.0):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False) + start
    return np.stack([cx + rx * np.cos(t), cy + ry * np.sin(t)], axis=1)


def synthetic_face(size=512.0):
    """203 landmarks on an upright face, in the ranges the atlas maps.

    Sized and placed like a real crop: face centred, eyes above centre, mouth
    below, so "above the brow" and "inside the eye" mean what they say.
    """
    s = size
    lmk = np.zeros((203, 2), np.float64)
    lmk[0:24] = ring(0.36 * s, 0.42 * s, 0.07 * s, 0.035 * s, 24)      # eye L
    lmk[24:48] = ring(0.64 * s, 0.42 * s, 0.07 * s, 0.035 * s, 24)     # eye R
    lmk[48:72] = ring(0.50 * s, 0.72 * s, 0.11 * s, 0.05 * s, 24)      # lips outer
    lmk[72:108] = ring(0.50 * s, 0.72 * s, 0.08 * s, 0.03 * s, 36)     # lips inner
    lmk[108:144] = ring(0.50 * s, 0.55 * s, 0.30 * s, 0.40 * s, 36)    # face outline
    lmk[144:165] = ring(0.36 * s, 0.34 * s, 0.09 * s, 0.02 * s, 21)    # brow L
    lmk[165:185] = ring(0.64 * s, 0.34 * s, 0.09 * s, 0.02 * s, 20)    # brow R
    lmk[185:203] = ring(0.50 * s, 0.56 * s, 0.04 * s, 0.08 * s, 18)    # nose
    return lmk


def rotate(lmk, degrees, centre=(256.0, 256.0)):
    """Turn the face clockwise on screen (y points down)."""
    t = np.radians(degrees)
    m = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    return (lmk - centre) @ m.T + centre


def picture(size=512):
    """A face-ish image: light oval on a dark ground, so GrabCut has an edge."""
    import cv2
    img = np.full((size, size, 3), 30, np.uint8)
    cv2.ellipse(img, (size // 2, int(size * 0.55)),
                (int(size * 0.30), int(size * 0.40)), 0, 0, 360, (200, 170, 150), -1)
    return img


def close(a, b, tol):
    assert abs(a - b) <= tol, "%.4f != %.4f (tol %.4f)" % (a, b, tol)


# --- roll -------------------------------------------------------------------

def test_roll_matches_the_rotation_applied():
    base = synthetic_face()
    zero = fc.roll_degrees(base)
    for angle in (-40.0, -12.5, 0.0, 7.0, 30.0):
        close(fc.roll_degrees(rotate(base, angle)) - zero, angle, 1e-6)


def test_roll_is_positive_clockwise():
    # Tilt the head so the chin swings to the picture's left: on screen that is
    # a clockwise turn, and the sign has to say so.
    base = synthetic_face()
    assert fc.roll_degrees(rotate(base, 20.0)) > fc.roll_degrees(base)


# --- alignment --------------------------------------------------------------

def test_align_is_invertible():
    from nkdbt.nkd_liveportrait.utils.crop import _transform_pts
    lmk = rotate(synthetic_face(), 23.0)
    a = fc.align(picture(), lmk, size=256, padding=1.7)
    back = _transform_pts(a["lmk_crop"], a["M_c2o"][:2])
    err = float(np.abs(back - lmk).max())
    assert err < 1e-3, "roundtrip drifted by %.5f px" % err


def test_upright_takes_the_tilt_out():
    lmk = rotate(synthetic_face(), 30.0)
    a = fc.align(picture(), lmk, size=256, padding=1.7, upright=True)
    close(a["roll"], fc.roll_degrees(lmk), 1e-6)
    # What the crop reports is what the crop did: the face inside it is level.
    close(fc.roll_degrees(a["lmk_crop"]), 0.0, 1.0)


def test_not_upright_keeps_the_tilt():
    lmk = rotate(synthetic_face(), 30.0)
    a = fc.align(picture(), lmk, size=256, padding=1.7, upright=False)
    close(a["roll"], 0.0, 1e-9)                       # nothing was taken out
    close(fc.roll_degrees(a["lmk_crop"]), fc.roll_degrees(lmk), 1.0)


def test_crop_is_square_and_the_size_asked_for():
    a = fc.align(picture(), synthetic_face(), size=384, padding=2.0)
    assert a["crop"].shape[:2] == (384, 384), a["crop"].shape


# --- masks ------------------------------------------------------------------

def at(mask, lmk, idx, inset=0.0):
    """The mask value where landmark `idx` sits, optionally pulled inward.

    Points on an outline sit *on* the mask's edge, where an antialiased fill is
    half-covered by definition. `inset` moves the probe that fraction of the way
    toward the face's centre, which is the difference between testing the fill
    and testing the edge.
    """
    p = lmk[idx]
    if inset:
        p = p + (lmk.mean(axis=0) - p) * inset
    return float(mask[int(round(p[1])), int(round(p[0]))])


def centre_of(mask, lmk, lo, hi):
    """The mask value at the centre of the ring `lmk[lo:hi]`."""
    x, y = lmk[lo:hi].mean(axis=0)
    return float(mask[int(round(y)), int(round(x))])


def test_face_mask_covers_the_face_and_stays_in_range():
    lmk = synthetic_face()
    m = fc.region_mask(lmk, 512, 512, "face", forehead=0.0)
    assert m.shape == (512, 512)
    assert 0.0 <= float(m.min()) and float(m.max()) <= 1.0
    for idx in (126, 108, 130):                       # chin and two outline points
        assert at(m, lmk, idx, 0.05) > 0.9, "outline point %d outside the mask" % idx
    assert centre_of(m, lmk, 0, 24) > 0.9             # eye is inside the face
    assert float(m[10, 10]) < 0.01                    # a corner is not


def test_features_are_cut_out_of_the_face():
    lmk = synthetic_face()
    full = fc.region_mask(lmk, 512, 512, "face", forehead=0.0)
    cut = fc.region_mask(lmk, 512, 512, "face without features", forehead=0.0)
    eye = (int(round(lmk[0:24, 1].mean())), int(round(lmk[0:24, 0].mean())))
    lip = (int(round(lmk[48:72, 1].mean())), int(round(lmk[48:72, 0].mean())))
    cheek = (int(0.62 * 512), int(0.28 * 512))
    assert float(full[eye]) > 0.9 and float(cut[eye]) < 0.1
    assert float(full[lip]) > 0.9 and float(cut[lip]) < 0.1
    assert float(cut[cheek]) > 0.9, "the cheek should survive the cut-out"
    # 'skin' also drops the brows; 'face without features' keeps them.
    brow = (int(round(lmk[145:165, 1].mean())), int(round(lmk[145:165, 0].mean())))
    skin = fc.region_mask(lmk, 512, 512, "skin", forehead=0.0)
    assert float(cut[brow]) > 0.5 and float(skin[brow]) < 0.5


def test_forehead_reaches_above_the_brow():
    lmk = synthetic_face()
    brow_top = lmk[fc._BROWS, 1].min()

    def top(reach):
        m = fc.region_mask(lmk, 512, 512, "face", forehead=reach).numpy()
        rows = np.nonzero((m > 0.5).any(axis=1))[0]
        return float(rows.min())

    # With no reach the hull is the landmarks' own hull, which stops at the
    # outline; asking for a full eye-to-lip span has to push it well past the brow.
    assert top(1.0) < brow_top - 20, "forehead=1 did not clear the brow"
    assert top(1.0) < top(0.3) < top(0.0) + 1


def test_none_is_empty_and_features_is_only_features():
    lmk = synthetic_face()
    assert float(fc.region_mask(lmk, 512, 512, "none").max()) == 0.0
    feat = fc.region_mask(lmk, 512, 512, "features")
    assert centre_of(feat, lmk, 0, 24) > 0.9          # inside the eye
    cheek = (int(0.62 * 512), int(0.28 * 512))
    assert float(feat[cheek]) < 0.01                  # not the cheek


def test_mask_scales_with_the_canvas():
    lmk = synthetic_face(256.0)
    m = fc.region_mask(lmk, 256, 256, "face", forehead=0.0)
    assert m.shape == (256, 256)
    assert at(m, lmk, 126, 0.05) > 0.9


# --- detection ------------------------------------------------------------

def test_square_box_grows_and_squares():
    x1, y1, x2, y2 = fc.square_box((10.0, 20.0, 30.0, 80.0))   # 20 x 60
    assert (x2 - x1) == (y2 - y1) == 60.0                       # squared to the long side
    close((x1 + x2) / 2, 20.0, 1e-9)                             # centre kept
    close((y1 + y2) / 2, 50.0, 1e-9)
    a = fc.square_box((0.0, 0.0, 10.0, 10.0), 2.0)
    assert (a[2] - a[0]) == 20.0 and (a[0], a[1]) == (-5.0, -5.0)


def test_face_boxes_is_empty_when_no_detector():
    """No YuNet, no network, old OpenCV — all have to answer 'I cannot say'.

    Empty is what makes the caller fall back to the bootstrap walk, so this
    failing means a machine without the detector raises instead of coping.
    """
    original = fc.FaceDetector.get
    fc.FaceDetector.get = classmethod(lambda cls: (_ for _ in ()).throw(RuntimeError("no")))
    try:
        assert fc.face_boxes(picture()) == []
    finally:
        fc.FaceDetector.get = original


# --- refine -----------------------------------------------------------------

def test_refine_keeps_the_face_and_returns_a_mask():
    lmk = synthetic_face()
    img = picture()
    m = fc.region_mask(lmk, 512, 512, "face", forehead=0.0)
    r = fc.refine(img, m)
    assert r.shape == m.shape
    assert 0.0 <= float(r.min()) and float(r.max()) <= 1.0
    assert at(r, lmk, 126, 0.15) > 0.5, "refining lost the chin"
    assert float(r[10, 10]) < 0.5, "refining leaked into the background"


def test_refine_declines_an_empty_mask():
    import torch
    empty = torch.zeros(512, 512)
    assert fc.refine(picture(), empty) is empty


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok   %s" % name)
            except Exception as exc:
                failed += 1
                print("FAIL %s: %s" % (name, exc))
    raise SystemExit(failed)
