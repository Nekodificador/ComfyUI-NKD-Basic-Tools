import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import lut, mesh
import nkd_color_warp as ncw


def demo():
    rng = np.random.default_rng(2)
    img = rng.random((2, 16, 16, 3)).astype(np.float32)  # batch of 2, HWC

    mesh_json = json.dumps(mesh.to_dict(mesh.constant(dh=15.0, ds=0.1)))

    # apply_mesh_to_batch is the border helper: numpy in, numpy out, matches reference
    out = ncw.apply_mesh_to_batch(img, mesh_json, size=33)
    assert out.shape == img.shape and out.dtype == img.dtype

    L = lut.bake(mesh.from_dict(json.loads(mesh_json)), size=33)
    ref = lut.apply(L, img[0].astype(np.float64)).astype(np.float32)
    assert np.abs(out[0] - ref).max() < 1e-4, np.abs(out[0] - ref).max()

    # identity mesh is (near) a no-op
    ident = json.dumps(mesh.to_dict(mesh.identity()))
    out2 = ncw.apply_mesh_to_batch(img, ident, size=33)
    assert np.abs(out2 - img).max() < 0.02

    print("node OK")


if __name__ == "__main__":
    demo()
