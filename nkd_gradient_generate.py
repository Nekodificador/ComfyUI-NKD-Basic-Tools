"""NKD Gradient Generate — a gradient image (linear/radial/angular/diamond),
no reference image needed, drawn live as you edit the ramp or drag the
on-canvas handles."""
from __future__ import annotations
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nkd_color_ramp import (
    _DEFAULT_HANDLES,
    _DEFAULT_RAMP,
    _parse_handles,
    _parse_interp,
    _parse_ramp,
    _position_field,
    _sample_ramp,
    _warp_position,
)
from .helpers import _BLEND_MODES, _blend, _luminance
from .nkd_frequency import _send_source_to_widget


def _send_size_to_widget(unique_id, width, height) -> None:
    """Tell the preview widget the RESOLVED width/height so the gizmo can match
    the output aspect — works even when the dims arrive computed (e.g. a
    constrain-proportion node), which the frontend can't read before execution."""
    if not unique_id:
        return
    try:
        from server import PromptServer  # type: ignore
    except Exception:
        return
    PromptServer.instance.send_sync(
        "nkd-gradient-size",
        {"node_id": unique_id, "width": int(width), "height": int(height)})


class NKDGradientGenerate(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDGradientGenerate",
            display_name="😺NKD Gradient Generate",
            category="😺NKD Nodes/Basic",
            description=(
                "Generate a gradient image from a color ramp — linear, "
                "radial, angular (conic) or diamond. Drag the handles on the "
                "preview to set direction and extent; edit the ramp below."
            ),
            inputs=[
                io.Int.Input("width", default=1024, min=8, max=8192, step=8),
                io.Int.Input("height", default=1024, min=8, max=8192, step=8),
                io.Combo.Input("shape", options=["Linear", "Radial", "Angular", "Diamond"],
                               default="Linear"),
                io.String.Input("handles", multiline=False, default=_DEFAULT_HANDLES,
                                socketless=True,
                                tooltip="Gradient handles, dragged on the preview above."),
                io.String.Input("ramp", multiline=False, default=_DEFAULT_RAMP,
                                socketless=True,
                                tooltip="The color ramp, edited above."),
                io.Image.Input("image", optional=True,
                               tooltip="Optional — the gradient takes this image's "
                                       "size (width/height are ignored). Composite "
                                       "over it with blend_mode, or leave blend_mode "
                                       "on 'none' to use it as a size reference only."),
                io.Combo.Input("blend_mode",
                               options=["none"] + list(_BLEND_MODES),
                               default="none",
                               tooltip="How the gradient composites over the optional "
                                       "image. 'none' outputs the bare gradient (the "
                                       "image only sets the size)."),
                io.Float.Input("opacity", default=1.0, min=0.0, max=1.0, step=0.01,
                               tooltip="How much of the composited gradient shows "
                                       "through. Ignored when blend_mode is 'none'."),
            ],
            hidden=[io.Hidden.unique_id],  # to tell the preview the resolved size
            outputs=[
                io.Image.Output(display_name="image",
                                tooltip="The generated gradient."),
                io.Mask.Output(display_name="mask",
                               tooltip="Luminance of the gradient — use it as a mask."),
            ],
        )

    @classmethod
    def execute(cls, width, height, shape, handles, ramp,
                image=None, blend_mode="none", opacity=1.0) -> io.NodeOutput:
        if image is not None:  # an image always dictates the size
            height, width = int(image.shape[1]), int(image.shape[2])
        stops = _parse_ramp(ramp)
        p0, p1, mid = _parse_handles(handles)
        device = image.device if image is not None else torch.device(
            "cuda" if torch.cuda.is_available() else "cpu")
        t = _position_field(shape, width, height, p0, p1, device)
        t = _warp_position(t, mid)
        grad = _sample_ramp(stops, t, _parse_interp(ramp)).unsqueeze(0)  # [1, H, W, 3]

        out = grad
        if image is not None and blend_mode != "none":
            # The gradient is the top layer; broadcasting handles a batched base.
            out = _blend(image[..., :3], grad, blend_mode, opacity)
        out = out.cpu()
        uid = getattr(getattr(cls, "hidden", None), "unique_id", None)
        _send_size_to_widget(uid, width, height)
        if image is not None:  # so the gizmo can preview the composite live
            _send_source_to_widget(uid, image, event="nkd-gradgen-source")
        # The mask is the GRADIENT's luminance, not the composite's — that's the
        # falloff you drew, which is what you'd feed a mask input.
        return io.NodeOutput(out, _luminance(grad.cpu()))


class NKDGradientGenerateExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDGradientGenerate]


NODE_CLASS_MAPPINGS = {"NKDGradientGenerate": NKDGradientGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDGradientGenerate": "😺NKD Gradient Generate"}
