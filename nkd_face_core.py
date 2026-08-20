# coding: utf-8
"""
The light half of the face pipeline: find a face, straighten it, mask it.

😺NKD Face Rig needs the whole LivePortrait stack — five checkpoints and a GPU —
because it *renders* a new expression. Cropping and masking need none of that:
one 10 MB ONNX landmark model answers where the face is, and everything after
that is geometry. So the landmark runner, the weight plumbing and the landmark
atlas live here, and `nkd_face_rig_engine` imports them. The dependency runs one
way only.

Two things are deliberately not models:

* **The alignment.** LivePortrait's `crop_image` already measures the roll from
  the eye-to-lip axis and folds it into the affine, so an upright crop is a
  keyword argument, not an algorithm. What comes back with it is `M_c2o`, which
  is the whole of the paste-back.
* **The mask.** With 203 landmarks on the face the outline is known, so the
  face mask is a filled polygon rather than a segmentation network. That is not
  only cheaper — it is the only route that stays commercially usable. The
  BiSeNet weights every other pack uses are trained on CelebAMask-HQ, which is
  licensed "for non-commercial research purposes only" and forbids exploiting
  "any portion of derived data". Same clause that kept InsightFace out of the
  rig.
"""
from __future__ import annotations

import os.path as osp
import threading

import cv2
import numpy as np
import torch

from . import blur_core
from .nkd_liveportrait.utils.crop import (
    _transform_pts,
    crop_image,
    crop_image_by_bbox,
    parse_pt2_from_pt203,
)

HF_REPO = "KlingTeam/LivePortrait"

# Only what a human portrait needs. The animals models and XPose (435 MB on its
# own) are not downloaded, and neither is InsightFace — see the note above.
WEIGHTS = {
    "appearance_feature_extractor": "liveportrait/base_models/appearance_feature_extractor.pth",
    "motion_extractor": "liveportrait/base_models/motion_extractor.pth",
    "warping_module": "liveportrait/base_models/warping_module.pth",
    "spade_generator": "liveportrait/base_models/spade_generator.pth",
    "stitching_retargeting_module": "liveportrait/retargeting_models/stitching_retargeting_module.pth",
    "landmark": "liveportrait/landmark.onnx",
}

# What the crop and mask nodes need on their own: the landmark model, nothing
# else. Someone who only ever crops faces downloads 10 MB, not 500.
LIGHT_WEIGHTS = ("landmark",)

_HERE = osp.dirname(osp.abspath(__file__))


def model_dir() -> str:
    """`ComfyUI/models/liveportrait`, or a local folder when run outside ComfyUI."""
    try:
        import folder_paths  # noqa: PLC0415 — absent in unit tests
        return osp.join(folder_paths.models_dir, "liveportrait")
    except Exception:
        return osp.join(_HERE, "models", "liveportrait")


def weight_path(key: str) -> str:
    return osp.join(model_dir(), WEIGHTS[key])


def missing_weights(keys=None) -> list:
    return [k for k in (keys or WEIGHTS) if not osp.exists(weight_path(k))]


def download_weights(progress=None, keys=None) -> None:
    """Fetch whatever is missing from Hugging Face into `models/liveportrait`.

    Raises with the exact folder and the manual command when the network is
    not available — a silent download failure leaves people guessing at a
    path, and that guess is a recurring support ticket across the ecosystem.
    """
    missing = missing_weights(keys)
    if not missing:
        return
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:
        raise RuntimeError(
            "huggingface_hub is required to download the LivePortrait weights"
        ) from exc

    root = model_dir()
    for key in missing:
        if progress:
            progress(f"downloading {WEIGHTS[key]}")
        try:
            hf_hub_download(repo_id=HF_REPO, filename=WEIGHTS[key], local_dir=root)
        except Exception as exc:
            raise RuntimeError(
                "Could not download {} from {}: {}\n"
                "Place the weights manually under {}, keeping the same layout, with:\n"
                '  huggingface-cli download {} --local-dir "{}" --include "liveportrait/*"'
                .format(WEIGHTS[key], HF_REPO, exc, root, HF_REPO, root)
            ) from exc


# ---------------------------------------------------------------------------
# The landmark atlas
# ---------------------------------------------------------------------------

# Where each control hangs, as indices into the 203 landmarks.
#
# LivePortrait publishes no map of these either, so `tools/kp_atlas.py`'s
# sibling walk found them by drawing them numbered on a face: eyes take 24
# points each (0-23 and 24-47), the mouth runs 48-107 with the corners at 48
# and 66 and the inner lip at 90/102, the outline is 108-143 with the chin at
# 126, the brows are 144-164 and 165-184, and the nose finishes at 185-202.
# Two of these were already known from upstream's own `retargeting_utils`,
# which measures eye opening between 6/18 and 30/42 — that agrees, which is
# the cheapest confirmation available that the rest is read right.
#
# "L" is the left of the picture, which is the side the handle sits on and the
# side the matching `_L` axis was measured to move.
_ANCHORS = {
    "brow_L": list(range(144, 165)),
    "brow_R": list(range(165, 185)),
    "lid_L": [6],
    "lid_R": [30],
    "gaze": list(range(0, 48)),
    "corner_L": [48],
    "corner_R": [66],
    "lips": [102],
    "jaw": [126],
}


# The outline each control is *shaped* like. A control that looks like the
# eyebrow it moves reads at a glance; a circle around the eyebrow reads as a
# circle. Since the landmarks are already here, the shape can be the person's
# own eyebrow rather than a symbol standing in for one.
# Ranges confirmed by drawing them (see the outline sweep in tools/): each one
# closes on itself without a stray point cutting across the face. 145 rather
# than 144 for the left brow — 144 sits well off the brow and closing through
# it drew a line across the whole picture.
_OUTLINES = {
    "brow_L": list(range(145, 165)),
    "brow_R": list(range(165, 185)),
    "eye_L": list(range(0, 24)),
    "eye_R": list(range(24, 48)),
    "lips": list(range(48, 72)),
}
# Every other point, which is plenty for a control outline and keeps the header
# under a kilobyte.
_OUTLINE_STEP = 2

_BROWS = _OUTLINES["brow_L"] + _OUTLINES["brow_R"]


# ---------------------------------------------------------------------------
# Landmarks
# ---------------------------------------------------------------------------

class FaceLandmarks:
    """The ONNX landmark model, on its own. Lazily loaded singleton.

    Held apart from `Engine` so that cropping and masking never pay for the
    generator: this loads one 10 MB session, `Engine` loads half a gigabyte of
    torch checkpoints.
    """

    _lock = threading.Lock()
    _inst = None

    def __init__(self):
        download_weights(keys=LIGHT_WEIGHTS)
        # Ask for CUDA only when onnxruntime actually has it. A plain
        # `pip install onnxruntime` is the CPU build, and asking it for a
        # provider it does not have is a wall of warnings and, on some
        # versions, a hard failure. On CPU the landmark model still runs; it is
        # only used when preparing a photo and when a drag ends.
        # Imported here, not at module load: the geometry half of this file has
        # no use for onnxruntime, and keeping it out means the crop and mask
        # code — and its tests — import on a machine that has neither it nor
        # the weights.
        import onnxruntime  # noqa: PLC0415
        from .nkd_liveportrait.utils.human_landmark_runner import LandmarkRunner  # noqa: PLC0415

        cuda = "CUDAExecutionProvider" in onnxruntime.get_available_providers()
        if cuda:
            try:
                cuda = torch.cuda.is_available()
            except Exception:
                cuda = False
        self.runner = LandmarkRunner(ckpt_path=weight_path("landmark"),
                                     onnx_provider="cuda" if cuda else "cpu")

    @classmethod
    def get(cls) -> "FaceLandmarks":
        with cls._lock:
            if cls._inst is None:
                cls._inst = cls()
            return cls._inst

    @classmethod
    def release(cls) -> None:
        with cls._lock:
            cls._inst = None

    def run(self, rgb: np.ndarray, seed=None) -> np.ndarray:
        return self.runner.run(rgb) if seed is None else self.runner.run(rgb, seed)

    def _coarse(self, rgb: np.ndarray) -> np.ndarray:
        """A first guess at the landmarks, on a letterboxed square.

        Upstream's no-seed path resizes the whole picture to 224x224 and then
        undoes it with a single uniform scale. Those two do not match unless
        the picture was already square: squashing 736x1104 into a square
        compresses x and y by different factors, and multiplying both back by
        `max(h, w) / 224` leaves x out by 1.5x. On the square sample image it
        looks perfect, which is exactly why it survived to here — the drift
        only shows up on portraits, and portraits are the whole point.

        Padding to a square first makes the uniform scale honest. Nothing is
        distorted, so undoing it is just a translation away.
        """
        h, w = rgb.shape[:2]
        side = max(h, w)
        if h == w:
            return self.run(rgb)
        square = np.zeros((side, side, 3), rgb.dtype)
        oy, ox = (side - h) // 2, (side - w) // 2
        square[oy:oy + h, ox:ox + w] = rgb
        lmk = self.run(square)
        lmk[:, 0] -= ox
        lmk[:, 1] -= oy
        return lmk

    def locate(self, rgb: np.ndarray, crop_factor: float = 1.7, rounds: int = 5,
               box=None):
        """(203 landmarks in picture coordinates, settled).

        Upstream seeds its landmark model with an InsightFace bounding box. We
        do not want InsightFace (non-commercial clause) and MediaPipe turned out
        to be no bargain either: 0.10.33 dropped the `mp.solutions` API
        entirely, and the replacement wants its own `.task` download.

        Without a `box` the crop bootstraps itself: a coarse pass guesses where
        the face is, then each round re-crops around that guess and measures
        again, so every round frames the face better than the last. That is
        enough for a portrait, where the head already fills much of the frame.
        It is *not* enough when the face is a small part of a wide picture —
        the coarse pass has nothing to lock onto and the rounds wander. Pass a
        box from `FaceDetector` for those, which is what the node does.

        `settled` is false when it never stopped moving. That is the honest
        answer for a picture with no face in it: the model will still return
        203 points, confidently, in a ring around nothing.
        """
        if box is None:
            lmk = self.run(rgb, self._coarse(rgb))
        else:
            crop = crop_image_by_bbox(rgb, square_box(box, crop_factor), dsize=512)
            lmk = _transform_pts(self.run(crop["img_crop"]), crop["M_c2o"][:2])

        settled = False
        for _ in range(rounds):
            crop = crop_image(rgb, lmk, dsize=512, scale=crop_factor, vy_ratio=-0.125)
            seed = _transform_pts(lmk, crop["M_o2c"][:2])
            back = _transform_pts(self.run(crop["img_crop"], seed),
                                  crop["M_c2o"][:2])
            # Judged against the size of the face, not in absolute pixels: one
            # pixel is a rounding error on a 2048 px portrait and a real miss on
            # a small one. Measured convergence on real portraits lands under
            # 0.002 within four rounds; anything still wandering above this
            # after five is not converging at all.
            span = float(np.linalg.norm(lmk.max(0) - lmk.min(0))) or 1.0
            moved = float(np.abs(back - lmk).max())
            lmk = back
            if moved / span < 0.008:
                settled = True
                break
        if not np.isfinite(lmk).all():
            raise RuntimeError("No face found in the source image")
        return lmk, settled


def square_box(box, factor: float = 1.0):
    """A box grown by `factor` and squared off, which is what the crops want."""
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    half = max(x2 - x1, y2 - y1) * factor / 2.0
    return (cx - half, cy - half, cx + half, cy + half)


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

# YuNet, from OpenCV's own model zoo. 232 KB, MIT, and already implemented
# inside cv2 — so "add a face detector" costs one small download and no new
# dependency. The alternatives all cost more than they are worth here:
# InsightFace and the CelebA-trained parsers carry non-commercial clauses,
# YOLOv8-face drags in AGPL ultralytics, and cv2's old Haar cascades were
# dropped outright in OpenCV 5.
YUNET_REPO = "opencv/face_detection_yunet"
YUNET_FILE = "face_detection_yunet_2023mar.onnx"

# Above this, the picture is scaled down before detection. YuNet finds faces
# down to a few dozen pixels, so the resolution is not what it needs, and a
# 6000 px photo otherwise spends most of the node's time here.
_DETECT_MAX_SIDE = 1920


class FaceDetector:
    """YuNet, lazily loaded. Returns boxes; the landmarks come after."""

    _lock = threading.Lock()
    _inst = None

    def __init__(self):
        if not hasattr(cv2, "FaceDetectorYN"):
            raise RuntimeError("this OpenCV build has no FaceDetectorYN")
        from huggingface_hub import hf_hub_download  # noqa: PLC0415
        try:
            import folder_paths  # noqa: PLC0415
            root = osp.join(folder_paths.models_dir, "facedetection")
        except Exception:
            root = osp.join(_HERE, "models", "facedetection")
        path = osp.join(root, YUNET_FILE)
        if not osp.exists(path):
            path = hf_hub_download(repo_id=YUNET_REPO, filename=YUNET_FILE,
                                   local_dir=root)
        self.net = cv2.FaceDetectorYN.create(path, "", (320, 320))

    @classmethod
    def get(cls) -> "FaceDetector":
        with cls._lock:
            if cls._inst is None:
                cls._inst = cls()
            return cls._inst

    @classmethod
    def release(cls) -> None:
        with cls._lock:
            cls._inst = None

    def detect(self, rgb: np.ndarray, confidence: float = 0.7) -> list:
        """Face boxes (x1, y1, x2, y2) in picture coordinates, surest first.

        The detector's own order, which is by score. Sorting by size instead
        was tried and is worse: on a bare-chested figure YuNet reads the
        abdominal muscles as a face at 0.64 and the box is *larger* than the
        real head at 0.93, so "biggest" hands you the torso. Confidence is the
        thing that separates them, so confidence is the order — and 0.7 is the
        default because it drops that kind of answer outright.
        """
        h, w = rgb.shape[:2]
        s = min(1.0, _DETECT_MAX_SIDE / float(max(h, w)))
        small = cv2.resize(rgb, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)             if s < 1.0 else rgb
        self.net.setInputSize((small.shape[1], small.shape[0]))
        self.net.setScoreThreshold(float(confidence))
        found = self.net.detect(cv2.cvtColor(small, cv2.COLOR_RGB2BGR))[1]
        if found is None:
            return []
        return [(float(x), float(y), float(x + bw), float(y + bh))
                for x, y, bw, bh in found[:, :4] / s]


def yolo_boxes(rgb: np.ndarray, confidence: float = 0.7) -> list:
    """The ecosystem's YOLOv8 face model, or `[]` when ultralytics is absent.

    Never installed by us — AGPL has to be the user's own choice — and never
    the first thing asked, because a detector that only some machines have
    would make the same graph crop differently on each of them. It is here as
    a second opinion for the pictures YuNet gives up on, and as the one
    implementation of a loader the rig used to carry its own copy of.
    """
    try:
        from ultralytics import YOLO  # noqa: PLC0415 — optional
    except ImportError:
        return []
    global _YOLO
    if _YOLO is None:
        path = osp.join(model_dir(), "..", "ultralytics", "face_yolov8n.pt")
        if not osp.exists(path):
            from huggingface_hub import hf_hub_download  # noqa: PLC0415
            path = hf_hub_download(repo_id="Bingsu/adetailer",
                                   filename="face_yolov8n.pt")
        _YOLO = YOLO(path)
    found = _YOLO(rgb, conf=confidence, device="", verbose=False)[0]
    return [tuple(float(v) for v in b) for b in found.boxes.xyxy.cpu().numpy()]


_YOLO = None


def face_boxes(rgb: np.ndarray, confidence: float = 0.7,
               second_opinion: bool = True) -> list:
    """Where the faces are, surest first — or `[]` when nobody can say.

    Empty is not the same as "no faces": an OpenCV without YuNet or no network
    on first run land here too. The caller falls back to the self-bootstrapping
    walk, which still handles the portrait case the rig was built for.

    YuNet answers first on every machine, so the same picture crops the same
    way everywhere. Only once it has given up entirely does ultralytics get
    asked, and only if it happens to be installed — a failed answer is the one
    place where "better on some machines" beats "the same on all of them".
    Pass `second_opinion=False` from a caller that has already tried YOLO.
    """
    try:
        det = FaceDetector.get()
    except Exception:
        det = None
    if det is not None:
        boxes = det.detect(rgb, confidence)
        if not boxes:
            # Nothing clears the bar. A doubtful box still beats no box at all:
            # it only has to be close enough for the landmark walk to take over,
            # and the walk on its own is what fails on a small face.
            boxes = det.detect(rgb, 0.3)
        if boxes:
            return boxes
    return yolo_boxes(rgb, 0.5) if second_opinion else []

# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------

def roll_degrees(lmk: np.ndarray) -> float:
    """How far the head is tilted in the picture plane, positive clockwise.

    Measured off the same axis the alignment uses — eye centre to lip centre —
    so the number reported is exactly the rotation the crop took out.
    """
    pt2 = parse_pt2_from_pt203(lmk)
    dx, dy = pt2[1] - pt2[0]                 # eye centre -> lip centre, "down"
    # y is down, so a head tilted clockwise swings that axis to (-sin, cos):
    # negating x is what makes clockwise come out positive.
    return float(np.degrees(np.arctan2(-dx, dy)))


def align(rgb: np.ndarray, lmk: np.ndarray, size: int = 512,
          padding: float = 1.7, upright: bool = True, offset: float = -0.125) -> dict:
    """A square crop of the face at `size`, optionally rotated upright.

    Everything here is `crop_image` with its arguments spelled out; the value
    added is naming them. `padding` is how much wider than the face the square
    is (1.0 is the face alone, 1.7 leaves room for hair and chin), and `offset`
    slides the square up the face's own axis so the forehead is not cut — the
    negative default is upstream's, and it is a fraction of the crop, not pixels.

    Note this is *not* the crop 😺NKD Face Rig uses. The rig is pinned to the
    ecosystem's axis-aligned YOLO crop for expression parity; here the whole
    point is to straighten the head, so the rotation stays in.
    """
    out = crop_image(rgb, lmk, dsize=int(size), scale=float(padding),
                     vy_ratio=float(offset), flag_do_rot=bool(upright))
    return {
        "crop": out["img_crop"],
        "lmk_crop": out["pt_crop"],
        "M_o2c": out["M_o2c"],
        "M_c2o": out["M_c2o"],
        "roll": roll_degrees(lmk) if upright else 0.0,
    }


def warp_back(crop: np.ndarray, M_c2o: np.ndarray, width: int, height: int,
              interp=cv2.INTER_LINEAR) -> np.ndarray:
    """Undo `align` — the crop, put back where it came from, on black."""
    return cv2.warpAffine(crop, np.asarray(M_c2o, np.float32)[:2], (width, height),
                          flags=interp, borderMode=cv2.BORDER_CONSTANT)


# ---------------------------------------------------------------------------
# Masks
# ---------------------------------------------------------------------------

# What each choice fills and what it cuts out of it. The cut-outs are `sub`
# shapes rather than a winding rule, which is what lets each one keep its own
# soft edge — see `blur_core.rasterize`.
REGIONS = {
    "face": ("hull", ()),
    "face without features": ("hull", ("eye_L", "eye_R", "lips")),
    "skin": ("hull", ("eye_L", "eye_R", "lips", "brow_L", "brow_R")),
    "features": (None, ()),
    "none": (None, ()),
}
REGION_NAMES = list(REGIONS)


def _forehead(lmk: np.ndarray, reach: float) -> np.ndarray:
    """The brow points pushed up the face's own axis, standing in for a hairline.

    The 203 landmarks stop at the eyebrow, so everything above it is an
    estimate — which is why `reach` is a knob and not a constant. The unit it
    moves in is the eye-to-lip distance, because on a face those two spans are
    close to equal (the classical thirds), so `reach = 1` lands near the
    hairline on most people and the dial is a correction, not a search.
    """
    if reach <= 0:
        return np.empty((0, 2), lmk.dtype)
    pt2 = parse_pt2_from_pt203(lmk)
    up = pt2[0] - pt2[1]                     # lip centre -> eye centre
    return lmk[_BROWS] + up * float(reach)


def face_polygons(lmk: np.ndarray, region: str = "face",
                  forehead: float = 1.0) -> list:
    """`blur_core.rasterize` shapes for one face, in pixel coordinates.

    The face itself is a convex hull rather than the outline ring: a hull is
    indifferent to the order the points came in, and a face is convex enough
    that the difference is not visible. The features are their own rings, which
    are known to close cleanly.
    """
    fill, cuts = REGIONS.get(region, REGIONS["face"])
    shapes = []
    if fill == "hull":
        pts = np.vstack([lmk[:, :2], _forehead(lmk, forehead)]).astype(np.float32)
        hull = cv2.convexHull(pts).reshape(-1, 2)
        shapes.append({"poly": hull, "op": "add"})
    if region == "features":
        for name in ("eye_L", "eye_R", "lips", "brow_L", "brow_R"):
            shapes.append({"poly": lmk[_OUTLINES[name], :2], "op": "add"})
    for name in cuts:
        shapes.append({"poly": lmk[_OUTLINES[name], :2], "op": "sub"})
    return shapes


def region_mask(lmk: np.ndarray, width: int, height: int, region: str = "face",
                forehead: float = 1.0) -> torch.Tensor:
    """[H, W] float coverage mask for the face, from the landmarks alone."""
    if region == "none":
        return torch.zeros(height, width, dtype=torch.float32)
    shapes = face_polygons(lmk, region, forehead)
    # rasterize normalises by the output size, so hand it fractions of one.
    # Lists, not arrays: it tests polygons with `poly or []`, which an ndarray
    # cannot answer.
    scale = np.array([1.0 / max(width, 1), 1.0 / max(height, 1)], np.float64)
    for s in shapes:
        s["poly"] = (np.asarray(s["poly"], np.float64) * scale).tolist()
    return blur_core.rasterize(shapes, width, height)


def refine(rgb: np.ndarray, mask: torch.Tensor, band: float = 0.04,
           iterations: int = 3) -> torch.Tensor:
    """Pull the mask's edge onto the real one with a GrabCut pass.

    The polygon is right about where the face is and naive about where it ends:
    it cuts straight across hair and through anything held in front of the
    chin. Seeding GrabCut with it — sure inside, sure outside, undecided in a
    band around the edge — lets the picture itself decide the last few pixels.

    ponytail: this fixes the edge, not occlusion. A hand across the face is
    still inside the hull, and no amount of colour modelling reads it as "not
    face". The upgrade if that ever matters is a small ONNX segmenter with a
    licence we can actually ship (MediaPipe's 447 KB selfie multiclass model is
    Apache-2.0); it is not here because nothing so far has needed it.
    """
    m = mask.detach().cpu().numpy()
    h, w = m.shape[-2:]
    hard = (m > 0.5).astype(np.uint8)
    if hard.sum() < 16 or hard.sum() > 0.98 * h * w:
        return mask                      # nothing to refine against
    k = max(3, int(band * min(h, w)) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    inner = cv2.erode(hard, kernel)
    outer = cv2.dilate(hard, kernel)

    gc = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    gc[outer > 0] = cv2.GC_PR_FGD
    gc[inner > 0] = cv2.GC_FGD
    gc[cv2.dilate(outer, kernel) == 0] = cv2.GC_BGD
    try:
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), gc, None,
                    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                    int(iterations), cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        # GrabCut gives up on a seed it cannot model (a flat colour field, a
        # band with no edge in it). The polygon was already a usable answer.
        return mask
    out = np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.float32)
    # Only the undecided band changes hands. Everywhere else keeps the value
    # the rasteriser drew, antialiasing included — GrabCut answers in hard 0/1
    # and letting it overwrite the whole mask would stair-step the outline.
    band_px = (outer > 0) & (inner == 0)
    res = m.copy()
    res[band_px] = out[band_px]
    # GrabCut decides pixel by pixel, so its outline arrives as a staircase.
    # Softening only inside the band takes the jaggies off without blurring the
    # edge the polygon already got right.
    res[band_px] = cv2.GaussianBlur(res, (0, 0), 1.2)[band_px]
    return torch.from_numpy(np.clip(res, 0.0, 1.0))
