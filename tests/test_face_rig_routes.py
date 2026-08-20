# coding: utf-8
"""
The face rig preview contract. Needs the weights and a GPU; skips without them.

    python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_face_rig_routes.py [portrait.jpg]

What this is here to catch: the editor places every control at the anchor the
backend sends, so an anchor that fails to arrive puts that control in the dead
centre of the picture. That happened — the anchors travelled in an HTTP header,
the feature outlines were added to it, and past a certain size the header stopped
being reliable. A missing anchor cannot be distinguished from a legitimate one
by the client, so the guarantee has to be made here: every response that carries
an image carries a full set of anchors with it.
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

eng = importlib.import_module("nkdbt.nkd_face_rig_engine")
axes = importlib.import_module("nkdbt.nkd_face_rig_axes")

EXPECTED_ANCHORS = {"brow_L", "brow_R", "lid_L", "lid_R", "gaze",
                    "corner_L", "corner_R", "lips", "jaw"}
EXPECTED_OUTLINES = {"brow_L", "brow_R", "eye_L", "eye_R", "lips"}


def demo():
    missing = eng.missing_weights()
    if missing:
        print("face rig routes skipped (weights missing: %s)" % ", ".join(missing))
        return

    import cv2
    node = importlib.import_module("nkdbt.nkd_face_rig")
    routes = importlib.import_module("nkdbt.nkd_face_rig_routes")

    # Any portrait works; pass one as argv[1] or drop a `face_test.png` into
    # the ComfyUI input folder.
    shot = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        COMFY, "input", "face_test.png")
    if not os.path.exists(shot):
        print("face rig routes skipped (no test portrait)")
        return
    rgb = cv2.cvtColor(cv2.imread(shot), cv2.COLOR_BGR2RGB)
    node.prepared_source("test", rgb, 1.7)          # as the node does on execute

    poses = ["", axes.serialise({"w": {"au12": 0.8, "au45_L": 1.0}}),
             axes.serialise({"w": {}, "p": {"surprised": 0.5}}),
             axes.serialise({"w": {"au26": 0.5}, "rot": [4.0, -6.0, 3.0]})]

    seen = []
    for rig in poses:
        for quality in ("drag", "final"):
            got = routes.render("test", rig, quality)
            assert got is not None, "a prepared node must never answer 'no source'"
            body, mime, anch, settled = got
            assert body and len(body) > 1000, "empty preview for %r" % rig

            # The guarantee. Not "some anchors" — all of them, every time,
            # because one missing key silently recentres one control.
            a = anch["_anchors"]
            assert set(a) == EXPECTED_ANCHORS, sorted(set(a) ^ EXPECTED_ANCHORS)
            for name, p in a.items():
                assert len(p) == 2, name
                assert all(np.isfinite(p)), name
                # Normalised over the crop. Outside 0..1 means the control would
                # be drawn off the picture entirely.
                assert -0.2 <= p[0] <= 1.2 and -0.2 <= p[1] <= 1.2, (name, p)

            o = anch["_outlines"]
            assert set(o) == EXPECTED_OUTLINES, sorted(set(o) ^ EXPECTED_OUTLINES)
            for name, pts in o.items():
                assert len(pts) >= 3, "%s outline is not a shape" % name
                assert all(len(p) == 2 and all(np.isfinite(p)) for p in pts), name

            assert mime in ("image/jpeg", "image/png"), mime
            # Dragging is the cheap encoding; letting go is the good one.
            assert (mime == "image/jpeg") == (quality == "drag"), (quality, mime)
            seen.append((rig, quality, a["lips"]))

    # Anchors must respond to the pose. A jaw dropped half way moves the lip
    # anchor down; if it does not, the re-measure on release is not happening
    # and the controls will sit on the neutral face forever.
    neutral = [p for r, q, p in seen if r == "" and q == "final"][0]
    jaw = [p for r, q, p in seen if "au26" in r and q == "final"][0]
    assert jaw[1] > neutral[1] + 0.005, (neutral, jaw)

    # An unknown node has nothing prepared: the editor is told, not crashed.
    assert routes.render("no-such-node", "", "final") is None

    # A rig somebody hand-edited into nonsense still renders.
    got = routes.render("test", "{oops", "final")
    assert got is not None and got[0], "a malformed rig must not break the preview"

    print("face rig routes ok")


if __name__ == "__main__":
    demo()
