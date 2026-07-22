"""Polar control-point mesh + displacement field (numpy only, engine OKLCh space).

Grid: (sat_rings+1) rings x hue_segments segments. offsets[ring][seg] = (dh, ds, dl).
Sampling bilinearly interpolates offsets; hue offset scaled by sat (center safe).
"""
import numpy as np


def identity(hue_segments=12, sat_rings=6):
    return {
        "hue_segments": int(hue_segments),
        "sat_rings": int(sat_rings),
        "offsets": np.zeros((sat_rings + 1, hue_segments, 3), dtype=np.float64),
    }


def constant(hue_segments=12, sat_rings=6, dh=0.0, ds=0.0, dl=0.0):
    m = identity(hue_segments, sat_rings)
    m["offsets"][:, :, 0] = dh
    m["offsets"][:, :, 1] = ds
    m["offsets"][:, :, 2] = dl
    return m


def to_dict(m):
    return {
        "hue_segments": m["hue_segments"],
        "sat_rings": m["sat_rings"],
        "offsets": np.asarray(m["offsets"]).tolist(),
    }


def from_dict(d):
    off = np.asarray(d["offsets"], dtype=np.float64)
    return {"hue_segments": int(d["hue_segments"]),
            "sat_rings": int(d["sat_rings"]),
            "offsets": off}


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

    sf = (hue / 360.0) * S
    sj = np.floor(sf).astype(int) % S
    st = sf - np.floor(sf)
    sj1 = (sj + 1) % S

    def corner(rr, ss):
        return off[rr, ss, :]  # (..., 3)

    c00 = corner(ri, sj)
    c01 = corner(ri, sj1)
    c10 = corner(ri + 1, sj)
    c11 = corner(ri + 1, sj1)
    st_ = st[..., None]
    rt_ = rt[..., None]
    top = c00 * (1 - st_) + c01 * st_
    bot = c10 * (1 - st_) + c11 * st_
    val = top * (1 - rt_) + bot * rt_  # (..., 3)

    dh = val[..., 0] * sat  # center-safe: no hue push at gray
    ds = val[..., 1]
    dl = val[..., 2]
    return dh, ds, dl
