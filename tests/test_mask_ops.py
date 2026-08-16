"""Self-check for the mask morphology engine. Pure torch (runs on CPU):
python tests/test_mask_ops.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mask_core import (audio_ramp, latent_grid, process, to_audio_latent, to_latent,  # noqa: E402
                       token_patch)


def demo():
    # A 40×40 blob at (30..70) plus a 2px speck, on a 100×100 frame.
    m = torch.zeros(1, 100, 100)
    m[0, 30:70, 30:70] = 1.0
    m[0, 5:7, 5:7] = 1.0

    # Levels: black_point == white_point is a hard threshold.
    soft = torch.tensor([[[0.0, 0.3, 0.6, 1.0]]])
    hard = process(soft, black_point=0.5, white_point=0.5)
    assert hard.tolist() == [[[0.0, 0.0, 1.0, 1.0]]], hard

    # Despeckle drops the speck and leaves the blob byte-identical (the point of
    # reconstruction: a plain opening would round the blob's corners).
    clean = process(m, despeckle_px=3)
    assert clean[0, 5:7, 5:7].max() == 0.0
    assert torch.equal(clean[0, 30:70, 30:70], m[0, 30:70, 30:70])
    assert clean.sum() == m[0, 30:70, 30:70].sum()

    # Fill holes: a ring's interior is filled, the outside is untouched.
    ring = m.clone()
    ring[0, 40:60, 40:60] = 0.0
    filled = process(ring, fill=True)
    assert torch.equal(filled[0], m[0])

    # Close gaps bridges a 4px crack without growing the outer bounds.
    cracked = m.clone()
    cracked[0, :, 48:52] = 0.0
    closed = process(cracked, close_px=3)
    assert closed[0, 50, 50] == 1.0
    assert closed[0, 50, 29] == 0.0 and closed[0, 29, 50] == 0.0

    # Expand / contract move the edge by exactly the requested pixels.
    grown = process(m, expand_px=5)
    assert grown[0, 25, 50] == 1.0 and grown[0, 24, 50] == 0.0
    shrunk = process(m, expand_px=-5)
    assert shrunk[0, 35, 50] == 1.0 and shrunk[0, 34, 50] == 0.0

    # Blockify snaps to the grid: an off-grid edge lands on a multiple of 16.
    off = torch.zeros(1, 64, 64)
    off[0, :, 20:44] = 1.0
    blocks = process(off, blockify_px=16, blockify_threshold=0.5)
    row = blocks[0, 0]
    assert row[16] == 1.0 and row[15] == 0.0 and row[47] == 1.0 and row[48] == 0.0
    # Coverage 0 keeps the block average instead of a binary block.
    gray = process(off, blockify_px=16, blockify_threshold=0.0)
    assert abs(float(gray[0, 0, 0]) - 0.0) < 1e-6
    assert abs(float(gray[0, 0, 16]) - 0.75) < 1e-6

    # Feather softens the edge symmetrically around the original boundary.
    soft_edge = process(m, feather_px=9)
    assert 0.0 < float(soft_edge[0, 29, 50]) < 1.0
    assert abs(float(soft_edge[0, 30, 50]) + float(soft_edge[0, 29, 50]) - 1.0) < 0.2

    # Temporal expand: a mask present on one frame only reaches its neighbours.
    clip = torch.zeros(5, 8, 8)
    clip[2, 3:5, 3:5] = 1.0
    spread = process(clip, temporal_expand_frames=1)
    assert spread[1].sum() == 4 and spread[3].sum() == 4
    assert spread[0].sum() == 0 and spread[4].sum() == 0

    # Temporal smooth averages the flicker instead of holding the maximum.
    smoothed = process(clip, temporal_smooth_frames=1)
    assert abs(float(smoothed[2, 3, 3]) - 1 / 3) < 1e-6

    # Latent grid read off the VAE's own API. These stand in for the real
    # objects: comfy/sd.py gives image VAEs an int downscale_ratio and video
    # VAEs a (callable, 8, 8) tuple whose callable maps frame count -> latents.
    class _ImageVae:
        downscale_ratio = 8
        def spacial_compression_encode(self):  # noqa: E301
            return 8

    class _VideoVae:
        downscale_ratio = (lambda a: max(0, (a + 3) // 4), 8, 8)
        def spacial_compression_encode(self):  # noqa: E301
            return 8

    assert latent_grid(_ImageVae(), 1) == (8, None)
    assert latent_grid(_ImageVae(), 9)[1] is None
    stride, groups = latent_grid(_VideoVae(), 9)
    # 9 frames -> 3 latents: 0-3 share one, 4-7 the next, frame 8 gets its own.
    assert stride == 8 and groups.tolist() == [0, 0, 0, 0, 1, 1, 1, 1, 2]
    frames = 9
    clip = torch.zeros(frames, 8, 8)
    clip[5, 3:5, 3:5] = 1.0                      # one masked frame mid-group
    quant = process(clip, time_groups=groups)
    assert [float(f.sum()) for f in quant] == [0, 0, 0, 0, 4, 4, 4, 4, 0]

    # A chunking encoder (MiniMax H3: 17-frame clips, temporal ratio 4) is read
    # from the encoder, not from its total-count downscale_ratio: 17k+5 frames
    # must land on 5k+2 latents, in [1,4,4,4,4] runs per clip.
    class _ChunkVae:
        class first_stage_model:
            clip_length, vae_ratio_t = 17, 4
        downscale_ratio = (lambda a: max(1, (a - 5) // 17 * 5 + 2) if a > 1 else 1, 16, 16)
        def spacial_compression_encode(self):  # noqa: E301
            return 16

    for n, latents in ((5, 2), (22, 7), (39, 12)):
        _, g = latent_grid(_ChunkVae(), n)
        runs = torch.unique_consecutive(g, return_counts=True)[1].tolist()
        assert len(runs) == latents and sum(runs) == n, (n, runs)
        assert runs[:5] == [1, 4, 4, 4, 4][:len(runs)]

    # A model that reads the mask itself acts per token, so the block grows to
    # cover one; a model that never sees it leaves the latent as the unit.
    class _Model:
        def __init__(self, reads, patch=(1, 2, 2)):
            self.dm = type("DM", (), {"patch_size": patch})()
            self.dm.forward = (lambda x, denoise_mask=None: x) if reads else (lambda x: x)

        def get_model_object(self, name):
            return self.dm

    assert token_patch(_Model(reads=True)) == 2
    assert token_patch(_Model(reads=False)) == 1
    assert token_patch(_Model(reads=True, patch=1)) == 1   # LTX: one latent per token
    assert token_patch(object()) == 1                      # anything unrecognizable

    # The latent-resolution output lands each frame on its own latent. Straight
    # to Set Latent Noise Mask nothing resamples it, which on this grid would
    # drop the leading one-frame latent entirely and shift the rest.
    stride, groups = latent_grid(_ChunkVae(), 22)
    for target in range(int(groups.max()) + 1):
        src = torch.zeros(22, 64, 64)
        src[groups == target, 16:48, 16:48] = 1.0
        lat = to_latent(process(src, time_groups=groups), stride, groups)
        on = [i for i, f in enumerate(lat) if float(f.max()) > 0]
        assert on == [target], (target, on)
        assert lat.shape == (int(groups.max()) + 1, 4, 4), lat.shape

    # Invert, and the second output of the node is the complement.
    inv = process(m, invert=True)
    assert torch.equal(inv[0], 1.0 - m[0])

    # Shape, dtype and device survive the round trip; a no-op is a no-op.
    assert process(m).shape == m.shape
    assert torch.equal(process(m), m)

    # Audio: 124 frames at 24 fps against MiniMax H3's 207 audio latents.
    frames, audio_t = 124, 207
    src = torch.zeros(frames, 8, 8)
    src[:62, 2:4, 2:4] = 1.0                    # first half of the clip, a corner of the frame
    a = to_audio_latent(src, audio_t)
    assert a.shape == (1, 1, 1, audio_t), a.shape
    on = (a[0, 0, 0] > 0).nonzero().flatten().tolist()
    assert on[0] == 0 and on == list(range(len(on)))          # one contiguous run from the start
    assert abs(len(on) - audio_t * 62 / frames) <= 1, len(on)  # ends where the video mask does

    # A single masked frame is shorter than a video latent but must still reach
    # the audio — a uniform resample of the latent-space mask would drop it.
    one = torch.zeros(frames, 8, 8)
    one[100, 0, 0] = 1.0
    hit = (to_audio_latent(one, audio_t)[0, 0, 0] > 0).nonzero().flatten().tolist()
    assert hit and all(abs(i - 100 * audio_t / frames) <= 2 for i in hit), hit

    # No mask, no audio touched; and the pooling is max, not mean, so a mask that
    # covers one pixel of a frame still opens that frame's audio fully.
    assert to_audio_latent(torch.zeros(frames, 8, 8), audio_t).max() == 0.0
    assert to_audio_latent(one, audio_t).max() == 1.0

    # Edge range: squeeze the soft part of a feathered edge into a narrow band, because
    # a per-token model only reacts between about 0.85 and 0.95. The extremes must NOT
    # move - sending the preserved side to 0.85 would start regenerating it.
    ramp = torch.linspace(0.0, 1.0, 11).reshape(1, 1, 11).repeat(1, 4, 1)
    out = process(ramp, edge_low=0.85, edge_high=0.95)
    assert float(out[0, 0, 0]) == 0.0                     # fully preserved stays exact
    assert float(out[0, 0, -1]) == 1.0                    # fully generated stays exact
    mid = out[0, 0, 1:-1]
    assert float(mid.min()) >= 0.85 and float(mid.max()) <= 0.95, mid
    assert bool((mid[1:] > mid[:-1]).all())               # still monotone: it is a ramp
    # The band is where the model actually reacts, so the ramp has to SPAN it, not sit
    # in a corner of it - that is the whole difference from a plain 0..1 feather.
    assert float(mid.max() - mid.min()) > 0.07, mid
    # Left at 0/1 it is a no-op, so nobody pays for a widget they did not touch.
    assert torch.equal(process(ramp), process(ramp, edge_low=0.0,
                                                                  edge_high=1.0))
    # A gaussian feather leaves 0.9997, not 1.0: an exact == 1 test would drag the
    # plateau into the ramp and lift the whole masked area off white.
    soft = torch.zeros(1, 64, 64)
    soft[:, 16:48, 16:48] = 1.0
    feathered = process(soft, feather_px=9, edge_low=0.85, edge_high=0.95)
    assert float(feathered[0, 32, 32]) == 1.0, float(feathered[0, 32, 32])
    assert float(feathered[0, 0, 0]) == 0.0

    # Audio ramp: the run-up lives in the PRESERVED tail and rises toward the cut;
    # the generated stretch is untouched — the first generated tick is already 1.
    track = torch.zeros(1, 1, 1, 40)
    track[..., 20:] = 1.0                       # preserve 0..19, generate 20..39
    ramped = audio_ramp(track, 8, "cosine")
    assert torch.equal(ramped[..., 20:], track[..., 20:])       # generate side untouched
    assert float(ramped[..., :12].max()) == 0.0                  # deep preserve untouched
    run_up = ramped[0, 0, 0, 12:20]
    assert bool((run_up[1:] > run_up[:-1]).all()), run_up        # rising toward the cut
    assert float(run_up.min()) >= 0.0599 and float(run_up.max()) <= 0.9901, run_up
    # In and out are separate knobs. With out at 0 (the default) the return to the
    # original is a HARD cut: only the entrance of a mid-clip gap gets a ramp.
    gap = torch.ones(1, 1, 1, 40)
    gap[..., :15] = 0.0
    gap[..., 25:] = 0.0                          # generate 15..24, preserve around it
    g = audio_ramp(gap, 4, "high band")
    assert torch.equal(g[..., 15:25], gap[..., 15:25])
    assert float(g[0, 0, 0, 14]) > float(g[0, 0, 0, 11])         # rises into the gap
    assert float(g[0, 0, 0, 14]) >= 0.85                         # high band starts high
    assert float(g[..., 25:].max()) == 0.0                       # exit stays a hard cut
    # Asking for a ramp out gives the exit its own descent, without touching the in.
    g2 = audio_ramp(gap, 0, "cosine", out_ticks=4)
    assert float(g2[..., :15].max()) == 0.0                      # entrance untouched now
    assert float(g2[0, 0, 0, 25]) > float(g2[0, 0, 0, 28])       # descends back out
    # ticks=0 is a no-op, and a seamless track (all 0 / all 1) has nothing to ramp.
    assert torch.equal(audio_ramp(track, 0), track)
    assert torch.equal(audio_ramp(torch.ones(1, 1, 1, 10), 4), torch.ones(1, 1, 1, 10))

    print("mask ops OK")


if __name__ == "__main__":
    demo()
