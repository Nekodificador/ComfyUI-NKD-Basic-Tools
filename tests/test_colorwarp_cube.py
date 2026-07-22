import os, sys, tempfile, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import cube, lut, mesh


def demo():
    L = lut.bake(mesh.constant(ds=0.2), size=17)
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "test.cube")
        cube.write(path, L, title="NKD Test")
        L2 = cube.read(path)
    assert L2.shape == L.shape
    assert np.abs(L - L2).max() < 1e-5, np.abs(L - L2).max()
    print("cube OK")


if __name__ == "__main__":
    demo()
