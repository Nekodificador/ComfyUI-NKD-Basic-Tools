/** Self-check for the spline evaluators: npm run test:ts */
import { flatten, bezierSegments, insertionIndex, FLATTEN_TOL, type SplinePoint } from "../src/splineEval";

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** Control points on a circle of radius r about the centre of the unit square. */
function ring(n: number, r = 0.3, w?: number): SplinePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a), ...(w != null ? { w } : {}) };
  });
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (poly: Array<[number, number]>, p: SplinePoint) =>
  Math.min(...poly.map((q) => dist(q, [p.x, p.y])));
const meanRadius = (poly: Array<[number, number]>) =>
  poly.reduce((a, p) => a + Math.hypot(p[0] - 0.5, p[1] - 0.5), 0) / poly.length;
/** Shoelace. The honest measure of "how tight is this shape" — unlike a mean
 *  radius it does not depend on how densely the polyline happens to be sampled. */
const area = (poly: Array<[number, number]>) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};

function steps(poly: Array<[number, number]>, closed: boolean): number[] {
  const d: number[] = [];
  const last = closed ? poly.length : poly.length - 1;
  for (let i = 0; i < last; i++) d.push(dist(poly[i], poly[(i + 1) % poly.length]));
  return d;
}

// ── The B-spline is approximating and CANNOT overshoot. ───────────────
// This is the whole reason it is a B-spline and not an interpolating spline:
// the curve lives inside the convex hull of its control points. The regression
// that matters is two points close together — an interpolating scheme builds a
// tangent from the neighbours, which is far too long for the short span, and
// the curve loops out past them.
{
  const r = 0.3;
  const approx = flatten(ring(6, r, 1), "bspline", true);
  ok(meanRadius(approx) < r * 0.95, `must approximate, got r=${meanRadius(approx).toFixed(4)}`);
  ok(nearest(approx, ring(6, r)[0]) > r * 0.02, "must NOT pass through its control points");

  // Convex hull containment, stated as: no sample may sit outside the control
  // polygon's circumscribed radius.
  for (const n of [3, 5, 8, 16]) {
    const poly = flatten(ring(n, r, 1), "bspline", true);
    const worst = Math.max(...poly.map((p) => Math.hypot(p[0] - 0.5, p[1] - 0.5)));
    ok(worst <= r + 1e-9, `n=${n}: overshoot to ${worst.toFixed(5)} beyond ${r}`);
  }

  // Two points almost on top of each other, the case that broke the previous
  // evaluator. A blunt statement of "no bulge": every sample stays inside the
  // bounding box of the control points.
  const pinched: SplinePoint[] = [
    { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.2 }, { x: 0.502, y: 0.203 },
    { x: 0.8, y: 0.5 }, { x: 0.5, y: 0.8 },
  ];
  for (const poly of [flatten(pinched, "bspline", true), flatten(pinched, "bspline", false)]) {
    const xs = pinched.map((p) => p.x), ys = pinched.map((p) => p.y);
    for (const q of poly) {
      ok(q[0] >= Math.min(...xs) - 1e-9 && q[0] <= Math.max(...xs) + 1e-9 &&
         q[1] >= Math.min(...ys) - 1e-9 && q[1] <= Math.max(...ys) + 1e-9,
         `close points made the curve overshoot to ${q}`);
    }
  }

  // Weight is the tension: only RELATIVE weights matter (scaling them all
  // cancels in the rational form), and raising one pulls the curve to it.
  const base = ring(6, r);
  const uniform = flatten(base, "bspline", true);
  const scaled = flatten(ring(6, r, 5), "bspline", true);
  ok(Math.abs(meanRadius(uniform) - meanRadius(scaled)) < 1e-9, "uniform weights must cancel");

  const near = (pts: SplinePoint[]) => nearest(flatten(pts, "bspline", true), base[0]);
  const heavy = base.map((p, i) => (i === 0 ? { ...p, w: 10 } : p));
  ok(near(heavy) < near(base) * 0.35,
     `weight must pull the curve to its point: ${near(heavy)} vs ${near(base)}`);
  // Monotonic, so the dial has no surprises in it.
  const pulls = [1, 2, 4, 7, 10].map((w) => near(base.map((p, i) => (i === 0 ? { ...p, w } : p))));
  for (let i = 1; i < pulls.length; i++) ok(pulls[i] < pulls[i - 1], `weight not monotonic: ${pulls}`);

  // A corner flag is maximum tension.
  const cornered = base.map((p, i) => (i === 0 ? { ...p, corner: true } : p));
  ok(near(cornered) <= near(heavy) + 1e-12, "corner must be maximum tension");
}

// ── A closed B-spline must not open at the seam. ──────────────────────
// Clamped knots pin the curve to its first and last control point; periodic
// ones make the seam identical to every other point. The sharpest statement of
// that: rotating WHICH control point is stored first must not change the curve.
for (const n of [3, 5, 8, 16]) {
  for (const w of [1, 3, 10]) {
    const pts = ring(n, 0.3, w);
    const poly = flatten(pts, "bspline", true);
    ok(poly.every((p) => p.every(Number.isFinite)), `n=${n} w=${w}: non-finite points`);
    const d = steps(poly, true);
    const seam = d[d.length - 1];
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    ok(seam < mean * 6, `n=${n} w=${w}: seam gap ${seam.toFixed(5)} vs mean ${mean.toFixed(5)}`);

    const rolled = flatten([...pts.slice(1), pts[0]], "bspline", true);
    const drift = Math.max(...rolled.map((p) => Math.min(...poly.map((q) => dist(p, q)))));
    ok(drift < 2e-3, `n=${n} w=${w}: rotating the point order moved the curve by ${drift.toExponential(2)}`);
  }
}

// An OPEN b-spline starts and ends exactly on its end points (clamped knots).
{
  const pts = ring(6, 0.3, 1);
  const open = flatten(pts, "bspline", false);
  ok(dist(open[0], [pts[0].x, pts[0].y]) < 1e-6, "open bspline must start on its first point");
  ok(dist(open[open.length - 1], [pts[5].x, pts[5].y]) < 1e-6, "open bspline must end on its last");
}

// ── Bezier is interpolating: every control point lies ON the curve. ─────────
{
  const pts = ring(6);
  const poly = flatten(pts, "bezier", true);
  for (const p of pts) ok(nearest(poly, p) < 1e-9, "bezier missed its own control point");

  const open = flatten(pts, "bezier", false);
  ok(dist(open[0], [pts[0].x, pts[0].y]) < 1e-12, "open bezier start");
  ok(dist(open[open.length - 1], [pts[5].x, pts[5].y]) < 1e-12, "open bezier end");
  ok(bezierSegments(pts, true).length === 6, "closed bezier segment count");
  ok(bezierSegments(pts, false).length === 5, "open bezier segment count");
}

// A corner retracts both handles, so the two segments meeting there are free to
// disagree — that is the whole point of double-clicking a point.
{
  const straight: SplinePoint[] = [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }];
  const bent: SplinePoint[] = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5, corner: true }, { x: 0.9, y: 0.1 }];
  ok(flatten(straight, "bezier", false).length === 2,
     `collinear bezier over-subdivided: ${flatten(straight, "bezier", false).length}`);
  const segs = bezierSegments(bent, false);
  ok(segs[0][2][0] === 0.5 && segs[0][2][1] === 0.5, "corner did not retract its in handle");
  ok(segs[1][1][0] === 0.5 && segs[1][1][1] === 0.5, "corner did not retract its out handle");
}

// ── Density: enough geometry that the polyline IS the curve. ────────────────
// The complaint this tolerance exists to fix is visible faceting, so assert the
// actual error rather than a point count.
{
  const r = 0.3;
  for (const type of ["bezier", "bspline"] as const) {
    const poly = flatten(ring(8, r, 1), type, true);
    const rs = poly.map((p) => Math.hypot(p[0] - 0.5, p[1] - 0.5));
    // Sagitta of each chord: how far the true arc bulges past the polyline.
    const worst = Math.max(...steps(poly, true).map((c) => (c * c) / (8 * r)));
    ok(worst < 1 / 2048, `${type}: chords bulge ${worst.toExponential(2)} — visible faceting`);
    ok(Math.max(...rs) - Math.min(...rs) < r * 0.02, `${type}: shape is not round`);
    ok(poly.length > 40, `${type}: only ${poly.length} points on a circle`);
    ok(poly.length < 900, `${type}: ${poly.length} points is wasteful`);
  }
  // …but a straight run still costs almost nothing.
  const box: SplinePoint[] = [
    { x: 0.2, y: 0.2, corner: true }, { x: 0.8, y: 0.2, corner: true },
    { x: 0.8, y: 0.8, corner: true }, { x: 0.2, y: 0.8, corner: true },
  ];
  ok(flatten(box, "bspline", true).length <= 6, "a rectangle should not need many points");
}

// ── Degenerate input does not throw. ────────────────────────────────────────
{
  ok(flatten([], "bezier", true).length === 0, "empty input");
  ok(flatten([{ x: 0.5, y: 0.5 }], "bspline", true).length === 1, "single point");
  ok(flatten(ring(2), "bspline", true).length === 2, "two points");
  const coarse = flatten(ring(6, 0.3, 1), "bezier", true, FLATTEN_TOL * 512);
  const fine = flatten(ring(6, 0.3, 1), "bezier", true, FLATTEN_TOL);
  ok(coarse.length < fine.length, `tolerance ignored: ${coarse.length} vs ${fine.length}`);
}

// ── Inserting a point on the curve must not deform the shape. ───────────────
// The insertion INDEX is the whole risk: put the new point in the wrong slot and
// the control list reorders, which visibly folds the curve. So the test is not
// "did it pick index k" but the property that matters — adding a point where the
// curve already runs leaves the curve where it was.
{
  const hausdorff = (a: Array<[number, number]>, b: Array<[number, number]>) =>
    Math.max(...a.map((p) => Math.min(...b.map((q) => dist(p, q)))));

  // Inserting always disturbs an approximating curve a little — that is the
  // nature of refining a B-spline, not a bug. What must hold is that the index
  // the click resolved to is the BEST one: putting the point anywhere else in
  // the list disturbs the curve more. That is the failure that folds a shape.
  const disturb = (pts: SplinePoint[], type: "bezier" | "bspline", closed: boolean,
                   at: number, pt: [number, number]) => {
    const next = [...pts];
    next.splice(at, 0, { x: pt[0], y: pt[1], w: 1 });
    return hausdorff(flatten(next, type, closed), flatten(pts, type, closed));
  };

  for (const type of ["bezier", "bspline"] as const) {
    for (const closed of [true, false]) {
      for (const n of [4, 6, 9]) {
        const pts = ring(n, 0.3, 1);
        const before = flatten(pts, type, closed);
        for (let k = 1; k < before.length; k += Math.ceil(before.length / 13)) {
          const got = insertionIndex(pts, type, closed, before[k], 1e-3);
          const tag = `${type} closed=${closed} n=${n} sample=${k}`;
          ok(got != null, `${tag}: no hit on its own curve`);
          ok(got!.at >= 1 && got!.at <= pts.length, `${tag}: index ${got!.at} out of range`);

          const chosen = disturb(pts, type, closed, got!.at, got!.point);
          ok(chosen < 0.12, `${tag}: inserting moved the curve by ${chosen.toFixed(4)}`);

          // The exact property a wrong index breaks: the control points must
          // still run in order along the curve. Slot the point in the wrong
          // place and the list zig-zags, which is what folds a shape.
          const next = [...pts];
          next.splice(got!.at, 0, { x: got!.point[0], y: got!.point[1], w: 1 });
          const poly = flatten(next, type, closed);
          const order = next.map((p) => {
            let bi = 0, bd = Infinity;
            poly.forEach((q, qi) => {
              const d = dist(q, [p.x, p.y]);
              if (d < bd) { bd = d; bi = qi; }
            });
            return bi;
          });
          const descents = order.filter((v, i) => i > 0 && v < order[i - 1]).length;
          ok(descents <= (closed ? 1 : 0),
             `${tag}: inserting at ${got!.at} put the points out of curve order (${order})`);
        }
        // Refinement converges: more points, less disturbance.
        const mid = flatten(pts, type, closed)[3];
        const g = insertionIndex(pts, type, closed, mid, 1e-3)!;
        ok(disturb(pts, type, closed, g.at, g.point) < (n <= 4 ? 0.08 : 0.05),
           `${type} closed=${closed} n=${n}: insertion disturbs too much`);
      }
    }
  }

  // Regression: a slack shape whose control points sit FAR off the curve. The
  // obvious index heuristic — "which polyline vertex is each control point
  // nearest to" — is not even monotone here, so a click resolved to an arbitrary
  // slot and the point appeared on the other side of the shape. Greville
  // abscissae order the points by parameter instead, which cannot do that.
  {
    const slack: SplinePoint[] = [
      { x: 0.72, y: 0.11 }, { x: 0.80, y: 0.50 }, { x: 0.57, y: 0.71 },
      { x: 0.36, y: 0.90 }, { x: 0.015, y: 0.56 },
    ];
    const poly = flatten(slack, "bspline", true);
    const off = Math.max(...slack.map((p) => nearest(poly, p)));
    ok(off > 0.1, `fixture is not slack enough to be the regression (${off.toFixed(3)})`);

    // Walking the curve, the index must advance in order and wrap exactly once.
    const seen: number[] = [];
    for (let k = 0; k < poly.length; k += Math.ceil(poly.length / 24)) {
      const g = insertionIndex(slack, "bspline", true, poly[k], 0.02);
      ok(g != null, `slack shape: no hit at sample ${k}`);
      ok(dist(g!.point, poly[k]) < 2e-3,
         `the new point must land where it was clicked, not ${dist(g!.point, poly[k]).toFixed(4)} away`);
      if (!seen.length || seen[seen.length - 1] !== g!.at) seen.push(g!.at);
    }
    const wraps = seen.filter((v, i) => i > 0 && v < seen[i - 1]).length;
    ok(wraps <= 1, `slack shape: index jumped around the loop (${seen.join(",")})`);
    ok(seen.length >= 4, `slack shape: index barely moved (${seen.join(",")})`);
  }

  // A click far from the curve is not an insertion.
  const pts = ring(6, 0.3, 1);
  ok(insertionIndex(pts, "bspline", true, [0.5, 0.5], 1e-3) == null, "centre must not hit the ring");
  ok(insertionIndex(pts, "bspline", true, [0.98, 0.98], 1e-3) == null, "corner must not hit the ring");
  // Two points is not yet a curve.
  ok(insertionIndex(ring(1), "bspline", true, [0.5, 0.5], 1) == null, "single point");

  // A non-square image must not skew the hit test: the same click on the curve
  // still lands, with distances scaled by the aspect.
  const wide = flatten(pts, "bspline", true);
  ok(insertionIndex(pts, "bspline", true, wide[3], 1e-3, 1.78) != null, "aspect-scaled hit");
}

console.log("splineEval ok");
