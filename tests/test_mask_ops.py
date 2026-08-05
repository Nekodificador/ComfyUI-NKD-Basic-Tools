"""Self-check for the mask morphology engine. Pure torch (runs on CPU):
python tests/test_mask_ops.py"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mask_core import latent_grid, process  # noqa: E402


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

    # Invert, and the second output of the node is the complement.
    inv = process(m, invert=True)
    assert torch.equal(inv[0], 1.0 - m[0])

    # Shape, dtype and device survive the round trip; a no-op is a no-op.
    assert process(m).shape == m.shape
    assert torch.equal(process(m), m)

    print("mask ops OK")


if __name__ == "__main__":
    demo()
