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

    # a +20deg hue push on every point rotates a saturated pixel by ~+20,
    # but a near-gray pixel (sat~0) barely moves (center handling)
    m2 = mesh.constant(hue_segments=12, sat_rings=6, dh=20.0)
    dh_sat, _, _ = mesh.sample(m2, np.array([100.0]), np.array([1.0]))
    dh_gray, _, _ = mesh.sample(m2, np.array([100.0]), np.array([0.02]))
    assert abs(dh_sat[0] - 20.0) < 1e-6, dh_sat
    assert abs(dh_gray[0]) < 1.0, dh_gray  # scaled by sat -> ~0.4

    # hue wrap: sampling at 359.9 and 0.1 give continuous results
    m3 = mesh.from_dict(json.loads(json.dumps(mesh.to_dict(m2))))  # round-trip JSON
    a, _, _ = mesh.sample(m3, np.array([359.9]), np.array([1.0]))
    b, _, _ = mesh.sample(m3, np.array([0.1]), np.array([1.0]))
    assert abs(a[0] - b[0]) < 1e-6

    print("mesh OK")


if __name__ == "__main__":
    demo()
