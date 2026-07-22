import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from color_core import mesh as M, lut as L


def demo():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity", "fixtures.json")
    fx = json.load(open(p, encoding="utf-8"))
    size, eps = fx["size"], fx["eps"]
    inputs = np.array(fx["inputs"], dtype=np.float64)
    for entry in fx["meshes"]:
        m = M.from_dict(entry["mesh"])
        got = L.apply(L.bake(m, size=size), inputs)
        exp = np.array(entry["expected"], dtype=np.float64)
        d = np.abs(got - exp).max()
        assert d < eps, f"{entry['name']} python drift {d}"
    print("parity(python) OK")


if __name__ == "__main__":
    demo()
