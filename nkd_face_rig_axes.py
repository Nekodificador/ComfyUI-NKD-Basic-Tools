# coding: utf-8
"""
😺NKD Face Rig — the axis library.

LivePortrait's expression latent is a (1, 21, 3) tensor: 63 free numbers with no
published meaning. The paper only claims they "represent a kind of blendshapes";
nobody has published a mapping from them to anything a person can name.

What the community settled on instead is a de-facto set of twelve slider
directions — constants found by trial and error (`exp[0, 14, 1] += smile *
-0.02` and friends). They work, but they are fixed, several are not even
linear — the horizontal gaze uses different constants depending on its sign —
and left and right are welded together, which is why a proper one-eyed wink
has been a standing request for years.

This module turns that idea into something you can extend. An axis is a named
direction in R^63 plus whatever head rotation it drags along. Three consequences:

* **Left and right split, where the latent space actually allows it.** Eyes
  and brows separate cleanly — the wink request, finally honoured. The mouth
  does not, and the reason is measured rather than guessed — see the keypoint
  atlas below.
* **New axes are recorded, not coded.** `capture_axis` takes the latent of a
  neutral photo and of the same face pulling a face, and the difference is a
  new axis — a one-off comparison turned into a library entry you keep.
* **They can be made independent.** `orthogonalize` runs Gram-Schmidt so moving
  one control stops quietly undoing another. It is off by default, because an
  orthogonalised `smile` is no longer "smile", it is "smile minus whatever the
  earlier axes already explained".

Names are FACS action units because that is the vocabulary animators already
have, and because it lets a preset be checked against the published EMFACS
combinations rather than invented. But AU12 means nothing to most people, so
every axis also carries a plain-English `label`, and that is what the UI shows.

Pure numpy on purpose: no torch, no ComfyUI, so `tests/test_face_rig_axes.py`
runs anywhere in a second.
"""
from __future__ import annotations

import json
import os
import os.path as osp
from dataclasses import dataclass, field, replace

import numpy as np

NUM_KP = 21
DIM = NUM_KP * 3

# Which keypoint moves what, measured rather than assumed.
#
# LivePortrait documents none of this — the 21 keypoints are unsupervised
# latents. Everything written about them elsewhere is inferred from how
# the legacy table happens to use them, and some of it is wrong. `tools/kp_atlas.py`
# pushes one keypoint at a time and photographs where the face moved:
#
#     kp1  left brow          kp2  right brow (bleeds into the left)
#     kp3  left mouth corner  kp7  right mouth corner   (weak, diffuse)
#     kp5  global             kp0/4/9/10/12/18  outline, hair, jaw edge
#     kp11 left eye           kp15 right eye
#     kp13 left lower lid     kp16 right lower lid
#     kp14 RIGHT mouth corner kp20 mouth centre
#     kp17 lip centre + nose  kp19 lower lip
#     kp6, kp8  near-inert at this magnitude
#
# "Left" is the left of the picture, which is the side the handle sits on. Two
# corrections to what is commonly assumed: **14 and 20 are not a left/right
# pair** — 14 is the right corner and 20 is the centre — and the real corner
# pair is 3/7, which carries an order of magnitude less weight in the legacy table
# than 14 does. That is why the mouth is not split by side here; see the
# comment above `au12`.
PAIRS = ((1, 2), (3, 7), (11, 15), (13, 16))


@dataclass
class Axis:
    """One named direction in expression space."""

    name: str                     # internal id, FACS-flavoured: "au12_L"
    label: str                    # what a person reads: "smile"
    au: str = ""                  # "AU12", or "" for axes with no action unit
    group: str = "custom"         # mouth | eyes | brows | head | custom
    side: str = "C"               # L | R | C
    exp: np.ndarray = field(default_factory=lambda: np.zeros((NUM_KP, 3), np.float32))
    rot: np.ndarray = field(default_factory=lambda: np.zeros(3, np.float32))
    lo: float = -1.0
    hi: float = 1.0

    def flat(self) -> np.ndarray:
        return self.exp.reshape(-1)


def _axis(name, label, au, group, side, cells, rot=(0.0, 0.0, 0.0),
          gain=1.0, lo=-1.0, hi=1.0) -> Axis:
    """Build an axis from `(keypoint, component, coefficient)` triples.

    `gain` is what makes a weight of 1.0 mean "all the way". The legacy sliders'
    coefficients are in the units of its own sliders, and those ranges are wild:
    `smile` runs -0.3..1.3 while `aaa` runs -30..120 and `blink` closes the eye
    at *minus* 20. Left raw, a rig where every handle goes 0..1 would give you a
    lovely smile and an eye that barely twitches. Each axis is therefore scaled
    by the far end of the slider it came from, sign included, so 1.0 is the full
    gesture everywhere and the handles are comparable to each other.
    """
    e = np.zeros((NUM_KP, 3), np.float32)
    for kp, comp, val in cells:
        e[kp, comp] += val * gain
    return Axis(name=name, label=label, au=au, group=group, side=side,
                exp=e, rot=np.array(rot, np.float32) * gain, lo=lo, hi=hi)


# The far end of each original slider. Kept named so the parity test can state
# the relationship rather than hide it inside a magic number.
FULL_SMILE = 1.3      # smile: -0.3 .. 1.3
FULL_JAW = 120.0      # aaa:   -30 .. 120
FULL_LIP = 15.0       # eee / woo: -20 .. 15
FULL_BLINK = -20.0    # blink: -20 (shut) .. 5 (staring)
FULL_GAZE = 15.0      # pupil_x / pupil_y: -15 .. 15
FULL_BROW_UP = 15.0   # eyebrow: 0 .. 15
FULL_BROW_DOWN = 10.0 # eyebrow: 0 .. -10


# --- the inherited axes ----------------------------------------------------
#
# The de-facto slider directions of existing expression workflows, re-derived
# and verified numerically (the constants are facts about the latent space,
# measured with tools/kp_atlas.py), then split by side wherever the atlas says
# the split is real. Coefficients are unchanged, including the lopsided ones:
# reproducing an expression somebody already dialled in matters more than
# looking tidy.
#
# Two legacy directions are deliberately not carried over:
#   `wink`  — with independent `au45_L` / `au45_R` a wink is just an asymmetric
#             blink. The legacy gesture also nudged the lip and tilted the head
#             to sell it; that is direction, not anatomy, and it belongs in a
#             preset if anyone wants it.
#   `scale` — never exposed as a slider anywhere either.

def default_axes() -> list:
    a = []

    # Mouth ---------------------------------------------------------------
    # `smile`, and the one place the side split does not happen.
    #
    # The plan was to halve this like the eyes. The keypoint atlas says no: the
    # cell doing the real work, kp14 at -0.02, turns out to be the *right*
    # corner on its own, and the genuine left/right pair (3 and 7) is five
    # times weaker and smeared across the cheek. Splitting on that basis would
    # produce a "left smile" handle that barely moves and a "right smile" that
    # does everything — worse than one honest handle.
    #
    # So the mouth keeps one centre axis, exactly as upstream had it. A
    # one-sided smirk needs a direction this latent space does not hand us for
    # free; record one from a pair of photos with `capture_axis`.
    a.append(_axis("au12", "smile", "AU12", "mouth", "C",
                   [(20, 1, -0.01), (14, 1, -0.02), (17, 1, 0.0065), (17, 2, 0.003),
                    (13, 1, -0.00275), (16, 1, -0.00275),
                    (3, 1, -0.0035), (7, 1, -0.0035)],
                   gain=FULL_SMILE, lo=-0.23, hi=1.0))

    # `aaa`. Opening the mouth tips the head down in the original, and that
    # coupling is kept: without it a wide-open mouth reads as a floating jaw.
    a.append(_axis("au26", "jaw open", "AU26", "mouth", "C",
                   [(19, 1, 0.001), (19, 2, 0.0001), (17, 1, -0.0001)],
                   rot=(-0.05, 0.0, 0.0), gain=FULL_JAW, lo=-0.25, hi=1.0))

    # `eee` and `woo`. Left as centre axes: keypoint 20 carries most of `eee`
    # and 14 most of `woo`, so splitting them by side would produce two badly
    # unbalanced halves of a gesture that is symmetric anyway.
    # ponytail: split them if someone ever needs a one-sided sneer.
    a.append(_axis("au20", "stretch", "AU20", "mouth", "C",
                   [(20, 2, -0.001), (20, 1, -0.001), (14, 1, -0.001)],
                   gain=FULL_LIP, lo=-1.0, hi=1.0))
    a.append(_axis("au18", "pucker", "AU18", "mouth", "C",
                   [(14, 1, 0.001), (3, 1, -0.0005), (7, 1, -0.0005), (17, 2, -0.0005)],
                   gain=FULL_LIP, lo=-1.0, hi=1.0))

    # Eyes ----------------------------------------------------------------
    # This is the split that #75 has been asking for since 2024. Note the
    # negative gain: upstream closes an eye by driving `blink` to -20, so 1.0
    # here means shut and the small negative range means wide-eyed.
    a.append(_axis("au45_L", "close", "AU45", "eyes", "L",
                   [(11, 1, -0.001), (13, 1, 0.0003)],
                   gain=FULL_BLINK, lo=-0.25, hi=1.0))
    a.append(_axis("au45_R", "close", "AU45", "eyes", "R",
                   [(15, 1, -0.001), (16, 1, 0.0003)],
                   gain=FULL_BLINK, lo=-0.25, hi=1.0))

    # `pupil_x` is the one axis upstream made non-linear: it uses one pair of
    # constants for positive values and another for negative. A direction that
    # changes shape at zero cannot be a basis vector, so it becomes two
    # one-sided axes that each stay linear.
    a.append(_axis("au61", "look right", "AU61", "eyes", "C",
                   [(11, 0, 0.0007), (15, 0, 0.001)],
                   gain=FULL_GAZE, lo=0.0, hi=1.0))
    a.append(_axis("au62", "look left", "AU62", "eyes", "C",
                   [(11, 0, -0.001), (15, 0, -0.0007)],
                   gain=FULL_GAZE, lo=0.0, hi=1.0))

    # Looking up also lifts the lids in the original (`eyes -= pupil_y / 2`).
    # Folding that coupling into the vector keeps the axis linear, which is
    # what lets decompose() and orthogonalize() work on it at all.
    a.append(_axis("au63", "look up", "AU63", "eyes", "C",
                   [(11, 1, -0.0005), (15, 1, -0.0005),
                    (13, 1, -0.00015), (16, 1, -0.00015)],
                   gain=FULL_GAZE, lo=0.0, hi=1.0))
    a.append(_axis("au64", "look down", "AU64", "eyes", "C",
                   [(11, 1, 0.0005), (15, 1, 0.0005),
                    (13, 1, 0.00015), (16, 1, 0.00015)],
                   gain=FULL_GAZE, lo=0.0, hi=1.0))

    # Brows ---------------------------------------------------------------
    # Keypoints 1 and 2 take opposite signs on the same gesture, so each side
    # keeps its own sign rather than being normalised to look consistent.
    a.append(_axis("au1_2_L", "raise", "AU1+AU2", "brows", "L",
                   [(1, 1, 0.001)], gain=FULL_BROW_UP, lo=-0.5, hi=1.0))
    a.append(_axis("au1_2_R", "raise", "AU1+AU2", "brows", "R",
                   [(2, 1, -0.001)], gain=FULL_BROW_UP, lo=-0.5, hi=1.0))
    a.append(_axis("au4_L", "furrow", "AU4", "brows", "L",
                   [(1, 0, 0.001), (1, 1, -0.0003)],
                   gain=FULL_BROW_DOWN, lo=0.0, hi=1.0))
    a.append(_axis("au4_R", "furrow", "AU4", "brows", "R",
                   [(2, 0, -0.001), (2, 1, 0.0003)],
                   gain=FULL_BROW_DOWN, lo=0.0, hi=1.0))

    return a


DEFAULT_ORDER = ("head", "mouth", "eyes", "brows", "custom")


def by_name(axes) -> dict:
    return {a.name: a for a in axes}


# --- composition -----------------------------------------------------------

def compose(weights: dict, axes=None):
    """weights -> (exp (1, 21, 3) float32, rot (3,) float32).

    Linear and additive, which is the whole reason presets can be blended:
    `compose(a) + compose(b) == compose(a + b)`.
    """
    axes = axes if axes is not None else default_axes()
    idx = by_name(axes)
    exp = np.zeros((NUM_KP, 3), np.float32)
    rot = np.zeros(3, np.float32)
    for name, w in weights.items():
        ax = idx.get(name)
        if ax is None or not w:
            continue
        exp += ax.exp * float(w)
        rot += ax.rot * float(w)
    return exp[None], rot


def matrix(axes) -> np.ndarray:
    """(N, 63) — one row per axis."""
    if not axes:
        return np.zeros((0, DIM), np.float32)
    return np.stack([a.flat() for a in axes]).astype(np.float32)


def decompose(exp: np.ndarray, axes=None) -> dict:
    """Read an existing expression as weights on the axes.

    Least squares rather than a dot product, because the axes are not
    orthogonal: projecting onto each one separately would double-count
    everything they share. This is what lets the rig show meaningful handle
    positions for an expression that came from a photo or a preset.
    """
    axes = axes if axes is not None else default_axes()
    if not axes:
        return {}
    a = matrix(axes)
    w, *_ = np.linalg.lstsq(a.T, np.asarray(exp, np.float32).reshape(-1), rcond=None)
    return {ax.name: float(v) for ax, v in zip(axes, w)}


def orthogonalize(axes, order=DEFAULT_ORDER):
    """Gram-Schmidt, so moving one control does not undo another.

    Ordered by group and stable within it, because the result depends on the
    order: earlier axes keep their meaning, later ones lose whatever the
    earlier ones already covered. Head and mouth go first — they carry the
    largest, most recognisable motion, so they are the ones worth keeping pure.

    Axes that are entirely explained by earlier ones collapse to zero and are
    dropped: keeping a null direction would give the UI a handle that does
    nothing. `rot` is left alone, since the head coupling does not live in the
    63-dimensional expression space.
    """
    rank = {g: i for i, g in enumerate(order)}
    ranked = sorted(enumerate(axes), key=lambda p: (rank.get(p[1].group, len(order)), p[0]))

    basis, out = [], []
    for _, ax in ranked:
        v = ax.flat().astype(np.float64).copy()
        for b in basis:
            v -= np.dot(v, b) * b
        n = np.linalg.norm(v)
        if n < 1e-9:
            continue
        scale = np.linalg.norm(ax.flat())      # keep the original magnitude, so
        unit = v / n                           # the slider range still means
        basis.append(unit)                     # what it meant before
        out.append(replace(ax, exp=(unit * scale).reshape(NUM_KP, 3).astype(np.float32)))
    return out


# --- symmetry --------------------------------------------------------------

def mirror_of(name: str):
    """`au12_L` <-> `au12_R`, or None for a centre axis."""
    if name.endswith("_L"):
        return name[:-2] + "_R"
    if name.endswith("_R"):
        return name[:-2] + "_L"
    return None


def apply_mirror(weights: dict, changed: str) -> dict:
    """Copy a weight onto its opposite side.

    Note what is *not* here: no sign flip. The handles work in face-local
    coordinates — inward and outward, not screen x — so mirroring is a plain
    copy. Negating x is the obvious implementation and it is wrong: it turns
    "furrow both brows" into one brow furrowing while the other spreads.
    """
    other = mirror_of(changed)
    if other is not None and changed in weights:
        weights = dict(weights)
        weights[other] = weights[changed]
    return weights


# --- capture ---------------------------------------------------------------

def capture_axis(neutral: np.ndarray, expr: np.ndarray, name: str, label: str,
                 au: str = "", group: str = "custom", side: str = "C",
                 normalize: bool = True) -> Axis:
    """Record a new axis from a neutral photo and an expressive one.

    The difference of the two latents *is* the direction; there is nothing to
    train. Normalising to the median magnitude of the built-in axes means a new
    axis arrives with a slider range that feels like the others, instead of
    being ten times hotter or colder depending on how hard the model happened
    to pull the face in the reference photo.
    """
    d = (np.asarray(expr, np.float32).reshape(NUM_KP, 3)
         - np.asarray(neutral, np.float32).reshape(NUM_KP, 3))
    if normalize:
        n = np.linalg.norm(d)
        if n > 1e-12:
            d = d / n * _reference_scale()
    return Axis(name=name, label=label, au=au, group=group, side=side, exp=d)


def _reference_scale() -> float:
    return float(np.median([np.linalg.norm(a.flat()) for a in default_axes()]))


# --- presets ---------------------------------------------------------------
#
# The canonical EMFACS combinations, not invented ones. Written as action
# units, so a preset stays honest: it says which units it needs, and if we have
# no axis for one yet it is reported rather than silently approximated. Record
# that axis from a pair of photos and every preset that names it improves.

# Each preset starts from its EMFACS action-unit combination, then fills the
# units this axis basis cannot express with hand-tuned weights over the axes
# it does have (keys that name an axis directly are applied verbatim, signs
# included). The pure recipes looked right on paper and did nearly nothing on
# a face: "disgusted" is AU9+AU15+AU16 and the legacy basis covers none of the
# three. Approximating beats a dial that moves nothing.
#   AU5  (upper lid raiser)  ~ negative au45 (lids wide)
#   AU7  (lid tightener)     ~ positive au45 (squint)
#   AU15 (corner depressor)  ~ negative au12 (frown)
#   AU23 (lip tightener)     ~ au18 pucker, faintly
#   AU9/AU16                 ~ sneer: furrow + squint + a curled lip
# The canonical AU keys stay: they keep `missing` honest and let a captured
# axis (e.g. a recorded AU6) complete the recipe the moment it exists. The
# axis-name keys are the approximations that stand in meanwhile.
PRESETS = {
    "happy":      {"AU6": 1.0, "AU12": 1.0,
                   "au45_L": 0.18, "au45_R": 0.18},   # AU6 cheek raiser ~ squint
    "surprised":  {"AU1": 0.9, "AU2": 0.9, "AU5": 1.0, "AU26": 0.5,
                   "au45_L": -0.22, "au45_R": -0.22}, # AU5 ~ eyes wide
    "sad":        {"AU1": 0.95, "AU4": 1.0, "AU15": 1.0,
                   "au12": -0.23,                     # AU15 ~ frown, full range
                   "au45_L": 0.4, "au45_R": 0.4,      # heavy lids
                   "au64": 0.9},                      # gaze drops — direction, but it sells it
    "angry":      {"AU4": 1.0, "AU5": 0.4, "AU7": 1.0, "AU23": 1.0,
                   "au1_2_L": -0.45, "au1_2_R": -0.45,  # whole brow pressed down
                   "au45_L": 0.45, "au45_R": 0.45,    # AU7 ~ lid tighten
                   "au12": -0.23,                     # frown, full range
                   "au18": 0.35},                     # AU23 ~ pressed lips
    "afraid":     {"AU1": 0.8, "AU2": 0.8, "AU4": 0.55, "AU5": 1.0,
                   "AU20": 0.8, "AU26": 0.35,
                   "au45_L": -0.18, "au45_R": -0.18}, # AU5 ~ eyes wide
    "disgusted":  {"AU9": 1.0, "AU15": 1.0, "AU16": 1.0,
                   "AU4": 0.8,                        # AU9 ~ the brow half of a sneer
                   "au45_L": 0.35, "au45_R": 0.35,
                   "au12": -0.18, "au18": 0.4},       # AU15/AU16 ~ curled, tightened lip
}


def axes_for_au(au: str, axes) -> list:
    """Every axis whose action unit list contains `au`."""
    return [a for a in axes if au in [p.strip() for p in a.au.split("+") if p.strip()]]


def preset_weights(preset: str, intensity: float = 1.0, axes=None):
    """(weights, missing) — the action units we have, and the ones we do not.

    Both sides of a paired axis get the same weight: an EMFACS unit describes a
    muscle, and people have two of most muscles.

    An axis covering several units (`au1_2_L` is inner *and* outer brow raiser,
    because upstream never separated them) takes the strongest of them rather
    than their sum. Summing would make "surprised", which asks for AU1 and AU2
    both, drive that one axis to double what either unit called for — the brow
    would go twice as high for a preset that only ever asked for one raise.
    """
    axes = axes if axes is not None else default_axes()
    spec = PRESETS.get(preset)
    if spec is None:
        raise KeyError("Unknown preset: {}".format(preset))
    idx = by_name(axes)
    weights, missing = {}, []
    for au, w in spec.items():
        # A key naming an axis directly is a hand-tuned fill-in for a unit the
        # basis cannot express; it is applied verbatim, sign included.
        if au in idx:
            weights[au] = weights.get(au, 0.0) + w * intensity
            continue
        found = axes_for_au(au, axes)
        if not found:
            missing.append(au)
            continue
        for ax in found:
            weights[ax.name] = max(weights.get(ax.name, 0.0), w * intensity)
    return weights, missing


# --- rig state -------------------------------------------------------------

STATE_V = 1
# `src_ratio` and `stitching` are not here on purpose: they are node widgets,
# and a value that lives in two places drifts apart in one of them.
STATE_DEFAULTS = {
    "rot": [0.0, 0.0, 0.0], "scale": 0.0, "trans": [0.0, 0.0],
    "ortho": False, "mirror": True,
}


def blend(weights: dict, presets: dict, axes=None) -> dict:
    """Manual handle weights plus the preset dials, added together.

    Presets are a layer, not a button that overwrites the rig. Pulling
    "surprised" to 0.4 leaves every handle exactly where it was and adds four
    tenths of a surprise on top, which is how you get "her own smile, but a bit
    afraid" — and how you take it back off again by pulling the dial down.
    """
    axes = axes if axes is not None else default_axes()
    out = dict(weights or {})
    for name, intensity in (presets or {}).items():
        if not intensity or name not in PRESETS:
            continue
        for k, v in preset_weights(name, float(intensity), axes)[0].items():
            out[k] = out.get(k, 0.0) + v

    # Clamp to each axis's own range, and mean it.
    #
    # 1.0 is defined as the full gesture — an eye completely shut, a jaw at the
    # end of its travel. Beyond that the warping field is being asked for
    # deformations no face makes, and it obliges: teeth smear, cheeks collapse.
    # The editor already clamps what a handle can be dragged to; this is the
    # same limit applied where the layers meet, because three preset dials at
    # once could otherwise stack a handle to 4.0 without anything saying no.
    idx = by_name(axes)
    return {k: (max(idx[k].lo, min(idx[k].hi, v)) if k in idx else v)
            for k, v in out.items()}


def serialise(state: dict) -> str:
    """Versioned, and optional fields only when they differ from the default.

    Same discipline as `splineEditor.serialise` — it is what lets an old
    workflow load unchanged after new fields appear.
    """
    out = {"v": STATE_V, "w": {k: round(float(v), 5)
                               for k, v in state.get("w", {}).items() if v}}
    presets = {k: round(float(v), 5) for k, v in (state.get("p") or {}).items() if v}
    if presets:
        out["p"] = presets
    for k, dflt in STATE_DEFAULTS.items():
        v = state.get(k, dflt)
        if v != dflt:
            out[k] = v
    return json.dumps(out, separators=(",", ":"))


def deserialise(text: str) -> dict:
    if not text:
        return dict(STATE_DEFAULTS, w={}, p={})
    try:
        raw = json.loads(text)
    except ValueError:
        # The rig is an editable STRING widget. Somebody typing into it should
        # get an empty pose, not a node that refuses to run.
        return dict(STATE_DEFAULTS, w={}, p={})
    state = dict(STATE_DEFAULTS)
    state["w"] = {k: float(v) for k, v in raw.get("w", {}).items()}
    state["p"] = {k: float(v) for k, v in (raw.get("p") or {}).items()}
    for k in STATE_DEFAULTS:
        if k in raw:
            state[k] = raw[k]
    return state


# --- persistence -----------------------------------------------------------

def library_dir() -> str:
    try:
        import folder_paths  # noqa: PLC0415
        root = osp.join(folder_paths.models_dir, "liveportrait")
    except Exception:
        root = osp.join(osp.dirname(osp.abspath(__file__)), "models", "liveportrait")
    return osp.join(root, "nkd_axes")


def save_axis(ax: Axis, directory=None) -> str:
    directory = directory or library_dir()
    os.makedirs(directory, exist_ok=True)
    path = osp.join(directory, "{}.json".format(ax.name))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"v": STATE_V, "name": ax.name, "label": ax.label, "au": ax.au,
                   "group": ax.group, "side": ax.side, "lo": ax.lo, "hi": ax.hi,
                   "exp": ax.exp.reshape(-1).round(8).tolist(),
                   "rot": ax.rot.round(8).tolist()}, fh)
    return path


def load_axes(directory=None) -> list:
    """The built-ins plus anything recorded, with recorded axes winning by name."""
    axes = default_axes()
    directory = directory or library_dir()
    if not osp.isdir(directory):
        return axes
    idx = {a.name: i for i, a in enumerate(axes)}
    for fn in sorted(os.listdir(directory)):
        if not fn.endswith(".json"):
            continue
        with open(osp.join(directory, fn), "r", encoding="utf-8") as fh:
            d = json.load(fh)
        ax = Axis(name=d["name"], label=d.get("label", d["name"]), au=d.get("au", ""),
                  group=d.get("group", "custom"), side=d.get("side", "C"),
                  exp=np.array(d["exp"], np.float32).reshape(NUM_KP, 3),
                  rot=np.array(d.get("rot", [0, 0, 0]), np.float32),
                  lo=d.get("lo", -1.0), hi=d.get("hi", 1.0))
        if ax.name in idx:
            axes[idx[ax.name]] = ax
        else:
            idx[ax.name] = len(axes)
            axes.append(ax)
    return axes
