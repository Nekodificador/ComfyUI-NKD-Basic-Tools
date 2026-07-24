"""Wheel-mode hue remap: display angle <-> engine OKLCh hue (numpy only).

A wheel mode is a monotonic anchor table (display_deg, oklch_hue_deg) — the
projection between what the viewer shows and the engine's OKLCh hue. The mesh
is ALWAYS stored in engine space; switching wheel modes never touches the data.
Hue columns are measured OKLCh hues of the anchor sRGB colors (see
tests/test_colorwarp_ryb.py). Display column must be strictly increasing and
span 0..360; hue column strictly increasing with hue[-1] == hue[0] + 360
(wrap-continuous — it need not start at 0).
"""
import numpy as np

# Painter's RYB wheel: R/O/Y/G/B/V evenly spaced on display.
RYB_ANCHORS = [
    (0.0,   29.2339),   # red
    (60.0,  52.7757),   # orange
    (120.0, 109.7692),  # yellow
    (180.0, 142.4953),  # green
    (240.0, 264.0520),  # blue
    (300.0, 293.7740),  # violet
    (360.0, 389.2339),  # red (wrap)
]

# Classic RGB/HSL wheel: R/Y/G/C/B/M evenly spaced on display.
RGB_ANCHORS = [
    (0.0,   29.2339),   # red
    (60.0,  109.7692),  # yellow
    (120.0, 142.4953),  # green
    (180.0, 194.7689),  # cyan
    (240.0, 264.0520),  # blue
    (300.0, 328.3634),  # magenta
    (360.0, 389.2339),  # red (wrap)
]

# Native OKLCh wheel: display angle IS the engine hue.
OKLCH_ANCHORS = [(0.0, 0.0), (360.0, 360.0)]

DEFAULT_ANCHORS = RYB_ANCHORS


def _cols(anchors):
    a = np.asarray(anchors if anchors is not None else DEFAULT_ANCHORS, dtype=np.float64)
    return a[:, 0], a[:, 1]


def display_to_hue(display, anchors=None):
    xs, ys = _cols(anchors)
    return np.interp(np.asarray(display, dtype=np.float64) % 360.0, xs, ys) % 360.0


def hue_to_display(hue, anchors=None):
    xs, ys = _cols(anchors)
    # Shift hue into the table's wrap window [ys[0], ys[0] + 360).
    h = (np.asarray(hue, dtype=np.float64) - ys[0]) % 360.0 + ys[0]
    return np.interp(h, ys, xs) % 360.0
