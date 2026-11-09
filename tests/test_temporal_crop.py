"""Self-check for the temporal crop / stitch. Needs ComfyUI on the path:

    cd <ComfyUI>  &&  python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_temporal_crop.py
"""
import importlib
import os
import sys
import types

import torch

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_HERE)))   # <ComfyUI>
_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_HERE]
sys.modules["nkdbt"] = _pkg


class _VideoVae:
    """Stands in for a video VAE: the grid it reports and a latent of the matching length."""
    latent_dim = 3

    def __init__(self, stride, channels):
        self.downscale_index_formula = (stride, 16, 16)
        self.latent_channels = channels

    def encode(self, pixels):
        tc = importlib.import_module("nkdbt.nkd_temporal_crop")
        stride, chunk = tc.token_grid(self)
        t = sum(tc.is_token_start(d, stride, chunk) for d in range(pixels.shape[0]))
        return torch.zeros(1, self.latent_channels, t, pixels.shape[1] // 16, pixels.shape[2] // 16)


def demo():
    tc = importlib.import_module("nkdbt.nkd_temporal_crop")

    # The grid: H3 opens tokens on frames 0, 1, 5, 9, 13 of every 17; Wan/LTX on 1+s*k.
    assert [d for d in range(18) if tc.is_token_start(d, 4, 17)] == [0, 1, 5, 9, 13, 17]
    assert [d for d in range(18) if tc.is_token_start(d, 8, None)] == [0, 1, 9, 17]
    assert tc.valid_length(141, 4, 17) == 141 and tc.valid_length(142, 4, 17) == 158
    assert tc.valid_length(10, 4, None) == 13 and tc.valid_length(10, 8, None) == 17

    assert tc.parse_spans("30-52, 90-110", 100) == [(30, 53), (90, 100)]
    assert tc.parse_spans('{"spans": [[5, 9]]}', 100) == [(5, 10)]
    assert tc.parse_spans("", 100) == []

    for stride, chunk in ((4, 17), (4, None), (8, None)):
        for every in (1, 2, 3):
            p = tc.plan(141, [(40, 60), (100, 104)], every, 12, stride, chunk)
            L = len(p["src"])
            assert L == tc.valid_length(L, stride, chunk), (stride, chunk, L)
            # every drawing owns exactly one whole token, and shows one still pose in it
            for f in range(141):
                g = p["groups"][f]
                if not p["hot"][f]:
                    continue
                d0, d1 = g
                assert tc.is_token_start(d0, stride, chunk), (f, g)
                assert d1 == tc.next_token_start(d0, stride, chunk), (f, g)
                assert len({p["src"][d] for d in range(d0, d1)}) == 1
                assert all(p["regen"][d] == 1 for d in range(d0, d1))
            # every token is either all redrawn or all frozen: the noise mask is exact
            starts = [d for d in range(L) if tc.is_token_start(d, stride, chunk)] + [L]
            for a, b in zip(starts, starts[1:]):
                assert len({p["regen"][d] for d in range(a, b)}) == 1, (a, b)
            # handles are frozen and play at normal speed
            assert all(p["regen"][p["groups"][f][0]] == 0 for f in range(28, 40))
            # on 2s a drawing covers two world frames
            if every == 2:
                assert p["groups"][40] == p["groups"][41] != p["groups"][42]

    # Without marks nothing is planned and the stitch never asks for the redraw.
    assert tc.plan(50, [], 1, 12, 4, 17)["src"] == []

    # Round trip: a redraw identical to the slowed input stitches back to the original.
    images = torch.rand(60, 32, 48, 3)
    vae = _VideoVae(4, 24)
    latent, frames, length, prompt, tmap = tc.NKDTemporalCrop.execute(
        images, vae, spans="20-30", every="1", context=6, prompt="At 00:01.000 he jumps.")
    assert frames.shape[0] == length and length == tc.valid_length(length, 4, 17)
    t = latent["samples"].shape[2]
    assert latent["noise_mask"].shape == (t, 1, 2, 3)
    assert set(latent["noise_mask"].flatten().tolist()) == {0.0, 1.0}
    assert tc.NKDTemporalStitch.check_lazy_status(images, tmap) == ["redrawn"]
    out = tc.NKDTemporalStitch.execute(images, tmap, frames)[0]
    assert torch.allclose(out, images), (out - images).abs().max()
    # the 1 s mark is world frame 24, past the stretch: it moves later on the slowed clock
    assert prompt != "At 00:01.000 he jumps." and prompt.startswith("At 00:0")

    # On 2s each drawing is held for two frames; everything outside the stretch is untouched.
    _, frames2, _, _, tmap2 = tc.NKDTemporalCrop.execute(images, vae, spans="20-30", every="2", context=6)
    out2 = tc.NKDTemporalStitch.execute(images, tmap2, frames2)[0]
    assert torch.equal(out2[21], images[20]) and torch.equal(out2[20], images[20])
    assert torch.equal(out2[:14], images[:14]) and torch.equal(out2[37:], images[37:])

    # Nothing marked: the video passes through untouched and the sampler is skipped.
    _, _, _, _, empty = tc.NKDTemporalCrop.execute(images, vae)
    assert tc.NKDTemporalStitch.check_lazy_status(images, empty) == []
    assert tc.NKDTemporalStitch.execute(images, empty)[0] is images

    # The soundtrack is stretched to the slowed clip's duration.
    p = tc.plan(48, [(10, 20)], 1, 4, 4, 17)
    track = tc.stretch_audio({"waveform": torch.randn(1, 2, 32000 * 2), "sample_rate": 32000}, p, 24.0)
    assert track["waveform"].shape[-1] == round(len(p["src"]) * 32000 / 24.0)

    try:
        tc.token_grid(types.SimpleNamespace(latent_dim=2, downscale_index_formula=None))
        raise AssertionError("an image VAE should be refused")
    except ValueError:
        pass

    print("temporal crop ok")


if __name__ == "__main__":
    demo()
