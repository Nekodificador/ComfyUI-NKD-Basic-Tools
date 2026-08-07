/** Self-check for the spline evaluators: npm run test:ts */
import { flatten, flattenP, flattenFeathered, sampleAttr, rampOffsets, bezierSegments, insertionIndex, FLATTEN_TOL, type SplinePoint } from "../src/splineEval";

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

// ── sampleAttr: a per-point value resolved along the dense polyline ───
// This is what carries per-point feather and per-point speed to Python, so it
// has to hit each control point's own value and stay inside the range between.
for (const type of ["bezier", "bspline"] as const) {
  const pts = ring(6, 0.3, 1);
  const vals = [0, 10, 20, 30, 20, 10];
  const { poly, us } = flattenP(pts, type, true);
  ok(us.length === poly.length, `${type}: ${us.length} params for ${poly.length} points`);
  const got = sampleAttr(pts, type, true, us, (_p) => vals[pts.indexOf(_p)]);
  ok(got.length === poly.length, `${type}: sampled ${got.length} of ${poly.length}`);
  ok(Math.min(...got) >= 0, `${type}: went negative (${Math.min(...got)})`);
  ok(Math.max(...got) <= 34, `${type}: overshot badly (${Math.max(...got)})`);
  // A B-spline is approximating, so it need not touch 30 — but it has to get
  // most of the way there, or setting a feather on a point would barely show.
  ok(Math.max(...got) > (type === "bspline" ? 20 : 28),
     `${type}: never reached the peak (${Math.max(...got)})`);
  ok(Math.min(...got) < (type === "bspline" ? 6 : 2),
     `${type}: never reached the trough (${Math.min(...got)})`);
  // A constant is constant — no ringing from the parameter mapping.
  const flat = sampleAttr(pts, type, true, us, () => 7);
  ok(flat.every((v) => Math.abs(v - 7) < 1e-9), `${type}: constant did not stay constant`);

  // The point of the exercise: SMOOTH, not piecewise-linear. Interpolating in a
  // straight line between control points puts a crease in the value at every one
  // of them, and on a feather that crease is a visible kink running down the
  // gradient of a shape that is itself perfectly round.
  //
  // Sampled on an even grid of the parameter, NOT on the polyline's own
  // vertices: those are adaptively spaced, so a second difference across them
  // measures where the sampler put points, not how smooth the value is.
  const u0 = Math.min(...us), u1 = Math.max(...us);
  const grid = Array.from({ length: 400 }, (_, i) => u0 + ((u1 - u0) * i) / 399);
  const even = sampleAttr(pts, type, true, grid, (_p) => vals[pts.indexOf(_p)]);
  const d1 = even.slice(1).map((v, i) => v - even[i]);
  const d2 = d1.slice(1).map((v, i) => Math.abs(v - d1[i]));
  const peak = Math.max(...d2);
  const mean = d2.reduce((a, b) => a + b, 0) / d2.length;
  // A linear interpolant is flat between control points and turns all at once
  // at each of them, which puts this ratio in the hundreds. A cubic spreads the
  // curvature over the whole span.
  ok(peak < 6 * mean, `${type}: creases at the control points (peak ${peak}, mean ${mean})`);
}

// ── A feather offset is a VECTOR, and both components must stay signed ─
// The clone is placed by hand, so its offset points wherever it was dragged —
// including back inside the shape. Clamping a component at zero (which an
// earlier width-shaped version did) would quietly refuse half the directions.
{
  const pts = ring(6, 0.3, 1);
  const fo: Array<[number, number]> = [
    [30, 0], [0, 0], [-25, 12], [0, 0], [0, -18], [0, 0],
  ];
  const withFo = pts.map((p, i) => ({ ...p, fo: fo[i] }));
  for (const type of ["bezier", "bspline"] as const) {
    const { poly, us } = flattenP(withFo, type, true);
    const fx = sampleAttr(withFo, type, true, us, (p) => p.fo?.[0] ?? 0);
    const fy = sampleAttr(withFo, type, true, us, (p) => p.fo?.[1] ?? 0);
    ok(fx.length === poly.length && fy.length === poly.length, `${type}: length`);
    ok(Math.min(...fx) < -5, `${type}: negative x offsets were lost (${Math.min(...fx)})`);
    ok(Math.min(...fy) < -5, `${type}: negative y offsets were lost (${Math.min(...fy)})`);
    ok(Math.max(...fx) > 10, `${type}: positive x offsets were lost (${Math.max(...fx)})`);
    // Both components stay bounded by the values that were set, give or take the
    // overshoot a cubic through them is entitled to.
    ok(Math.max(...fx.map(Math.abs)) < 45, `${type}: x blew up (${Math.max(...fx)})`);
    ok(Math.max(...fy.map(Math.abs)) < 30, `${type}: y blew up (${Math.max(...fy)})`);
  }
}

// ── The OFFSET curve gets the outline's flatness, not the outline's points ──
// A straight edge is two points and no more, which is right for the edge and
// useless for the soft curve beside it: the clones at either end can point in
// different directions, so the offset curve over that same span bends. Sampling
// it at the outline's vertices draws a chord, and the soft edge comes out
// faceted next to a hard edge that is perfectly smooth.
{
  // Long straight spans, clones swinging hard between neighbours — the shape of
  // the bug, on purpose.
  const pts: SplinePoint[] = [
    { x: 0.30, y: 0.55, fo: [-140, -260] }, { x: 0.62, y: 0.50, fo: [40, -230] },
    { x: 0.78, y: 0.58, fo: [190, -300] },  { x: 0.80, y: 0.66, fo: [150, -60] },
    { x: 0.55, y: 0.72, fo: [-30, 60] },    { x: 0.28, y: 0.62, fo: [-190, 90] },
  ];
  const IMG = 1094, IMGH = 845;
  const ox = (p: SplinePoint) => (p.fo?.[0] ?? 0) / IMG;
  const oy = (p: SplinePoint) => (p.fo?.[1] ?? 0) / IMGH;
  const TOL = FLATTEN_TOL * 40;                 // a screen-ish drawing tolerance

  for (const type of ["bezier", "bspline"] as const) {
    const plain = flattenP(pts, type, true, TOL);
    const fine = flattenFeathered(pts, type, true, TOL, ox, oy);
    ok(fine.poly.length === fine.off.length && fine.poly.length === fine.us.length,
       `${type}: ragged output`);
    ok(fine.us.every((u, i) => i === 0 || u > fine.us[i - 1]),
       `${type}: parameters came back out of order`);

    /** Worst gap between the drawn offset polyline and the real offset curve. */
    const facet = (poly: typeof plain.poly, us: number[],
                   off: Array<[number, number]>) => {
      let worst = 0;
      for (let i = 0; i + 1 < us.length; i++) {
        const um = (us[i] + us[i + 1]) / 2;
        const [mx] = sampleAttr(pts, type, true, [um], ox);
        const [my] = sampleAttr(pts, type, true, [um], oy);
        // The base curve at the midpoint, taken from a much finer flattening.
        const ref = flattenP(pts, type, true, FLATTEN_TOL);
        let k = 0, bd = Infinity;
        ref.us.forEach((u, j) => { const d = Math.abs(u - um); if (d < bd) { bd = d; k = j; } });
        const m: [number, number] = [ref.poly[k][0] + mx, ref.poly[k][1] + my];
        const a: [number, number] = [poly[i][0] + off[i][0], poly[i][1] + off[i][1]];
        const b: [number, number] = [poly[i + 1][0] + off[i + 1][0], poly[i + 1][1] + off[i + 1][1]];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / l2));
        worst = Math.max(worst, dist(m, [a[0] + t * dx, a[1] + t * dy]));
      }
      return worst;
    };

    const before = facet(plain.poly, plain.us,
      sampleAttr(pts, type, true, plain.us, ox)
        .map((v, i) => [v, sampleAttr(pts, type, true, plain.us, oy)[i]] as [number, number]));
    const after = facet(fine.poly, fine.us, fine.off);
    ok(after <= TOL * 2.5, `${type}: offset curve still faceted by ${after} (tol ${TOL})`);
    ok(after < before / 3, `${type}: refinement barely helped (${before} -> ${after})`);
    // And it pays for that with points only where the bend is, not everywhere.
    ok(fine.poly.length < plain.poly.length * 3,
       `${type}: refinement exploded (${plain.poly.length} -> ${fine.poly.length})`);
  }

  // No clones at all: nothing to refine, so nothing is added.
  const bare = pts.map(({ x, y }) => ({ x, y }));
  for (const type of ["bezier", "bspline"] as const) {
    const a = flattenP(bare, type, true, FLATTEN_TOL);
    const b = flattenFeathered(bare, type, true, FLATTEN_TOL, () => 0, () => 0);
    ok(a.poly.length === b.poly.length, `${type}: zero offset changed the sampling`);
    ok(b.off.every((o) => o[0] === 0 && o[1] === 0), `${type}: phantom offsets`);
  }
}

// ── rampOffsets: the smoothstep spacing, parity with blur_core ────────
{
  const off = rampOffsets(16);
  ok(off.length === 16, `${off.length} offsets`);
  ok(off.every((v, i) => i === 0 || v > off[i - 1]), "offsets must be sorted");
  ok(off[0] > 0 && off[off.length - 1] < 1, `offsets left the band (${off[0]}, ${off[15]})`);
  const gaps = off.slice(1).map((v, i) => v - off[i]);
  ok(gaps[gaps.length >> 1] < gaps[0] * 0.6, "rings must cluster toward the middle");
  // Same two numbers as tests/test_blur_core.py: smoothstep⁻¹(¼) = ½ - sin(10°).
  ok(Math.abs(rampOffsets(1)[0] - 0.5) < 1e-12, `${rampOffsets(1)}`);
  ok(Math.abs(rampOffsets(2)[0] - (0.5 - Math.sin(Math.PI / 18))) < 1e-12, `${rampOffsets(2)}`);
}

console.log("splineEval ok");
