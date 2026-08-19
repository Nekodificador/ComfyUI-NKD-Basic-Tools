"""Self-check for the AV latent nodes. Needs ComfyUI on the path, because the
point of the test is that the real Concat AV Latent accepts what we build:

    cd <ComfyUI>  &&  python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_av_latent.py
"""
import importlib
import os
import sys
import types

import torch

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_HERE)))   # <ComfyUI>/custom_nodes/<pkg>
_pkg = types.ModuleType("nkdbt")          # the package imports `. mask_core`
_pkg.__path__ = [_HERE]
sys.modules["nkdbt"] = _pkg


class _VideoVae:
    def encode(self, pixels):
        return torch.zeros(1, 24, 37, 48, 84)


class _AudioVae:
    audio_sample_rate = 32000

    def encode(self, waveform):
        return torch.zeros(1, 32, 2, 207)   # MiniMax H3: 124 frames @24fps -> 207 @40


def demo():
    av = importlib.import_module("nkdbt.nkd_av_latent")

    images = torch.zeros(124, 768, 1344, 3)
    audio = {"waveform": torch.zeros(1, 2, 32000 * 5), "sample_rate": 32000}
    mask = torch.zeros(124, 768, 1344)
    mask[:62, 100:200, 100:200] = 1.0      # first half of the clip, a corner of the frame

    def run(**kw):
        out = av.NKDAVLatent.execute(images, audio, _VideoVae(), _AudioVae(), **kw)[0]
        assert out["samples"].is_nested, "the sampler needs both streams in one latent"
        nm = out.get("noise_mask")
        return out, (None if nm is None else nm.unbind())

    # Keep: the sound is masked off everywhere, so none of it is resampled.
    _, m = run(audio_mode="keep", latent_mask=mask)
    assert float(m[1].max()) == 0.0

    # Regenerate: no audio mask is set and the concat fills it with ones, which
    # is exactly what a plain video mask gets you today.
    _, m = run(audio_mode="regenerate", latent_mask=mask)
    assert float(m[1].min()) == 1.0
    assert run(audio_mode="regenerate")[1] is None      # nothing masked at all: no mask

    # Follow mask: on for the stretch the picture mask is on, to the audio grid.
    _, m = run(audio_mode="follow mask", latent_mask=mask)
    track = m[1].reshape(-1, 207)[0]
    on = (track > 0).nonzero().flatten().tolist()
    assert on == list(range(len(on))), on                # one run, from the start
    assert abs(len(on) - 207 * 62 / 124) <= 1, len(on)   # ends where the video mask does
    assert m[1].shape[-1] == 207                         # sized to the latent, never resampled

    # The setting decides even with an audio mask connected — it only says *when*,
    # and only to the setting that asks for it. Anything else is a dead widget.
    _, m = run(audio_mode="keep", latent_mask=mask, audio_mask=1.0 - mask)
    assert float(m[1].max()) == 0.0
    _, m = run(audio_mode="regenerate", latent_mask=mask, audio_mask=1.0 - mask)
    assert float(m[1].min()) == 1.0
    _, m = run(audio_mode="follow mask", latent_mask=mask, audio_mask=1.0 - mask)
    assert float(m[1].min()) == 1.0                      # 1 - mask is white on every frame

    # No picture mask: the concat fills the video side, the sound still obeys.
    _, m = run(audio_mode="keep")
    assert float(m[0].min()) == 1.0 and float(m[1].max()) == 0.0

    # The standalone node is the audio branch's Set Latent Noise Mask: the latent
    # comes back with the mask already on it.
    src = {"samples": torch.zeros(1, 32, 2, 207)}
    lat = av.NKDAudioMask.execute(src, mask)[0]
    assert "noise_mask" not in src                       # the input dict is left alone
    nm = lat["noise_mask"]
    assert nm.shape == (1, 1, 2, 207), nm.shape          # the latent's own shape: no resampling
    assert torch.equal(nm[0, 0, 0], nm[0, 0, 1])
    assert torch.equal(nm[0, 0, 0], track.reshape(-1, 207)[0])

    # What core's Set Latent Noise Mask would have done instead: keep frame 0 only
    # and read the mask's width as time. This is the node's whole reason to exist.
    import comfy.utils
    wrong = comfy.utils.reshape_mask(mask.reshape((-1, 1) + mask.shape[-2:]), (1, 32, 2, 207))
    assert wrong.shape[0] == 1                           # 124 frames collapsed to the first one
    assert not torch.equal(wrong[0, 0, 0] > 0, nm[0, 0, 0] > 0)    # silently a different clip

    # Time is not the same axis everywhere: LTXV is [B, 8, T, 16] (16 frequency
    # bins last), MiniMax H3 is [B, 32, 2, T]. The timeline has to land on the
    # right one, and the other has to come out flat.
    ltx = av.NKDAudioMask.execute({"samples": torch.zeros(1, 8, 207, 16)}, mask)[0]["noise_mask"]
    assert ltx.shape == (1, 1, 207, 16), ltx.shape
    assert torch.equal(ltx[0, 0, :, 0], nm[0, 0, 0])     # same timeline, transposed axis
    assert float(ltx[0, 0].std(dim=1).max()) == 0.0      # flat across the frequency bins
    assert float(ltx[0, 0, :, 0].std()) > 0.0            # and varying along time

    # A 3-axis audio latent keeps its rank, or reshape_mask cannot interpolate it.
    assert av.NKDAudioMask.execute({"samples": torch.zeros(1, 8, 207)},
                                   mask)[0]["noise_mask"].shape == (1, 1, 207)

    # Square on the last two axes: which one is time is unknowable, so it says so.
    try:
        av.NKDAudioMask.execute({"samples": torch.zeros(1, 8, 16, 16)}, mask)
        raise SystemExit("a square audio latent should have been refused")
    except ValueError:
        pass

    # An encode that lands off the canonical length is cut or padded to what the model
    # expects for this many pictures: round(124 / 24 * 40) = 207. The core's Concat only
    # fits when its VIDEO input is already an AV latent - the path this node never takes
    # - so without this the mismatch sails through and the two streams disagree about
    # where the clip ends.
    from comfy_extras.nodes_lt import LTXVConcatAVLatent

    def vae_returning(t):
        return type("V", (), {"audio_sample_rate": 32000, "downscale_ratio": 800,
                              "encode": lambda self, w: torch.ones(1, 32, 2, t)})()

    for encoded in (207, 204, 211):                     # exact, short, long
        out = av.NKDAVLatent.execute(images, audio, _VideoVae(), vae_returning(encoded),
                                     audio_mode="follow mask", latent_mask=mask)[0]
        assert out["samples"].unbind()[1].shape[-1] == 207, encoded
        nm = out["noise_mask"].unbind()[1]
        assert nm.shape[-1] == 207, (encoded, nm.shape)     # the mask is sized to it
        # Built AFTER the fit, so the timing is read off the corrected length: a short
        # encode must not squeeze the masked stretch into a shorter clip.
        on = (nm.reshape(-1, 207)[0] > 0).nonzero().flatten().tolist()
        assert on == list(range(len(on))) and abs(len(on) - 207 * 62 / 124) <= 1, (encoded, len(on))
    # a short encode is padded with silence, not with a repeat of the tail
    assert float(out["samples"].unbind()[1][..., -1].abs().max()) in (0.0, 1.0)

    # The rate is read off the VAE, not hardcoded: halve it and the target halves.
    half = type("V", (), {"audio_sample_rate": 32000, "downscale_ratio": 1600,
                          "encode": lambda self, w: torch.zeros(1, 32, 2, 207)})()
    out = av.NKDAVLatent.execute(images, audio, _VideoVae(), half, audio_mode="keep")[0]
    assert out["samples"].unbind()[1].shape[-1] == 103, out["samples"].unbind()[1].shape

    # A VAE that doesn't describe itself leaves the length alone rather than guessing.
    mute = type("V", (), {"encode": lambda self, w: torch.zeros(1, 32, 2, 204)})()
    out = av.NKDAVLatent.execute(images, audio, _VideoVae(), mute, audio_mode="keep")[0]
    assert out["samples"].unbind()[1].shape[-1] == 204

    # the core node on its own still does NOT fit - this is the gap being covered
    raw = LTXVConcatAVLatent.execute({"samples": torch.zeros(1, 24, 37, 48, 84)},
                                     {"samples": torch.zeros(1, 32, 2, 204)})[0]
    assert raw["samples"].unbind()[1].shape[-1] == 204

    # ...and it drops into the real chain in place of both nodes.
    from comfy_extras.nodes_lt import LTXVConcatAVLatent
    joint = LTXVConcatAVLatent.execute({"samples": torch.zeros(1, 24, 37, 48, 84)}, lat)[0]
    assert torch.equal(joint["noise_mask"].unbind()[1], lat["noise_mask"])

    # --- AV Latent Extend: the masked-extension combiner ---------------------
    # Fixture: Ablejones' MiniMaxH3_BasicMaskedExtension v1.4, the workflow this
    # node replaces. 2 overlap chunks there = 22 pixel frames, 7 video tokens,
    # 37 audio ticks, 0.925 s of audio trim.
    assert av.h3_overlap(1) == (5, 2, 8)
    assert av.h3_overlap(2) == (22, 7, 37)
    assert av.h3_overlap(3) == (39, 12, 65)

    def av_latent(tokens, ticks, fill):
        video = {"samples": torch.full((1, 4, tokens, 8, 6), float(fill))}
        sound = {"samples": torch.full((1, 32, 2, ticks), float(fill))}
        return LTXVConcatAVLatent.execute(video, sound)[0]

    prev = av_latent(12, 70, 2.0)
    new = av_latent(37, 207, 0.0)
    joint, frames, trim = av.NKDAVLatentExtend.execute(prev, new, overlap_chunks=2).args
    assert (frames, trim) == (22, 0.925)

    v, a = joint["samples"].unbind()
    assert v.shape[2] == 37 and a.shape[-1] == 207       # output length IS the new segment's
    assert float(v[:, :, :7].min()) == 2.0               # planted tail from previous
    assert float(v[:, :, 7:].abs().max()) == 0.0
    assert float(a[..., :37].min()) == 2.0
    assert float(a[..., 37:].abs().max()) == 0.0

    vm, am = joint["noise_mask"].unbind()
    assert float(vm[:7].max()) == 0.0 and float(vm[7:].min()) == 1.0    # 0=keep, 1=generate
    assert am.shape == a.shape                            # audio mask in the latent's own shape
    assert float(am[..., :37].max()) == 0.0 and float(am[..., 37:].min()) == 1.0

    # A plain (non-AV) latent must be refused: unbind() on it would silently
    # split the batch axis and read garbage as audio.
    try:
        av.NKDAVLatentExtend.execute({"samples": torch.zeros(1, 4, 37, 8, 6)}, new)
        raise SystemExit("a non-AV latent should have been refused")
    except ValueError:
        pass

    # Too short on either side is an error, not a silent partial plant.
    for bad_prev, bad_new in ((av_latent(5, 20, 2.0), new), (prev, av_latent(7, 37, 0.0))):
        try:
            av.NKDAVLatentExtend.execute(bad_prev, bad_new, overlap_chunks=2)
            raise SystemExit("an overlap that does not fit should have been refused")
        except ValueError:
            pass

    print("av latent OK")


if __name__ == "__main__":
    demo()
