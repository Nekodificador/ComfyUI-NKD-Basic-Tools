# coding: utf-8
"""
😺NKD Face Rig — the LivePortrait engine, on our own terms.

The engine is self-contained: LivePortrait is MIT, so we vendor it (see
`nkd_liveportrait/NOTICE`) and keep everything we add outside that directory.
No other custom node is imported or required.

Two deliberate departures from upstream:

* **An axis-aligned detector crop, not upstream's rotation-aligned one.** The
  contract of this node is that the same slider values keep giving the same
  picture as the expression workflows people already have, and the crop is
  where that is won or lost: the motion extractor's keypoints change with the
  framing it sees, so a differently aligned crop gives a visibly different
  render even with identical axes. `prepare` therefore uses the ecosystem's
  established geometry — YOLOv8 face bbox, square x crop_factor,
  axis-aligned, `int()` truncation and all — instead of upstream's
  rotation-aligned `crop_image`. InsightFace (upstream's detector) is out
  regardless: it carries a "non-commercial research purposes only" clause in
  LivePortrait's own LICENSE. When ultralytics is not installed the bbox
  comes from the self-bootstrapping landmark walk in `locate` — close, but
  not pixel-identical.
* **Our own weight loader.** Upstream's `load_model` calls `torch.load`
  without `weights_only`, which breaks on torch >= 2.6. Loading is a dozen
  lines, so we do it here rather than patch the vendor — a vendor you never
  edit is a vendor you can re-download instead of merge.

The split that makes the live preview possible: `PreparedSource` holds
everything that depends only on the photo (crop, landmarks, the appearance
volume f_s, the source keypoints), computed once. `render()` then does only
warp + decode, which the paper measures at 12.8 ms on a 4090. Dragging a
control re-runs `render()` and nothing else.
"""
from __future__ import annotations

import os.path as osp
import threading
from dataclasses import dataclass

import cv2
import numpy as np
import onnxruntime
import torch
import yaml

from .nkd_liveportrait.modules.appearance_feature_extractor import AppearanceFeatureExtractor
from .nkd_liveportrait.modules.motion_extractor import MotionExtractor
from .nkd_liveportrait.modules.spade_generator import SPADEDecoder
from .nkd_liveportrait.modules.stitching_retargeting_network import StitchingRetargetingNetwork
from .nkd_liveportrait.modules.warping_network import WarpingNetwork
from .nkd_liveportrait.utils.camera import get_rotation_matrix, headpose_pred_to_degree
from .nkd_liveportrait.utils.crop import _transform_pts, crop_image
from .nkd_liveportrait.utils.human_landmark_runner import LandmarkRunner

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

_HERE = osp.dirname(osp.abspath(__file__))
_CFG = osp.join(_HERE, "nkd_liveportrait", "config", "models.yaml")
_MASK = osp.join(_HERE, "nkd_liveportrait", "utils", "mask_template.png")


def model_dir() -> str:
    """`ComfyUI/models/liveportrait`, or a local folder when run outside ComfyUI."""
    try:
        import folder_paths  # noqa: PLC0415 — absent in unit tests
        return osp.join(folder_paths.models_dir, "liveportrait")
    except Exception:
        return osp.join(_HERE, "models", "liveportrait")


def weight_path(key: str) -> str:
    return osp.join(model_dir(), WEIGHTS[key])


def missing_weights() -> list:
    return [k for k in WEIGHTS if not osp.exists(weight_path(k))]


def download_weights(progress=None) -> None:
    """Fetch whatever is missing from Hugging Face into `models/liveportrait`.

    Raises with the exact folder and the manual command when the network is
    not available — a silent download failure leaves people guessing at a
    path, and that guess is a recurring support ticket across the ecosystem.
    """
    missing = missing_weights()
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


def _load_state(path: str):
    """`weights_only=True` first — these checkpoints are plain state dicts.

    The fallback is not paranoia: torch >= 2.6 flipped the default and strands
    any loader that never chose. If a checkpoint ever does carry a pickled
    object we still load it, rather than dying on an `Unsupported global`
    traceback the user cannot act on.
    """
    try:
        return torch.load(path, map_location="cpu", weights_only=True)
    except Exception:
        return torch.load(path, map_location="cpu", weights_only=False)


@dataclass
class PreparedSource:
    """Everything that depends only on the source photo. Computed once."""

    rgb: np.ndarray            # the original full-size image, uint8 HxWx3
    crop_512: np.ndarray       # the face crop resized to 512, the editor draws on it
    f_s: torch.Tensor          # appearance feature volume
    x_s: torch.Tensor          # source keypoints, already transformed
    kp_info: dict              # kp / exp / scale / t / pitch / yaw / roll
    crop_trans_m: np.ndarray   # 2x3 affine, 512-crop -> original
    mask_ori: np.ndarray       # feathered paste-back mask, full size, float 0..1
    lmk_crop: np.ndarray       # 203 landmarks in 512-crop coordinates
    crop_factor: float
    # False when the crop never converged — no face, or one too small to find.
    # The render still works; the rig handles are the part not to trust.
    settled: bool = True


class Engine:
    """Lazily loaded singleton. Held while the editor is open, freed on close."""

    _lock = threading.Lock()
    _inst = None

    def __init__(self, device=None):
        if device is None:
            try:
                import comfy.model_management as mm  # noqa: PLC0415
                device = str(mm.get_torch_device())
            except Exception:
                device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = torch.device(device)
        # Compatibility target: fp32 weights with the big modules under an fp16
        # autocast (`flag_use_half_precision`). Casting the weights to fp16
        # outright is faster but numerically different — parity says autocast.
        self.autocast = self.device.type == "cuda"

        download_weights()
        with open(_CFG, "r", encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)["model_params"]

        def build(cls, key, params_key):
            m = cls(**cfg[params_key]).to(self.device)
            m.load_state_dict(_load_state(weight_path(key)))
            return m.eval()

        self.appearance = build(AppearanceFeatureExtractor, "appearance_feature_extractor",
                                "appearance_feature_extractor_params")
        self.motion = build(MotionExtractor, "motion_extractor", "motion_extractor_params")
        self.warping = build(WarpingNetwork, "warping_module", "warping_module_params")
        self.spade = build(SPADEDecoder, "spade_generator", "spade_generator_params")

        st_cfg = cfg["stitching_retargeting_module_params"]
        st_ckpt = _load_state(weight_path("stitching_retargeting_module"))
        self.stitch_nets = {}
        for name, ckpt_key in (("stitching", "retarget_shoulder"),
                               ("lip", "retarget_mouth"),
                               ("eye", "retarget_eye")):
            net = StitchingRetargetingNetwork(**st_cfg[name])
            net.load_state_dict({k.replace("module.", ""): v
                                 for k, v in st_ckpt[ckpt_key].items()})
            # The stitching nets run in plain fp32, outside the autocast.
            self.stitch_nets[name] = net.to(self.device).eval()

        # Ask for CUDA only when onnxruntime actually has it. A plain
        # `pip install onnxruntime` is the CPU build, and asking it for a
        # provider it does not have is a wall of warnings and, on some
        # versions, a hard failure. On CPU the landmark model still runs; it is
        # only used when preparing a photo and when a drag ends.
        cuda = "CUDAExecutionProvider" in onnxruntime.get_available_providers()
        self.landmark = LandmarkRunner(
            ckpt_path=weight_path("landmark"),
            onnx_provider="cuda" if (cuda and self.device.type == "cuda") else "cpu",
        )
        self._yolo = None  # lazy; see _face_bbox

    @classmethod
    def get(cls):
        with cls._lock:
            if cls._inst is None:
                cls._inst = cls()
            return cls._inst

    @classmethod
    def release(cls) -> None:
        """Give the VRAM back. Called when the editor closes."""
        with cls._lock:
            cls._inst = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    # --- detection -------------------------------------------------------

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
            return self.landmark.run(rgb)
        square = np.zeros((side, side, 3), rgb.dtype)
        oy, ox = (side - h) // 2, (side - w) // 2
        square[oy:oy + h, ox:ox + w] = rgb
        lmk = self.landmark.run(square)
        lmk[:, 0] -= ox
        lmk[:, 1] -= oy
        return lmk

    def locate(self, rgb: np.ndarray, crop_factor: float = 1.7, rounds: int = 5):
        """(203 landmarks in picture coordinates, settled).

        Upstream seeds its landmark model with an InsightFace bounding box. We
        do not want InsightFace (non-commercial clause) and MediaPipe turned out
        to be no bargain either: 0.10.33 dropped the `mp.solutions` API
        entirely, and the replacement wants its own `.task` download.

        So the crop bootstraps itself. A coarse pass guesses where the face is,
        then each round re-crops around that guess and measures again. Since the
        crop centres on the landmarks, every round frames the face better than
        the last — which is precisely the job the detector was doing. One pass
        is enough for a head-and-shoulders portrait; a full-length shot with a
        small face needs the extra rounds, and without them the landmarks land
        somewhere between the face and the middle of the picture.

        `settled` is false when it never stopped moving. That is the honest
        answer for a picture with no face in it: the model will still return
        203 points, confidently, in a ring around nothing.
        """
        lmk = self.landmark.run(rgb, self._coarse(rgb))
        settled = False
        for _ in range(rounds):
            crop = crop_image(rgb, lmk, dsize=512, scale=crop_factor, vy_ratio=-0.125)
            seed = _transform_pts(lmk, crop["M_o2c"][:2])
            back = _transform_pts(self.landmark.run(crop["img_crop"], seed),
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

    # --- the expensive half, run once per photo --------------------------

    def _face_bbox(self, rgb: np.ndarray):
        """((x1, y1, x2, y2), settled) — the standard detector when available.

        The stock YOLOv8 face model, conf 0.7, first box wins — so the crop
        math downstream sees the numbers the ecosystem expects. Without
        ultralytics the bbox comes from the landmark walk instead: close
        enough to use, not close enough to promise pixel parity.
        """
        try:
            from ultralytics import YOLO  # noqa: PLC0415 — optional
        except ImportError:
            lmk, settled = self.locate(rgb)
            (x1, y1), (x2, y2) = lmk.min(0)[:2], lmk.max(0)[:2]
            return (float(x1), float(y1), float(x2), float(y2)), settled
        if self._yolo is None:
            path = osp.join(model_dir(), "..", "ultralytics", "face_yolov8n.pt")
            if not osp.exists(path):
                from huggingface_hub import hf_hub_download  # noqa: PLC0415
                path = hf_hub_download(repo_id="Bingsu/adetailer",
                                       filename="face_yolov8n.pt")
            self._yolo = YOLO(path)
        boxes = self._yolo(rgb, conf=0.7, device="", verbose=False)[0].boxes.xyxy.cpu().numpy()
        if len(boxes) == 0:
            # Nothing detected: fall back to the whole picture, and good luck.
            h, w = rgb.shape[:2]
            return (0.0, 0.0, float(w), float(h)), False
        x1, y1, x2, y2 = boxes[0]
        return (float(x1), float(y1), float(x2), float(y2)), True

    @torch.no_grad()
    def prepare(self, rgb: np.ndarray, crop_factor: float = 2.0) -> PreparedSource:
        """The established crop pipeline, step for step.

        Every quirk below is deliberate parity, not taste: the `int()`
        truncation of the square, the mask transform keeping the *clamped*
        region's anisotropic scale while the paste transform switches to the
        full square, and the model input resized straight from the native
        crop rather than via 512 (a second resize softens pixels).
        """
        h, w = rgb.shape[:2]
        (x1, y1, x2, y2), settled = self._face_bbox(rgb)
        bw, bh = x2 - x1, y2 - y1
        side = max(bw, bh) * crop_factor
        cx, cy = x1 + bw / 2, y1 + bh / 2
        square = [int(cx - side / 2), int(cy - side / 2),
                  int(cx + side / 2), int(cy + side / 2)]
        region = [max(square[0], 0), max(square[1], 0),
                  min(square[2], w), min(square[3], h)]
        changed = region != square

        face_img = rgb[region[1]:region[3], region[0]:region[2]]
        if changed:
            shift = np.float32([[1, 0, max(-square[0], 0)], [0, 1, max(-square[1], 0)]])
            face_img = cv2.warpAffine(face_img, shift,
                                      (square[2] - square[0], square[3] - square[1]),
                                      cv2.INTER_LINEAR)

        s_x = (region[2] - region[0]) / 512.0
        s_y = (region[3] - region[1]) / 512.0
        mask_m = np.float32([[s_x, 0, square[0]], [0, s_y, square[1]]])
        mask = cv2.imread(_MASK, cv2.IMREAD_COLOR)
        mask_ori = cv2.warpAffine(mask, mask_m, (w, h),
                                  cv2.INTER_LINEAR).astype(np.float32) / 255.0
        if changed:
            s = (square[2] - square[0]) / 512.0
            crop_trans_m = np.float32([[s, 0, square[0]], [0, s, square[1]]])
        else:
            crop_trans_m = mask_m

        inp = np.clip(cv2.resize(face_img, (256, 256),
                                 interpolation=cv2.INTER_LINEAR)[np.newaxis]
                      .astype(np.float32) / 255.0, 0, 1)
        # Built batch-first and then permuted, deliberately:
        # cuDNN picks kernels by memory layout, and a same-values tensor with a
        # different batch stride renders a hair differently. Measured, sadly.
        t = torch.from_numpy(inp).permute(0, 3, 1, 2).to(self.device)

        kp_info = self.get_kp_info(t)
        with torch.autocast("cuda", torch.float16, enabled=self.autocast):
            f_s = self.appearance(t)
        f_s = f_s.float()
        x_s = transform_keypoint(kp_info).to(self.device)

        crop_512 = cv2.resize(face_img, (512, 512), interpolation=cv2.INTER_LINEAR)
        # Two passes: the first guesses on the bare square (it is square, so no
        # letterboxing needed), the second refines seeded by the first. This is
        # what the rig handles hang from, measured on the crop itself so they
        # do not shift when the editor stops re-measuring frames.
        lmk = self.landmark.run(crop_512, self.landmark.run(crop_512))

        return PreparedSource(
            rgb=rgb, crop_512=crop_512, f_s=f_s, x_s=x_s, kp_info=kp_info,
            crop_trans_m=crop_trans_m, mask_ori=mask_ori,
            lmk_crop=lmk, crop_factor=crop_factor, settled=settled,
        )

    @torch.no_grad()
    def get_kp_info(self, t: torch.Tensor) -> dict:
        """Motion extractor output, with the pose bins turned into degrees."""
        with torch.autocast("cuda", torch.float16, enabled=self.autocast):
            out = self.motion(t)
        kp = {k: v.float() for k, v in out.items()}
        for a in ("pitch", "yaw", "roll"):
            kp[a] = headpose_pred_to_degree(kp[a])[:, None]
        bs = kp["kp"].shape[0]
        kp["kp"] = kp["kp"].reshape(bs, -1, 3)
        kp["exp"] = kp["exp"].reshape(bs, -1, 3)
        return kp

    # --- the cheap half, run on every drag -------------------------------

    @torch.no_grad()
    def render(self, src: PreparedSource, exp: torch.Tensor, rot,
               scale: float = 0.0, trans=None, src_ratio: float = 1.0,
               stitching: bool = True, paste: bool = True,
               composite: str = "classic") -> np.ndarray:
        """Compose the driving keypoints, warp, decode. Returns uint8 RGB.

        `x_d = s(1+ds) * ((exp_src*src_ratio + kp_c + exp_delta) @ R) + t`,
        which is the paper's `x_d = s(x_c R + delta) + t` with our edits folded
        into `delta` and `R`.
        """
        info = src.kp_info

        # `src_ratio` scales down the expression the photo already has, so a
        # smiling source can be neutralised before the rig is applied. Keypoint
        # 5 is left alone: it carries a global component that upstream
        # deliberately protects from this scaling.
        exp_src = info["exp"] * src_ratio
        exp_src[0, 5] = info["exp"][0, 5]

        # The rig hands us plain numpy; the keypoint bookkeeping stays in
        # float32 on the model's device and only drops to fp16 for the warp.
        dev = info["kp"].device
        rot = torch.as_tensor(rot, dtype=torch.float32, device=dev).reshape(3)
        exp = torch.as_tensor(exp, dtype=torch.float32, device=dev).reshape(1, -1, 3)
        # Yaw is negated because the model's positive yaw turns the head towards
        # the *left* of the picture, and nobody dragging a control to the right
        # means that. Measured, not guessed: `tools/kp_atlas.py`'s sibling test
        # rendered +/-12 degrees and looked. Upstream does the same flip, at the
        # top of its own node.
        r = get_rotation_matrix(info["pitch"] + rot[0], info["yaw"] - rot[1],
                                info["roll"] + rot[2])
        x_d = (info["scale"] * (1 + scale)) * ((exp_src + info["kp"] + exp) @ r) + info["t"]
        if trans is not None:
            x_d[:, :, 0:2] += torch.as_tensor(trans, dtype=torch.float32, device=dev).reshape(1, 1, 2)

        x_d = x_d.to(self.device)
        if stitching:
            x_d = self.stitch(src.x_s, x_d)

        with torch.autocast("cuda", torch.float16, enabled=self.autocast):
            out = self.warping(feature_3d=src.f_s, kp_source=src.x_s, kp_driving=x_d)
            img_t = self.spade(feature=out["out"])
        # Output quantisation, kept byte-exact: clip, scale, clip, truncate.
        img = np.transpose(img_t.float().data.cpu().numpy(), [0, 2, 3, 1])[0]
        img = np.clip(np.clip(img, 0, 1) * 255, 0, 255).astype(np.uint8)

        if not paste:
            return img
        # The classic paste: plain affine into the full frame, feathered mask
        # blend — not upstream's paste_back, for workflow compatibility.
        # "enhanced" only upgrades the upsampling to bicubic; a change-mask
        # composite was tried here and pasted warped-background patches over
        # the sharp original whenever the head turned. ponytail: the 512
        # decoder is the real ceiling — a downstream face detailer is the
        # honest upgrade.
        interp = cv2.INTER_CUBIC if composite == "enhanced" else cv2.INTER_LINEAR
        full = cv2.warpAffine(img, src.crop_trans_m,
                              (src.rgb.shape[1], src.rgb.shape[0]), flags=interp)
        return np.clip(src.mask_ori * full + (1 - src.mask_ori) * src.rgb,
                       0, 255).astype(np.uint8)

    @torch.no_grad()
    def stitch(self, x_s: torch.Tensor, x_d: torch.Tensor) -> torch.Tensor:
        """Stage II shoulder stitching: 126 in, 63 keypoint deltas + 2 for tx/ty."""
        bs = x_s.shape[0]
        feat = torch.cat([x_s.reshape(bs, -1), x_d.reshape(bs, -1)], dim=1)
        delta = self.stitch_nets["stitching"](feat)
        out = x_d + delta[..., :63].reshape(bs, -1, 3)
        out[:, :, 0:2] += delta[..., 63:65][:, None]
        return out


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


def anchors(src: PreparedSource, lmk=None) -> dict:
    """Control anchor points and outlines, normalised 0..1 over the 512 crop.

    Normalised rather than in pixels so the editor can scale the picture to
    whatever the modal gives it without the handles drifting off the face.

    Pass `lmk` to use landmarks measured on a *posed* frame instead of the
    source photo. That is how the handles keep up with the face: while a drag
    is running they stay put, which is what you want from something you have
    hold of, and when it ends they are re-measured on the frame that came back.
    """
    lmk = src.lmk_crop if lmk is None else lmk
    lmk = lmk / 512.0
    return {
        "_anchors": {name: [round(float(v), 5) for v in lmk[idx].mean(0)]
                     for name, idx in _ANCHORS.items()},
        "_outlines": {name: [[round(float(p[0]), 4), round(float(p[1]), 4)]
                             for p in lmk[idx[::_OUTLINE_STEP]]]
                      for name, idx in _OUTLINES.items()},
    }


def relocate(src: PreparedSource, crop_rgb: np.ndarray) -> np.ndarray:
    """Landmarks on a posed crop, in the crop's own coordinates.

    One pass, seeded with the source landmarks. That is enough here because
    `locate` has already settled the crop: the face is aligned and has only
    moved by an expression, so there is nothing for a second pass to find.
    """
    return Engine.get().landmark.run(crop_rgb, src.lmk_crop)


def transform_keypoint(kp_info: dict) -> torch.Tensor:
    """`s * (kp @ R + exp) + t_xy` — upstream's `transform_keypoint`.

    The z of the translation is dropped, exactly as in the paper.
    """
    kp, exp = kp_info["kp"], kp_info["exp"]
    bs = kp.shape[0]
    r = get_rotation_matrix(kp_info["pitch"], kp_info["yaw"], kp_info["roll"])
    out = kp.view(bs, -1, 3) @ r + exp.view(bs, -1, 3)
    out = out * kp_info["scale"][..., None]
    out[:, :, 0:2] += kp_info["t"][:, None, 0:2]
    return out
