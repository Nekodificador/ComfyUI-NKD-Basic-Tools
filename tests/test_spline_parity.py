"""The Vector Mask B-spline must be the NKD Sigmas Curve NURBS, exactly.

    python tests/test_spline_parity.py

Not a style preference — a requirement. The Sigmas Curve evaluator is the one
whose behaviour is known and liked, so this pins the editor's curve to it rather
than trusting that two hand-written implementations of "a cubic B-spline" agree.
They would not: knot vector, degree fallback for few points, and the rational
weighting are all places where a reasonable-looking choice gives a different
curve.

The check runs the real TypeScript through esbuild and node, so there are no
committed fixtures to go stale. Skips (rather than fails) when the sibling
Sigmas Curve pack or node is missing — this is a cross-repo check.

What is compared: every sample of the Python curve must lie ON the polyline the
TypeScript emits. The residual is bounded by the flattening budget, not by any
difference in the maths — adaptive sampling is allowed FLATTEN_TOL of error and
Douglas-Peucker another, hence the 2x.
"""
import json
import math
import os
import shutil
import subprocess
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGMAS = os.path.join(os.path.dirname(ROOT), "ComfyUI-NKD-Sigmas-Curve", "nkd_sigma_curve.py")
CACHE = os.path.join(ROOT, "node_modules", ".cache")
ESBUILD = os.path.join(ROOT, "node_modules", ".bin", "esbuild" + (".cmd" if os.name == "nt" else ""))

FLATTEN_TOL = 1 / 24576

# Control points, weights, and — the case that matters — two points almost on
# top of each other, where an interpolating spline would loop out past them.
HARNESS = """
import { flatten, type SplinePoint } from "../../src/splineEval";
const CASES: SplinePoint[][] = [
  [{x:0.05,y:0.10},{x:0.30,y:0.85},{x:0.55,y:0.20},{x:0.80,y:0.75},{x:0.95,y:0.30}],
  [{x:0.05,y:0.10},{x:0.30,y:0.85,w:4},{x:0.55,y:0.20,w:7},{x:0.80,y:0.75},{x:0.95,y:0.30}],
  [{x:0.10,y:0.50},{x:0.40,y:0.52},{x:0.405,y:0.525},{x:0.90,y:0.50}],
  [{x:0.20,y:0.20},{x:0.80,y:0.25},{x:0.70,y:0.80}],
];
console.log(JSON.stringify(CASES.map((c) => ({
  pts: c.map((p) => [p.x, p.y, p.w ?? 1]),
  poly: flatten(c, "bspline", false),
}))));
"""


def _sigmas_nurbs():
    """The NURBS block out of Sigmas Curve, without needing ComfyUI to import."""
    src = open(SIGMAS, encoding="utf-8").read()
    block = src[src.index("def _nurbs_knot_vector"):src.index("def _nurbs_build_table")]
    mod = types.ModuleType("sigmas_nurbs")
    exec(compile(block, "sigmas_nurbs", "exec"), mod.__dict__)
    return mod


def _ts_polylines():
    os.makedirs(CACHE, exist_ok=True)
    ts = os.path.join(CACHE, "nkd_parity_harness.ts")
    js = os.path.join(CACHE, "nkd_parity_harness.mjs")
    with open(ts, "w", encoding="utf-8") as fh:
        fh.write(HARNESS)
    subprocess.run([ESBUILD, ts, "--bundle", "--format=esm", "--platform=node",
                    "--outfile=" + js, "--log-level=warning"], check=True, cwd=ROOT)
    out = subprocess.run([shutil.which("node"), js], check=True, cwd=ROOT,
                         capture_output=True, text=True)
    return json.loads(out.stdout)


def _seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    if l2 < 1e-24:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def demo():
    if not os.path.exists(SIGMAS):
        print("skip: ComfyUI-NKD-Sigmas-Curve not next to this pack")
        return
    if not (os.path.exists(ESBUILD) and shutil.which("node")):
        print("skip: node/esbuild not available (run npm install)")
        return

    sc = _sigmas_nurbs()
    cases = _ts_polylines()
    budget = 2 * FLATTEN_TOL

    for k, case in enumerate(cases):
        pts = [[p[0], p[1]] for p in case["pts"]]
        n = len(pts)
        degree = min(3, n - 1)
        # Sigmas Curve's own weighting rule: end points 1, interior max(1, w).
        weights = [1.0 if i in (0, n - 1) else max(1.0, case["pts"][i][2]) for i in range(n)]
        knots = sc._nurbs_knot_vector(n, degree)
        poly = case["poly"]
        assert len(poly) >= 2, f"case {k}: empty polyline"

        worst = 0.0
        for j in range(2001):
            x, y = sc._nurbs_evaluate(pts, weights, knots, degree, j / 2000.0)
            worst = max(worst, min(_seg_dist((x, y), poly[i], poly[i + 1])
                                   for i in range(len(poly) - 1)))
        assert worst < budget, (
            f"case {k}: the editor's B-spline is not the Sigmas Curve NURBS — "
            f"max deviation {worst:.3e} exceeds the flattening budget {budget:.3e}")
        print(f"  case {k}: {len(poly):4d} pts, max deviation {worst:.2e} (budget {budget:.2e})")

    # And the property that made us pick this evaluator: a B-spline is contained
    # in the convex hull of its control points, so close points cannot overshoot.
    pinched = cases[2]
    xs = [p[0] for p in pinched["pts"]]
    ys = [p[1] for p in pinched["pts"]]
    for q in pinched["poly"]:
        assert min(xs) - 1e-9 <= q[0] <= max(xs) + 1e-9, f"overshoot in x at {q}"
        assert min(ys) - 1e-9 <= q[1] <= max(ys) + 1e-9, f"overshoot in y at {q}"

    print("spline parity ok")


if __name__ == "__main__":
    demo()
