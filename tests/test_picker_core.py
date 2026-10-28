"""Checks for NKD Mask Picker's pure helpers. Plain asserts, no framework.

    python tests/test_picker_core.py
"""

import os
import sys

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PACK)

import numpy as np  # noqa: E402
import torch  # noqa: E402

import picker_core as core  # noqa: E402


def test_parse_selection():
    assert core.parse_selection("") == []
    picks = core.parse_selection('{"picks": [{"x": 0.5, "y": 1.0, "level": 2, "mode": "sub"},'
                                 ' {"x": 0, "y": 0.25, "level": 0}]}')
    assert picks == [{"x": 0.5, "y": 1.0, "level": 2, "mode": "sub", "group": -1},
                     {"x": 0.0, "y": 0.25, "level": 0, "mode": "add", "group": -2}], picks   # no group: each its own
    picks = core.parse_selection('{"picks": [{"x": 0.5, "y": 0.5, "level": 1, "mode": "add", "group": 3},'
                                 ' {"points": [[0.1, 0.2], [0.3, 0.4]], "level": 1, "mode": "add", "group": 3}]}')
    assert picks[0]["group"] == picks[1]["group"] == 3 and "x" not in picks[1]
    assert picks[1]["points"] == [[0.1, 0.2], [0.3, 0.4]] and "labels" not in picks[1]
    picks = core.parse_selection('{"picks": [{"points": [[0.1, 0.2], [0.3, 0.4]], "labels": [1, 0], "level": 0, "group": 0}]}')
    assert picks[0]["labels"] == [1, 0]


def test_rle_roundtrip():
    rng = np.random.default_rng(0)
    for first in (False, True):
        m = rng.random((7, 9)) > 0.6
        m[0, 0] = first
        runs = core.rle(m)
        assert sum(runs) == m.size and (runs[0] == 0) == first
        assert np.array_equal(core.unrle(runs, 7, 9), m)
    assert core.rle(np.zeros((2, 3), bool)) == [6]
    assert core.rle(np.ones((2, 3), bool)) == [0, 6]


def test_box_and_compose():
    a = torch.zeros(10, 20); a[2:6, 3:9] = 1
    b = torch.zeros(10, 20); b[4:8, 6:12] = 1
    assert core.box_of(a) == [3, 2, 9, 6]
    assert core.box_of(torch.zeros(4, 4)) is None
    mask, added = core.compose([a, b, a], ["add", "add", "sub"], torch.zeros(10, 20))
    assert len(added) == 1 and torch.equal(added[0], b * (1 - a))   # a cut away entirely, b keeps a hole
    assert mask[3, 4] == 0 and mask[7, 10] == 1 and mask[5, 7] == 0   # the cut wins where it overlaps
    _, added = core.compose([b, a, b], ["add", "sub", "add"], torch.zeros(10, 20))
    assert len(added) == 2 and torch.equal(added[0], b * (1 - a)) and torch.equal(added[1], b)   # a cut only reaches back
    assert core.bbox_frame([a, b]) == [[{"x": 3, "y": 2, "width": 6, "height": 4},
                                       {"x": 6, "y": 4, "width": 6, "height": 4}]]
    assert core.bbox_frame([]) == [[]]
    none, added = core.compose([a], ["sub"], torch.zeros(10, 20))
    assert not none.any() and added == []


def test_merge_groups():
    a = torch.zeros(10, 20); a[2:6, 3:9] = 1
    b = torch.zeros(10, 20); b[4:8, 6:12] = 1
    c = torch.zeros(10, 20); c[0:2, 15:20] = 1
    merged = core.merge_groups([a, b, c, b, a], ["add", "add", "add", "sub", "sub"], [5, 5, 6, 7, 7])
    assert [(len(p), mode) for p, mode in merged] == [(2, "add"), (1, "add"), (1, "sub"), (1, "sub")]
    assert merged[0][0][1] is b and merged[1][0][0] is c                                     # a and b: one entry, at a
    mask, added = core.compose([torch.stack(p).amax(0) for p, _ in merged], [mode for _, mode in merged], torch.zeros(10, 20))
    assert mask[3, 4] == 0 and mask[7, 11] == 0 and mask[0, 16] == 1   # the cuts cut the combined mask
    assert len(added) == 1 and core.bbox_frame(added) == [[{"x": 15, "y": 0, "width": 5, "height": 2}]]   # and the a+b entry, cut away whole


def test_solid():
    p = torch.zeros(40, 60); p[5:30, 5:25] = 1
    q = torch.zeros(40, 60); q[5:30, 26:50] = 1                      # two pieces touching but for a 1 px gap
    out = core.solid([p, q], 2)
    assert out.dtype == p.dtype and out[5:30, 5:50].all() and out.sum() == 25 * 45   # bridged, no bump at its ends
    assert core.label(out.numpy() > 0.5)[1] == 1
    q6 = torch.zeros(40, 60); q6[5:30, 31:50] = 1                     # a 6 px gap, between radius and 2 * radius
    out = core.solid([p, q6], 4)
    assert out[5:30, 5:50].all() and core.label(out.numpy() > 0.5)[1] == 1   # bridged whole, no floating strip
    ell = torch.zeros(40, 60); ell[5:35, 10:14] = 1; ell[31:35, 10:40] = 1   # an L, its concavity to the right
    ell[5:29, 16:18] = 1                                              # its own 2 px gap, next to its own arm
    side = torch.zeros(40, 60); side[5:35, 5:9] = 1                   # a second piece, 1 px left of the L
    out = core.solid([ell, side], 2)
    assert out[20, 9] == 1                                            # the gap between the pieces closes
    assert out[20, 14] == 0 and out[20, 15] == 0 and out[20, 30] == 0   # the L's own gap and concavity stay open
    yy, xx = np.mgrid[:100, :100]
    r2 = (yy - 50) ** 2 + (xx - 50) ** 2
    ring = torch.from_numpy(((r2 < 40 ** 2) & (r2 >= 20 ** 2)).astype(np.float32))
    pin = ring.clone(); pin[20, 50] = 0                              # a pinhole in the band: filled
    out = core.solid([pin], 2)
    assert out[50, 50] == 0 and out[20, 50] == 1                     # the big hole stays, the pinhole is gone
    assert (out.numpy()[r2 < 20 ** 2] == 0).mean() > 0.9


def test_drop_specks():
    m = torch.zeros(40, 60); m[5:25, 10:30] = 1
    m[0, 59] = m[39, 0] = m[30, 50] = 1
    out = core.drop_specks(m)
    assert out.dtype == m.dtype and out.sum() == 400 and out[5, 10] == 1 and out[0, 59] == 0
    assert not core.drop_specks(torch.zeros(4, 4)).any()
    m[10, 20] = 0; m[24, 29] = 0                                      # a pinhole inside, a notch on the edge
    out = core.drop_specks(m)
    assert out[10, 20] == 1 and out[24, 29] == 0 and out.sum() == 399   # the notch is open background
    ring = np.zeros((40, 40), bool); ring[5:35, 5:35] = True; ring[15:25, 15:25] = False   # a big hole stays
    assert not core.clean(ring)[20, 20]


def test_trimap():
    yy, xx = np.mgrid[:200, :300]
    disc = (yy - 100) ** 2 + (xx - 150) ** 2 < 60 ** 2
    t = core.trimap(disc, 0.08)
    assert t.dtype == np.float32 and set(np.unique(t)) == {0, 0.5, 1}
    assert t[100, 150] == 1 and t[0, 0] == 0
    band = (t[100, 150:] == 0.5) & ~disc[100, 150:]                  # outward along the row from the centre
    assert abs(band.sum() - 0.08 * 120) <= 1, band.sum()             # 120 = the disc's long side, not the array's
    i = np.arange(100)                                               # outward along the diagonal: a round band
    reach = ((t[100 + i, 150 + i] == 0.5) & ~disc[100 + i, 150 + i]).sum() * np.sqrt(2)
    assert abs(reach - band.sum()) <= 1.5, (reach, band.sum())
    big = np.zeros((600, 900), bool); big[200:400, 300:600] = disc
    assert np.array_equal(core.trimap(big, 0.08)[200:400, 300:600], t)   # same object, bigger array, same trimap
    for width in (1, 2, 3):                                          # thin lines keep a foreground core
        line = np.zeros((100, 100), bool); line[10:90, 49:49 + width] = True
        assert (core.trimap(line, 0.08) == 1).any(), width
    t0 = core.trimap(disc, 0.0)
    assert t0[100, 150] == 1 and t0[0, 0] == 0 and (t0 == 0.5).any()
    assert not core.trimap(np.zeros((30, 40), bool), 0.08).any()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
