"""Self-check for the MiniMax guides node. Needs ComfyUI on the path, because the
point of the test is that the real Add Guide node accepts what we hand it:

    cd <ComfyUI>  &&  python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_minimax_guides.py
"""
import importlib
import os
import sys
import types

import torch

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_HERE)))   # <ComfyUI>/custom_nodes/<pkg>
_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_HERE]
sys.modules["nkdbt"] = _pkg


class _VideoVae:
    def encode(self, pixels):
        return torch.zeros(1, 24, 2, 48, 84)


class _AudioVae:
    audio_sample_rate = 32000

    def encode(self, waveform):
        return torch.zeros(1, 32, 2, 40)


class _Video:
    """Stands in for a VIDEO input: picture and its soundtrack in one slot."""

    def get_components(self):
        from comfy_api.latest._util import VideoComponents
        from fractions import Fraction
        return VideoComponents(images=torch.zeros(5, 768, 1344, 3),
                               audio={"waveform": torch.zeros(1, 2, 32000), "sample_rate": 32000},
                               frame_rate=Fraction(24))


def demo():
    guides = importlib.import_module("nkdbt.nkd_minimax_guides")
    core = importlib.import_module("comfy_extras.nodes_minimax_h3")

    latent, frame_count = core._empty_av_latent(1344, 768, 124)
    assert frame_count == 124
    positive = [[torch.zeros(1, 4, 16), {}]]
    image = torch.zeros(1, 768, 1344, 3)
    audio = {"waveform": torch.zeros(1, 2, 32000), "sample_rate": 32000}

    def run(slots, **positions):
        return guides.NKDMiniMaxGuides.execute(
            positive, latent, vae=_VideoVae(), audio_vae=_AudioVae(),
            guides={f"guide_{i}": v for i, v in enumerate(slots, 1)}, **positions)

    def keyframes(out):
        return out[0][0][1]["minimax_keyframes"]

    # One keyframe per slot, at the position widget that belongs to that slot.
    out = run([image, image], position_1=0, position_2=34)
    kf = keyframes(out)
    assert [k["resolved_frame_index"] for k in kf] == [0, 34], kf
    assert all("latent" in k and "audio_latent" not in k for k in kf)

    # Negative positions count from the end, and -1 — the last frame, where fl2va
    # puts its own closing keyframe — survives snapping, so a loop still shuts.
    assert keyframes(run([image], position_1=-1))[0]["resolved_frame_index"] == 123

    # Picture and sound on the same frame are ONE guide, not two: that is what a
    # clip with its soundtrack is, and what the core node builds from both inputs.
    kf = keyframes(run([image, audio], position_1=34, position_2=34))
    assert len(kf) == 1 and "latent" in kf[0] and "audio_latent" in kf[0], kf

    # A VIDEO slot carries both halves on its own.
    kf = keyframes(run([_Video()], position_1=17))
    assert kf[0]["resolved_frame_index"] == 17
    assert len(kf) == 1 and "latent" in kf[0] and "audio_latent" in kf[0], kf

    # Sound alone is a guide too, and needs no video vae.
    kf = guides.NKDMiniMaxGuides.execute(positive, latent, audio_vae=_AudioVae(),
                                         guides={"guide_1": audio}, position_1=0)[0][0][1]["minimax_keyframes"]
    assert len(kf) == 1 and "audio_latent" in kf[0] and "latent" not in kf[0]

    # Empty slots are skipped, and the conditioning comes back untouched when
    # there is nothing to anchor.
    assert "minimax_keyframes" not in run([None, None])[0][0][1]

    # Snap pulls a guide onto the grid and into the video; off leaves it exactly
    # where it was put.
    assert keyframes(run([image], position_1=22))[0]["resolved_frame_index"] == 17
    assert keyframes(run([image], position_1=9999))[0]["resolved_frame_index"] == 119
    assert keyframes(run([image], position_1=22, snap_positions=False))[0][
        "resolved_frame_index"] == 22

    # A clip and its soundtrack are one guide before any snapping, so an off-grid
    # pair moves together instead of drifting apart.
    kf = keyframes(run([image, audio], position_1=10, position_2=10))
    assert len(kf) == 1 and kf[0]["resolved_frame_index"] == 17, kf

    # Two pictures on one frame would silently drop one of them.
    try:
        run([image, image], position_1=0, position_2=0)
        raise AssertionError("two images at one position should not be accepted")
    except ValueError as e:
        assert "different positions" in str(e), e

    # The pass-through outputs are the very objects handed in — that is the whole
    # point of the node: the sampler hangs off here, not off the far upstream.
    vae, audio_vae = _VideoVae(), _AudioVae()
    out = guides.NKDMiniMaxGuides.execute(positive, latent, vae=vae, audio_vae=audio_vae,
                                          guides={"guide_1": image}, position_1=0)
    assert out[1] is latent and out[2] is vae and out[3] is audio_vae

    print("minimax guides ok")


if __name__ == "__main__":
    demo()
