"""Adjustable RYB hue-angle remap (numpy only).

display angle (painter's RYB wheel) <-> engine hue angle (HSL/OKLCh).
Both are degrees in [0, 360). Defined by a monotonic anchor table so the
mapping is bijective and wrap-continuous. The table is the calibration knob.
"""
import numpy as np

# (display_deg, hue_deg). Must be strictly increasing in both columns and
# span 0..360 with matching endpoints. RYB primaries R/Y/B evenly at 0/120/240.
DEFAULT_ANCHORS = [
    (0.0,   0.0),    # red
    (60.0,  30.0),   # orange
    (120.0, 60.0),   # yellow
    (180.0, 120.0),  # green
    (240.0, 240.0),  # blue
    (300.0, 290.0),  # violet
    (360.0, 360.0),  # red (wrap)
]


def _cols(anchors):
    a = np.asarray(anchors if anchors is not None else DEFAULT_ANCHORS, dtype=np.float64)
    return a[:, 0], a[:, 1]


def display_to_hue(display, anchors=None):
    xs, ys = _cols(anchors)
    return np.interp(np.asarray(display, dtype=np.float64) % 360.0, xs, ys) % 360.0


def hue_to_display(hue, anchors=None):
    xs, ys = _cols(anchors)
    return np.interp(np.asarray(hue, dtype=np.float64) % 360.0, ys, xs) % 360.0
