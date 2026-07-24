"""Polar control-point mesh + displacement field (numpy only, engine OKLCh space).

Grid: (sat_rings+1) rings x hue_segments segments. offsets[ring][seg] = (dh, ds, dl).
dh (absolute hue rotation, deg) and ds (sat delta) define each NODE's
destination. Between nodes the field interpolates CARTESIAN displacement
vectors on the unit chroma disc (dest minus base, bilinear) — 3DLC-style.
Interpolating polar (dh, ds) instead has a ±180 seam: dragging a node across
the wheel flips the sign of its stored rotation and every in-between pixel
jumps to the opposite sweep direction. Vectors are wrap-free; long moves carry
in-between colors along the chord (through neutral), exactly like 3DLC.
Ring 0 is never edited (all zeros), so displacement fades linearly toward the
centre: an arm dragged elsewhere maps its whole radial segment onto the
straight centre→node line (muted cyan → muted red), and gray stays fixed.
dl interpolates bilinearly, fading to ring 0.

"hues" (optional): the ENGINE OKLCh hue anchoring each column, strictly
ascending from hues[0] in [0,360) (later values may exceed 360 — one wrap).
The UI generates them by projecting its wheel layout through the active wheel-
mode table, so a column's cell is centred exactly where its node is drawn.
None/absent = uniform engine hues (sj*360/S, the legacy layout).
"""
import numpy as np


def identity(hue_segments=12, sat_rings=6, hues=None):
    return {
        "hue_segments": int(hue_segments),
        "sat_rings": int(sat_rings),
        "offsets": np.zeros((sat_rings + 1, hue_segments, 3), dtype=np.float64),
        # Global neutral cast: an OKLab (a, b) offset added to every pixel (the
        # draggable centre node). Not scaled by sat, so it tints the neutral too.
        "neutral": [0.0, 0.0],
        "hues": None if hues is None else [float(x) for x in hues],
    }


def constant(hue_segments=12, sat_rings=6, dh=0.0, ds=0.0, dl=0.0):
    m = identity(hue_segments, sat_rings)
    m["offsets"][:, :, 0] = dh
    m["offsets"][:, :, 1] = ds
    m["offsets"][:, :, 2] = dl
    return m


def to_dict(m):
    hues = m.get("hues")
    return {
        "hue_segments": m["hue_segments"],
        "sat_rings": m["sat_rings"],
        "offsets": np.asarray(m["offsets"]).tolist(),
        "neutral": [float(x) for x in m.get("neutral", [0.0, 0.0])],
        "hues": None if hues is None else [float(x) for x in hues],
    }


def from_dict(d):
    off = np.asarray(d["offsets"], dtype=np.float64)
    hues = d.get("hues")
    return {"hue_segments": int(d["hue_segments"]),
            "sat_rings": int(d["sat_rings"]),
            "offsets": off,
            "neutral": [float(x) for x in d.get("neutral", [0.0, 0.0])],
            "hues": None if hues is None else [float(x) for x in hues]}


def column_hues(m):
    """Column anchor hues as an ascending array (uniform when 'hues' absent)."""
    h = m.get("hues")
    if h is None:
        S = m["hue_segments"]
        return np.arange(S, dtype=np.float64) * (360.0 / S)
    return np.asarray(h, dtype=np.float64)


def sample(m, hue_deg, sat_norm):
    """Return (dh, ds, dl) arrays for the given hue (deg) and sat (0..1) arrays."""
    off = m["offsets"]
    R = m["sat_rings"]
    S = m["hue_segments"]
    hue = np.asarray(hue_deg, dtype=np.float64) % 360.0
    sat = np.clip(np.asarray(sat_norm, dtype=np.float64), 0.0, 1.0)

    rf = sat * R
    ri = np.floor(rf).astype(int)
    ri = np.clip(ri, 0, R - 1)
    rt = rf - ri

    # Angular cell lookup over the (possibly non-uniform) column hues.
    hs = column_hues(m)
    hs_ext = np.append(hs, hs[0] + 360.0)
    h2 = (hue - hs[0]) % 360.0 + hs[0]
    sj = np.clip(np.searchsorted(hs_ext, h2, side="right") - 1, 0, S - 1)
    st = (h2 - hs_ext[sj]) / (hs_ext[sj + 1] - hs_ext[sj])
    sj1 = (sj + 1) % S

    # Cartesian displacement vectors on the unit disc (see header): each corner
    # node's (dh, ds) gives its destination point; bilinear on dest-minus-base.
    def disp(rr, ss):
        base_sat = rr / R
        bh = np.radians(hs[ss])
        ang = bh + np.radians(off[rr, ss, 0])
        dsat = np.clip(base_sat + off[rr, ss, 1], 0.0, None)
        return (dsat * np.cos(ang) - base_sat * np.cos(bh),
                dsat * np.sin(ang) - base_sat * np.sin(bh))

    x00, y00 = disp(ri, sj)
    x01, y01 = disp(ri, sj1)
    x10, y10 = disp(ri + 1, sj)
    x11, y11 = disp(ri + 1, sj1)
    vx = (x00 * (1 - st) + x01 * st) * (1 - rt) + (x10 * (1 - st) + x11 * st) * rt
    vy = (y00 * (1 - st) + y01 * st) * (1 - rt) + (y10 * (1 - st) + y11 * st) * rt

    hr = np.radians(hue)
    ux = sat * np.cos(hr) + vx
    uy = sat * np.sin(hr) + vy
    sat2 = np.hypot(ux, uy)
    out_h = np.degrees(np.arctan2(uy, ux))
    # dh as the wrapped representative (label only — the field is the vector)
    dh = np.where(sat2 > 1e-12, ((out_h - hue + 180.0) % 360.0) - 180.0, 0.0)
    ds = sat2 - sat

    # dl: plain bilinear (fades to ring 0 = zero toward the centre).
    dl = ((off[ri, sj, 2] * (1 - st) + off[ri, sj1, 2] * st) * (1 - rt) +
          (off[ri + 1, sj, 2] * (1 - st) + off[ri + 1, sj1, 2] * st) * rt)
    return dh, ds, dl
