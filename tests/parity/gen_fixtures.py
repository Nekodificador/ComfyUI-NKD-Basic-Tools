"""Generate cross-language parity fixtures from color_core (source of truth).

Deterministic. Writes fixtures.json: a set of named meshes, a fixed list of input
RGB colors, and the expected bake+apply output for each mesh. The TS mirror
(tests/parity/parity_check.mjs) and the Python test must both reproduce these.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import numpy as np
from color_core import mesh as M, lut as L

SIZE = 17
EPS = 1e-4  # documented tolerance for the checkers


def _mixed():
    """A deterministic non-uniform mesh exercising interpolation, wrap and center."""
    m = M.identity(hue_segments=12, sat_rings=6)
    off = m["offsets"]
    R, S = m["sat_rings"], m["hue_segments"]
    for r in range(R + 1):
        for s in range(S):
            off[r, s, 0] = 18.0 * np.sin(2 * np.pi * s / S)      # dh
            off[r, s, 1] = 0.20 * (r / R) * np.cos(2 * np.pi * s / S)  # ds
            off[r, s, 2] = -0.10 * (r / R)                       # dl
    return m


def _input_colors():
    colors = []
    n = 6
    for i in range(n):
        for j in range(n):
            for k in range(n):
                colors.append([i / (n - 1), j / (n - 1), k / (n - 1)])  # 216 grid colors
    return np.array(colors, dtype=np.float64)


def main():
    neutral = M.identity()
    neutral["neutral"] = [0.08, -0.05]  # global cast (draggable centre node)
    meshes = {
        "identity": M.identity(),
        "hue+25": M.constant(dh=25.0),
        "sat+0.30": M.constant(ds=0.30),
        "luma-0.15": M.constant(dl=-0.15),
        "mixed": _mixed(),
        "neutral": neutral,
    }
    inputs = _input_colors()
    out = {"size": SIZE, "eps": EPS, "inputs": inputs.tolist(), "meshes": []}
    for name, m in meshes.items():
        lut = L.bake(m, size=SIZE)
        res = L.apply(lut, inputs)
        out["meshes"].append({
            "name": name,
            "mesh": M.to_dict(m),
            "expected": np.round(res, 8).tolist(),
        })
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print(f"wrote {path}: {len(out['meshes'])} meshes x {len(inputs)} colors, size={SIZE}")


if __name__ == "__main__":
    main()
