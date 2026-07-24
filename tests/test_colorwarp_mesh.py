import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import mesh


def demo():
    m = mesh.identity(hue_segments=12, sat_rings=6)

    # identity mesh -> zero displacement everywhere
    hue = np.array([0., 90., 200., 359.])
    sat = np.array([0.2, 0.7, 1.0, 0.5])
    dh, ds, dl = mesh.sample(m, hue, sat)
    assert np.allclose(dh, 0) and np.allclose(ds, 0) and np.allclose(dl, 0)

    # a +20deg hue push rotates by +20 at EVERY sat ON a column (exact there);
    # mid-cell the Cartesian (3DLC-style) vector interp follows the chord:
    # hue stays ~+20 and chroma dips slightly. Gray safety is at the LUT level.
    m2 = mesh.constant(hue_segments=12, sat_rings=6, dh=20.0)
    dh_sat, _, _ = mesh.sample(m2, np.array([90.0]), np.array([1.0]))
    dh_gray, _, _ = mesh.sample(m2, np.array([90.0]), np.array([0.02]))
    assert abs(dh_sat[0] - 20.0) < 1e-6, dh_sat
    assert abs(dh_gray[0] - 20.0) < 1e-6, dh_gray
    dh_mid, ds_mid, _ = mesh.sample(m2, np.array([105.0]), np.array([1.0]))
    assert abs(dh_mid[0] - 20.0) < 2.0, dh_mid
    assert -0.06 < ds_mid[0] <= 1e-9, ds_mid  # chord chroma dip

    # hue wrap: warped ENDPOINTS at 359.9 and 0.1 are continuous (0.2 deg apart
    # at the source, so ~0.2 deg apart at the destination)
    m3 = mesh.from_dict(json.loads(json.dumps(mesh.to_dict(m2))))  # round-trip JSON
    a, _, _ = mesh.sample(m3, np.array([359.9]), np.array([1.0]))
    b, _, _ = mesh.sample(m3, np.array([0.1]), np.array([1.0]))
    d3 = ((359.9 + a[0]) - (0.1 + b[0]) + 180.0) % 360.0 - 180.0
    assert abs(d3) < 0.5, d3

    # non-uniform column hues: the cell anchors sit exactly on the given hues
    hues = [29.0, 53.0, 110.0, 142.0, 195.0, 264.0, 294.0, 328.0]
    m4 = mesh.identity(hue_segments=8, sat_rings=4, hues=hues)
    m4["offsets"][:, 2, 0] = 40.0  # only column 2 (110 deg)
    d_at, _, _ = mesh.sample(m4, np.array([110.0]), np.array([1.0]))
    assert abs(d_at[0] - 40.0) < 1e-9, d_at
    d_mid, _, _ = mesh.sample(m4, np.array([126.0]), np.array([1.0]))  # halfway to 142
    assert abs(d_mid[0] - 20.0) < 2.0, d_mid  # vector interp: ~half the push
    # JSON round-trip keeps hues; wrap window (hue < hues[0]) is continuous
    m5 = mesh.from_dict(json.loads(json.dumps(mesh.to_dict(m4))))
    assert m5["hues"] == hues
    m5["offsets"][:, 0, 0] = 10.0
    a2, _, _ = mesh.sample(m5, np.array([28.9]), np.array([1.0]))
    b2, _, _ = mesh.sample(m5, np.array([29.1]), np.array([1.0]))
    assert abs(a2[0] - b2[0]) < 0.1, (a2, b2)

    # wrap-independence: adjacent columns dragged to the SAME red target with
    # opposite wrap picks (-175 vs +155) send in-between pixels to that target
    # too (vector interp has no seam; old polar mixing stranded them in green).
    # At the rim both destinations coincide -> exact; mid-sat stays within a
    # few degrees (chord).
    m6 = mesh.identity(hue_segments=12, sat_rings=4)
    m6["offsets"][:, 7, 0] = -175.0  # column 7 (210 deg) -> 35 deg via green
    m6["offsets"][:, 8, 0] = +155.0  # column 8 (240 deg) -> 35 deg via magenta
    for h in [210.0, 215.0, 225.0, 235.0, 240.0]:
        dh6, _, _ = mesh.sample(m6, np.array([h]), np.array([1.0]))
        out = (h + dh6[0]) % 360.0
        err = (out - 35.0 + 180.0) % 360.0 - 180.0
        assert abs(err) < 3.0, (h, out)
    # continuity across the +-180 seam: a node swept across the wheel must move
    # in-between pixels smoothly (this was the violent scatter explosion)
    prev = None
    for rot in np.linspace(150.0, 210.0, 61):  # crosses 180
        m7 = mesh.identity(hue_segments=12, sat_rings=4)
        m7["offsets"][:, 7, 0] = ((rot + 180.0) % 360.0) - 180.0  # wrapped store
        dh7, ds7, _ = mesh.sample(m7, np.array([225.0]), np.array([0.7]))
        pt = ((225.0 + dh7[0]) % 360.0, 0.7 + ds7[0])
        if prev is not None:
            a0 = np.radians(prev[0]); a1 = np.radians(pt[0])
            d = np.hypot(prev[1] * np.cos(a0) - pt[1] * np.cos(a1),
                         prev[1] * np.sin(a0) - pt[1] * np.sin(a1))
            assert d < 0.05, (rot, prev, pt, d)
        prev = pt

    print("mesh OK")


if __name__ == "__main__":
    demo()
