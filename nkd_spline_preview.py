"""Backend preview for the spline editors.

A preview is only worth having if you can trust it, and the only way to trust it
is for it to be the same code that renders. So the editors do not reimplement the
flow field or the variable-radius blur in JavaScript — that would be the same
algorithm in two languages with nothing keeping them honest, which is exactly the
trap the spline evaluation was designed to avoid. Instead the editor posts its
geometry here and the backend runs the real functions on the frame the node
already cached.

The cost is a round trip, so the editor asks when a drag *ends* rather than on
every mouse move; the vector overlay carries the live feedback in between. On a
GPU this comes back in well under a tenth of a second at preview resolution.

Vector Mask has no route: filling polygons is cheap and exact in a 2-D canvas, so
its preview is client-side and genuinely live.
"""
from __future__ import annotations

import base64
import io as _io
import logging

import numpy as np
import torch

from . import helpers
from .nkd_field_blur import apply_field_blur
from .nkd_path_blur import apply_path_blur

# Preview resolution. The cached frame is up to 1024 px; blurring is the
# expensive part and it is the *shape* of the blur being judged here, not its
# pixel-exactness, so the longest side is capped well below that.
_PREVIEW_SIDE = 640


def _downscale(arr):
    step = max(1, int(np.ceil(max(arr.shape[:2]) / _PREVIEW_SIDE)))
    # A copy, not a view: the cache holds an immutable bytes object.
    return torch.from_numpy(np.array(arr[::step, ::step])).float().div_(255.0).unsqueeze(0)


def _frame(unique_id, supplied=None):
    """Source frame → [1, H, W, 3] float tensor, downscaled for preview.

    The editor may supply the frame itself. That matters: the cache is only
    filled when the node runs, so without this a Load Image the user can already
    see in the editor would still say "run the graph first" — which is nonsense
    from where they are sitting.
    """
    if supplied:
        from PIL import Image
        raw = supplied.split(",", 1)[-1]                  # tolerate a data: URL
        img = Image.open(_io.BytesIO(base64.b64decode(raw))).convert("RGB")
        return _downscale(np.asarray(img))

    got = helpers.cached_source(unique_id)
    if got is None:
        return None
    h, w, buf = got
    return _downscale(np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3))


def _mask_for(unique_id, h: int, w: int):
    """The node's cached mask, resized to the preview frame. None if unwired.

    Without this the preview blurs straight over the area the node is about to
    protect — it would be showing a result the graph will never produce.
    """
    m = helpers.cached_mask(unique_id)
    if m is None:
        return None
    m = m.to(torch.float32)
    if m.shape[-2:] != (h, w):
        m = torch.nn.functional.interpolate(m.unsqueeze(1), size=(h, w),
                                            mode="bilinear", align_corners=False).squeeze(1)
    return m


def render(unique_id, kind: str, params: dict):
    """Run the real node maths on the frame. Returns PNG bytes, or None."""
    image = _frame(unique_id, params.get("frame"))
    if image is None:
        return None
    mask = _mask_for(unique_id, image.shape[1], image.shape[2])

    if kind == "field":
        out = apply_field_blur(image, params.get("pins") or "",
                               int(params.get("max_blur", 48)),
                               mask=mask,
                               falloff=float(params.get("falloff", 2.0)))
    elif kind == "path":
        out = apply_path_blur(image, params.get("paths") or "",
                              float(params.get("strength", 24.0)),
                              float(params.get("spread", 0.15)),
                              mask=mask)
    else:
        return None

    from PIL import Image
    rgb = (out[0].clamp(0.0, 1.0) * 255.0 + 0.5).to(torch.uint8).cpu().numpy()
    buf = _io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, format="PNG", compress_level=1)
    return buf.getvalue()


def _register_routes() -> None:
    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.post("/nkd/spline/preview")
    async def _preview(request):
        try:
            body = await request.json()
        except Exception:
            return web.Response(status=400, text="bad json")

        try:
            png = render(body.get("node"), str(body.get("kind", "")), body.get("params") or {})
        except Exception as exc:                       # a preview must never 500 the editor
            return web.Response(status=200, headers={"X-NKD-Error": str(exc)[:200]},
                                body=b"", content_type="application/octet-stream")

        if png is None:
            # No cached frame yet: the graph has not run since this node was
            # added. The editor turns this into "queue once to preview".
            return web.Response(status=204)
        return web.Response(body=png, content_type="image/png",
                            headers={"Cache-Control": "no-store"})


try:
    _register_routes()
    logging.info("[NKD Basic Tools] spline preview route ready at /nkd/spline/preview")
except Exception as _exc:  # no server (unit tests), or already registered
    logging.warning("[NKD Basic Tools] spline preview route NOT registered (%s: %s) — "
                    "the blur editors will fall back to showing the source image",
                    type(_exc).__name__, _exc)
