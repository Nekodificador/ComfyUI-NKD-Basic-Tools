# coding: utf-8
"""
Backend for the face rig editor.

The spline editors post their geometry here only when a drag *ends*, because
their overlay already carries the live feedback and the backend work is heavy.
The face rig is the opposite case on both counts: nothing drawn on a canvas can
predict what the warping network will do with a face, and the work is cheap —
the source is prepared once and a new expression costs a single warp + decode,
measured at 24 ms on an RTX 5090 and 12.8 ms on a 4090 in the paper.

So this renders continuously while the handle moves. The pacing is not a
debounce, which would have to guess a number that is wrong on both fast and
slow machines. Instead the client keeps exactly one request in flight and sends
the next one when the last comes back, which settles at whatever rate the
hardware can actually sustain.

Never returns 500. A failed preview puts its reason in `X-NKD-Error` with a 200
so the editor can say what went wrong and stay open, and a 204 means "this node
has not run yet", which the editor answers by posting the frame it already has
on screen.
"""
from __future__ import annotations

import base64
import io as _io
import json
import logging

import numpy as np

import cv2

from . import nkd_face_rig_axes as axes
from .nkd_face_rig import (cached_source, pose_from_state, prepared_source,
                           sided_poses)
from .nkd_face_rig_engine import _MASK, Engine, anchors, relocate

# The decoder renders 512 and that is all there is — 256 in, PixelShuffle x2 out.
# So a drag frame is sent at full size and only the encoding is cheapened: JPEG
# instead of PNG, which is where the saving actually was. Shrinking it as well
# was a false economy that cost resolution to save a millisecond of resampling.
_DRAG_QUALITY = 92

_mask512_cache = None


def _mask512() -> np.ndarray:
    """The paste-back mask template in crop space, float 0..1, loaded once."""
    global _mask512_cache
    if _mask512_cache is None:
        _mask512_cache = cv2.imread(_MASK, cv2.IMREAD_COLOR).astype(np.float32) / 255.0
    return _mask512_cache


def _decode(data_url: str) -> np.ndarray:
    from PIL import Image
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    return np.array(Image.open(_io.BytesIO(raw)).convert("RGB"))


def _encode(rgb: np.ndarray, drag: bool) -> tuple:
    from PIL import Image
    img = Image.fromarray(rgb, "RGB")
    buf = _io.BytesIO()
    if drag:
        img.save(buf, format="JPEG", quality=_DRAG_QUALITY)
        return buf.getvalue(), "image/jpeg"
    img.save(buf, format="PNG", compress_level=1)
    return buf.getvalue(), "image/png"


def render(node_id, rig: str, quality: str, frame=None, crop_factor=2.0,
           src_ratio=1.0):
    """(bytes, mime, anchors, settled) — or None when there is no source."""
    drag = quality == "drag"

    # When the editor sends its frame — it does on its first request of a
    # session — go through the fingerprint cache: same picture and crop is a
    # cache hit, a changed upstream image re-prepares. Trusting a bare cache
    # hit here kept showing the old face after the user swapped the photo.
    if frame:
        src = prepared_source(node_id, _decode(frame), float(crop_factor))
    else:
        src = cached_source(node_id)
        if src is None:
            return None

    state = axes.deserialise(rig)
    pose = pose_from_state(state)
    # The editor shows the aligned crop — the one frame whose coordinates the
    # handles are expressed in — but composited exactly the way the node's
    # final paste-back composites it: warped face through the feathered mask,
    # original pixels outside. The raw warp smears hair and background near
    # the crop edges, and the mask is what removes most of that in the real
    # output; previewing the raw crop had people judging artifacts the final
    # image does not have.
    # Stitching stays on during the drag too. It was off, to save a pass, and
    # the pass it saved was a 126->65 MLP — while its translation offset moved
    # the whole face a few pixels the moment you touched a control. A preview
    # that jumps when you grab it is not a preview.
    sided = sided_poses(state)
    eng = Engine.get()
    common = dict(src_ratio=float(src_ratio), stitching=True, paste=False)
    if sided is not None:
        out = eng.render_sided(src, sided[0].exp, sided[1].exp, pose.rot,
                               scale=pose.scale, trans=pose.trans, **common)
    else:
        out = eng.render(src, pose.exp, pose.rot, scale=pose.scale,
                         trans=pose.trans, **common)
    m = _mask512()
    out = np.clip(m * out + (1.0 - m) * src.crop_512, 0, 255).astype(np.uint8)
    body, mime = _encode(out, drag)

    # Re-measure where the features ended up, but only when the drag is over.
    # It is another 10 ms of landmark inference, which is worth paying once per
    # gesture and not worth paying forty times a second.
    lmk = None if drag else relocate(src, out)
    return body, mime, anchors(src, lmk), src.settled


def _register_routes() -> None:
    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.post("/nkd/facerig/preview")
    async def _preview(request):
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="bad json")

        try:
            got = render(
                body.get("node"), str(body.get("rig") or ""),
                str(body.get("quality") or "final"),
                frame=body.get("frame"),
                crop_factor=body.get("crop_factor", 2.0),
                src_ratio=body.get("src_ratio", 1.0),
            )
        except Exception as exc:                    # a preview must never 500 the editor
            return web.json_response({"error": str(exc)[:300]})

        if got is None:
            # Nothing prepared for this node yet. The editor answers by sending
            # the picture it is already showing, so nobody is told to go and
            # queue the graph for a face they can see.
            return web.json_response({"needsFrame": True})

        data, mime, anch, settled = got
        # One JSON envelope, image included as a data URL.
        #
        # The anchors used to ride in a response header, to keep the image a
        # plain blob. Then the feature outlines went in with them and the header
        # grew past a kilobyte — and a header that is sometimes dropped gives
        # you an editor whose controls silently jump to the centre of the
        # picture, because that is where a missing anchor puts them. Base64
        # costs a third more bytes over a loopback connection, which is nothing,
        # and it cannot be truncated by a proxy having an opinion about header
        # size.
        payload = {
            "image": "data:{};base64,{}".format(mime, base64.b64encode(data).decode()),
            "anchors": anch.get("_anchors", anch),
            "outlines": anch.get("_outlines", {}),
            "settled": settled,
        }
        if not settled:
            # The landmark model always returns 203 points, confidently, even
            # for a picture with no face in it. Saying so beats drawing a rig
            # around nothing and letting the user wonder what they did wrong.
            payload["warning"] = (
                "could not lock onto a face — the controls may not line up. "
                "A closer portrait, or a larger crop_factor, usually fixes it."
            )
        return web.json_response(payload, headers={"Cache-Control": "no-store"})

    @routes.post("/nkd/facerig/release")
    async def _release(request):
        """The editor closed. Give the VRAM back."""
        Engine.release()
        return web.json_response({"ok": True})

    @routes.get("/nkd/facerig/library")
    async def _library(request):
        """Axes and presets, so the editor never hardcodes what a handle means."""
        lib = axes.load_axes()
        return web.json_response({
            "axes": [{"name": a.name, "label": a.label, "au": a.au, "group": a.group,
                      "side": a.side, "lo": a.lo, "hi": a.hi} for a in lib],
            "presets": {name: {"aus": spec,
                               "missing": axes.preset_weights(name, 1.0, lib)[1]}
                        for name, spec in axes.PRESETS.items()},
        })

    @routes.post("/nkd/facerig/preset")
    async def _preset(request):
        """Resolve a preset to axis weights, including what it could not cover."""
        body = await request.json()
        lib = axes.load_axes()
        try:
            w, missing = axes.preset_weights(str(body.get("name")),
                                             float(body.get("intensity", 1.0)), lib)
        except KeyError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        return web.json_response({"weights": w, "missing": missing})


try:
    _register_routes()
    logging.info("[NKD Basic Tools] face rig routes ready at /nkd/facerig/*")
except Exception as _exc:  # no server (unit tests), or already registered
    logging.warning("[NKD Basic Tools] face rig routes NOT registered (%s: %s) — "
                    "the rig editor will not be able to preview",
                    type(_exc).__name__, _exc)
