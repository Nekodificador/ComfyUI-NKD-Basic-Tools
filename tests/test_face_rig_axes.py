# coding: utf-8
"""
Checks for the face rig axis library. No GPU, no ComfyUI, no framework.

    python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_face_rig_axes.py

The core of it is parity with the legacy slider table: our axes are that table
split by side, so every original slider must be reproducible by adding our
halves back together. If that ever stops holding, an expression somebody
already dialled in changes meaning under them.
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
ax = importlib.import_module("nkdbt.nkd_face_rig_axes")


def legacy_fe(eyes=0.0, eyebrow=0.0, wink=0.0, pupil_x=0.0, pupil_y=0.0,
            mouth=0.0, eee=0.0, woo=0.0, smile=0.0,
            rotate_pitch=0.0, rotate_yaw=0.0, rotate_roll=0.0):
    """The de-facto legacy slider table, in numpy.

    Re-derived constant by constant and verified against live behaviour, so
    the comparison is against what actually runs, not a description of it.
    """
    x = np.zeros((21, 3), np.float64)

    x[20, 1] += smile * -0.01
    x[14, 1] += smile * -0.02
    x[17, 1] += smile * 0.0065
    x[17, 2] += smile * 0.003
    x[13, 1] += smile * -0.00275
    x[16, 1] += smile * -0.00275
    x[3, 1] += smile * -0.0035
    x[7, 1] += smile * -0.0035

    x[19, 1] += mouth * 0.001
    x[19, 2] += mouth * 0.0001
    x[17, 1] += mouth * -0.0001
    rotate_pitch -= mouth * 0.05

    x[20, 2] += eee * -0.001
    x[20, 1] += eee * -0.001
    x[14, 1] += eee * -0.001

    x[14, 1] += woo * 0.001
    x[3, 1] += woo * -0.0005
    x[7, 1] += woo * -0.0005
    x[17, 2] += woo * -0.0005

    x[11, 1] += wink * 0.001
    x[13, 1] += wink * -0.0003
    x[17, 0] += wink * 0.0003
    x[17, 1] += wink * 0.0003
    x[3, 1] += wink * -0.0003
    rotate_roll -= wink * 0.1
    rotate_yaw -= wink * 0.1

    if 0 < pupil_x:
        x[11, 0] += pupil_x * 0.0007
        x[15, 0] += pupil_x * 0.001
    else:
        x[11, 0] += pupil_x * 0.001
        x[15, 0] += pupil_x * 0.0007

    x[11, 1] += pupil_y * -0.001
    x[15, 1] += pupil_y * -0.001
    eyes -= pupil_y / 2.0

    x[11, 1] += eyes * -0.001
    x[13, 1] += eyes * 0.0003
    x[15, 1] += eyes * -0.001
    x[16, 1] += eyes * 0.0003

    if 0 < eyebrow:
        x[1, 1] += eyebrow * 0.001
        x[2, 1] += eyebrow * -0.001
    else:
        x[1, 0] += eyebrow * -0.001
        x[2, 0] += eyebrow * 0.001
        x[1, 1] += eyebrow * 0.0003
        x[2, 1] += eyebrow * -0.0003

    return x, np.array([rotate_pitch, rotate_yaw, rotate_roll])


def same(a, b, what, tol=1e-6):
    d = float(np.max(np.abs(np.asarray(a) - np.asarray(b))))
    assert d < tol, "{}: max diff {:g}".format(what, d)


def demo():
    AX = ax.default_axes()

    def C(w):
        e, r = ax.compose(w, AX)
        return e[0], r

    # --- parity with the legacy table -------------------------------------------
    # Both halves at 1.0 must equal the original slider at *its own* far end.
    # The gains are what make 1.0 mean the same amount of gesture on every
    # handle; upstream's ranges disagree wildly (smile 1.3, aaa 120, blink -20).
    # This is also the promise that splitting left from right cost nothing.
    same(C({"au12": 1.0})[0], legacy_fe(smile=ax.FULL_SMILE)[0], "smile = au12")

    e, r = C({"au26": 1.0})
    same(e, legacy_fe(mouth=ax.FULL_JAW)[0], "aaa = au26")
    same(r, legacy_fe(mouth=ax.FULL_JAW)[1], "aaa still tips the head down")

    same(C({"au20": 1.0})[0], legacy_fe(eee=ax.FULL_LIP)[0], "eee = au20")
    same(C({"au18": 1.0})[0], legacy_fe(woo=ax.FULL_LIP)[0], "woo = au18")

    same(C({"au45_L": 1.0, "au45_R": 1.0})[0], legacy_fe(eyes=ax.FULL_BLINK)[0],
         "a weight of 1.0 shuts the eye, which upstream needed blink=-20 for")

    # pupil_x was non-linear across zero upstream; each half is linear here.
    same(C({"au61": 1.0})[0], legacy_fe(pupil_x=ax.FULL_GAZE)[0], "look right = pupil_x > 0")
    same(C({"au62": 1.0})[0], legacy_fe(pupil_x=-ax.FULL_GAZE)[0], "look left = pupil_x < 0")

    # Looking up lifts the lids too — the coupling is baked into the vector.
    same(C({"au63": 1.0})[0], legacy_fe(pupil_y=ax.FULL_GAZE)[0], "look up carries the lid coupling")
    same(C({"au64": 1.0})[0], legacy_fe(pupil_y=-ax.FULL_GAZE)[0], "look down carries it as well")

    same(C({"au1_2_L": 1.0, "au1_2_R": 1.0})[0], legacy_fe(eyebrow=ax.FULL_BROW_UP)[0],
         "brow raise = au1_2_L + au1_2_R")
    same(C({"au4_L": 1.0, "au4_R": 1.0})[0], legacy_fe(eyebrow=-ax.FULL_BROW_DOWN)[0],
         "brow furrow = au4_L + au4_R")

    # --- linearity ------------------------------------------------------
    # Without this, presets could not be blended or scaled.
    a = {"au12": 0.4, "au26": 0.7}
    b = {"au12": 0.1, "au45_R": 0.9}
    both = {k: a.get(k, 0.0) + b.get(k, 0.0) for k in set(a) | set(b)}
    same(C(both)[0], C(a)[0] + C(b)[0], "compose is additive")
    same(C({"au26": 2.0})[0], C({"au26": 1.0})[0] * 2, "compose is homogeneous")

    # --- orthogonality --------------------------------------------------
    orth = ax.orthogonalize(AX)
    m = ax.matrix(orth)
    g = m @ m.T
    off = float(np.max(np.abs(g - np.diag(np.diag(g)))))
    assert off < 1e-6, "axes are not independent: max off-diagonal {:g}".format(off)
    # The span must survive: orthogonalising is a change of basis, not a
    # reduction of what the rig can reach.
    assert np.linalg.matrix_rank(ax.matrix(AX), tol=1e-9) == \
        np.linalg.matrix_rank(m, tol=1e-9), "orthogonalize lost reach"
    # Magnitudes are preserved so slider ranges keep meaning something.
    for a0, a1 in zip(sorted(AX, key=lambda z: z.name), sorted(orth, key=lambda z: z.name)):
        if a0.name == a1.name:
            same(np.linalg.norm(a0.flat()), np.linalg.norm(a1.flat()),
                 "magnitude kept for " + a0.name, tol=1e-6)

    # --- decompose ------------------------------------------------------
    # Reading a pose back into handle positions. Least squares, not per-axis
    # projection, because the raw axes overlap.
    w = {"au12": 0.6, "au26": 0.5, "au45_L": 0.8}
    got = ax.decompose(C(w)[0], orth)
    rebuilt, _ = ax.compose(got, orth)
    same(rebuilt[0], C(w)[0], "decompose round-trips on an independent basis", tol=1e-7)

    # Degenerate axes must not explode — lstsq gives the minimum-norm answer.
    dup = [AX[0], ax.replace(AX[0], name="dup")]
    got = ax.decompose(C({"au12": 1.0})[0], dup)
    assert all(np.isfinite(v) for v in got.values()), "decompose blew up on duplicate axes"

    # --- symmetry -------------------------------------------------------
    assert ax.mirror_of("au45_L") == "au45_R", ax.mirror_of("au45_L")
    assert ax.mirror_of("au26") is None, "centre axes have no opposite"
    assert ax.mirror_of("au12") is None, "the mouth is one centre axis, not a pair"
    # The bug this exists to prevent: mirroring must copy, never negate. A
    # sign flip turns "furrow both brows" into one furrowing and one spreading.
    m2 = ax.apply_mirror({"au4_L": 0.8}, "au4_L")
    assert m2["au4_R"] == 0.8, m2
    e_both, _ = ax.compose(m2, AX)
    same(e_both[0], legacy_fe(eyebrow=-0.8 * ax.FULL_BROW_DOWN)[0],
         "mirrored furrow equals the original both-brow furrow")

    # --- presets --------------------------------------------------------
    w, missing = ax.preset_weights("happy", 1.0, AX)
    assert w.get("au12") == 1.0, w
    # The AU6 the basis lacks is approximated by a squint AND still reported
    # missing — honest about the stand-in, ready for a captured axis.
    assert missing == ["AU6"], missing
    assert w.get("au45_L", 0) > 0, w
    w, missing = ax.preset_weights("surprised", 0.5, AX)
    # Direct axis keys scale with intensity too, sign included (eyes widen).
    assert w.get("au26", 0) > 0 and w.get("au1_2_L", 0) > 0, w
    assert w.get("au45_L", 0) < 0, w
    assert set(missing) == {"AU5"}, missing
    for name in ax.PRESETS:
        w, _ = ax.preset_weights(name, 1.0, AX)
        # Every preset must resolve, and must actually move the face now:
        # "disgusted" once resolved to zero axes and a dial that did nothing.
        assert w, name

    # --- per-side mouth aliases -----------------------------------------
    # The latent has no left/right mouth, so the two corner handles are
    # aliases resolved per render (the engine composites the halves).
    assert not ax.is_sided({"au12_L": 0.7, "au12_R": 0.7}), "equal corners are symmetric"
    assert ax.is_sided({"au12_L": 0.7, "au12_R": 0.0}), "a smirk needs the two-render path"
    # A rig saved before the split carries the central name and must still
    # read as symmetric — and resolve to exactly what it always meant.
    assert not ax.is_sided({"au12": 0.8}), "a legacy rig is not suddenly asymmetric"
    same(ax.compose(ax.resolve_sides({"au12": 0.8}), AX)[0],
         C({"au12": 0.8})[0], "a legacy mouth weight still composes the same")
    # Each render keeps its own side's value...
    assert ax.resolve_sides({"au12_L": 0.9, "au12_R": 0.0}, "L")["au12"] == 0.9
    assert "au12" not in ax.resolve_sides({"au12_L": 0.9, "au12_R": 0.0}, "R")
    # ...and the aliases never leak into compose() as unknown axis names.
    for keep in ("L", "R", None):
        assert not (set(ax.resolve_sides({"au12_L": 0.5, "au18_R": 0.4}, keep))
                    & set(ax.sided_names())), keep
    # Out-of-range corner values are clamped by the central axis, because
    # blend() cannot clamp a name that is not an axis.
    assert ax.resolve_sides({"au12_L": 9.0}, "L")["au12"] == ax.by_name(AX)["au12"].hi

    # --- capture --------------------------------------------------------
    neutral = np.zeros((21, 3), np.float32)
    direction = C({"au12": 1.0})[0]
    cap = ax.capture_axis(neutral, neutral + direction * 3.0, "au6_L", "cheek raise", "AU6")
    cos = float(np.dot(cap.flat(), direction.reshape(-1))
                / (np.linalg.norm(cap.flat()) * np.linalg.norm(direction)))
    same(cos, 1.0, "a captured axis points where the photos pointed", tol=1e-5)
    # And once recorded, the preset that wanted it stops reporting it missing.
    w, missing = ax.preset_weights("happy", 1.0, AX + [cap])
    assert missing == [], missing
    assert w.get("au6_L") == 1.0, w

    # --- state serialisation -------------------------------------------
    st = ax.deserialise("")
    assert st["w"] == {} and st["p"] == {} and st["mirror"] is False, st
    st = {"w": {"au12": 0.5, "au26": 0.0}, "rot": [1.0, 0.0, 0.0],
          "scale": 0.0, "trans": [0.0, 0.0], "ortho": False, "mirror": False}
    text = ax.serialise(st)
    # Zero weights and default fields are dropped, so the string stays small
    # and an old workflow keeps loading as new fields appear.
    assert "au26" not in text and "mirror" not in text, text
    assert "rot" in text, text
    back = ax.deserialise(text)
    assert back["w"] == {"au12": 0.5}, back
    assert back["mirror"] is False and back["rot"] == [1.0, 0.0, 0.0], back
    # A non-default mirror survives the round trip.
    assert ax.deserialise(ax.serialise(dict(st, mirror=True)))["mirror"] is True
    # A widget somebody typed into by hand must not take the node down.
    assert ax.deserialise("{not json")["w"] == {}, "malformed rig should read as empty"

    # --- preset dials ---------------------------------------------------
    # A preset is a layer over the handles, not a replacement for them: the
    # handle weight has to survive the blend, and pulling the dial to zero has
    # to give it back untouched.
    blended = ax.blend({"au12": 0.4}, {"surprised": 0.5}, AX)
    assert blended["au12"] == 0.4, blended
    assert blended["au26"] > 0 and blended["au1_2_L"] > 0, blended
    assert ax.blend({"au12": 0.4}, {"surprised": 0.0}, AX) == {"au12": 0.4}, "zero dial must be a no-op"
    assert ax.blend({}, {"nonsense": 1.0}, AX) == {}, "an unknown preset must not throw"
    # Two dials that share an action unit add up rather than one winning...
    both = ax.blend({}, {"sad": 0.3, "angry": 0.3}, AX)
    assert abs(both["au4_L"] - (1.0 + 1.0) * 0.3) < 1e-9, both
    # ...but never past the end of the axis. Stacking handles and three dials
    # used to reach 4.0, and at that point the warping field smears teeth and
    # collapses cheeks — it renders something, just nothing like a face.
    piled = ax.blend({a.name: 1.0 for a in AX},
                     {"angry": 1.0, "sad": 1.0, "afraid": 1.0}, AX)
    idx = ax.by_name(AX)
    for name, v in piled.items():
        assert idx[name].lo - 1e-9 <= v <= idx[name].hi + 1e-9, (name, v)
    assert max(piled.values()) <= 1.0, max(piled.values())
    # And it round-trips through the widget string.
    txt = ax.serialise({"w": {"au12": 0.4}, "p": {"happy": 0.25}})
    assert ax.deserialise(txt)["p"] == {"happy": 0.25}, txt

    # --- labels ---------------------------------------------------------
    # Everything the user reads is plain English; the AU code is the internal
    # id, shown only behind the facs toggle.
    for a0 in AX:
        assert a0.label and a0.label.isascii(), a0.name
        assert not a0.label.lower().startswith("au"), a0.label
        assert a0.side in ("L", "R", "C"), a0.name
        assert a0.exp.shape == (21, 3), a0.name

    print("face rig axes ok")


if __name__ == "__main__":
    demo()
