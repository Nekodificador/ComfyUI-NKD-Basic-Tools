/**
 * 😺NKD spline evaluation — Bezier and B-spline, both flattened to a polyline.
 *
 * Two curve types, because rotoscoping uses both:
 *
 * - **Bezier** is interpolating with pen handles. What you want tracing an exact
 *   outline. A corner retracts both handles, as Photoshop's convert-point tool
 *   does.
 * - **B-spline** is the rational cubic B-spline (NURBS) — the same evaluator as
 *   the NKD Sigmas Curve editor, and what the roto packages mean by B-spline
 *   mode. Approximating: the control points steer the curve rather than sitting
 *   on it, and per-point weight is the tension.
 *
 * Why approximating and not interpolating: a cubic B-spline is contained in the
 * convex hull of its control points, so it cannot overshoot. Interpolating
 * schemes derive each tangent from the neighbouring points, so two points close
 * together produce a tangent far too long for the short span between them and
 * the curve loops out past them. Tracing a real outline means putting points
 * close together wherever detail is, so that failure shows up constantly.
 *
 * Both curve types end as a dense polyline, the only thing that crosses to
 * Python. That is what keeps two curve types from costing two evaluators in two
 * languages plus fixtures to keep them in sync — see `blur_core`'s docstring.
 */

export type SplinePoint = {
  x: number;
  y: number;
  /** [inX, inY, outX, outY] relative to the point. Bezier only; absent = auto. */
  h?: number[] | null;
  /** Hard corner: retracted handles (Bezier) or maximum tension (B-spline). */
  corner?: boolean;
  /** B-spline rational weight, 1..10. Higher pulls the curve onto the point. */
  w?: number;
};

export type SplineType = "bezier" | "bspline";
export type Pt = [number, number];

/**
 * Flattening tolerance in normalized units — about a sixth of a pixel at 4K.
 * Deliberately fine: this polyline *is* the mask edge, so the tolerance is the
 * error of the rendered shape, and it also has to survive the editor being
 * zoomed in. Douglas-Peucker keeps the cost of being generous low.
 */
export const FLATTEN_TOL = 1 / 24576;

/** Weight range. 1 is the plain uniform B-spline; 10 pulls the curve onto the
 *  point hard enough to read as a corner. Matches the NKD Sigmas Curve editor. */
export const MIN_W = 1;
export const MAX_W = 10;

/** Segments are always split this many times before flatness is trusted; an
 *  S-shaped span can have its midpoint sit exactly on the chord. */
const MIN_SPLITS = 3;
const MAX_DEPTH = 14;

const clampW = (v: number | undefined) =>
  Math.max(MIN_W, Math.min(MAX_W, Number.isFinite(v as number) ? (v as number) : MIN_W));

/* ── Adaptive sampling ───────────────────────────────────────────────────── */

/** Perpendicular distance from `p` to the segment `a`-`b`. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-24) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Sample `f` over [t0,t1] until the chord is within `tol` of the curve.
 * Straight spans stay two points; tight bends get as many as they need, which
 * is the only way to get an edge that is smooth at every zoom without emitting
 * thousands of points on the flat parts.
 */
function adaptive(f: (t: number) => Pt, t0: number, t1: number, p0: Pt, p1: Pt,
                  tol: number, out: Pt[], depth: number): void {
  const tm = (t0 + t1) / 2;
  const pm = f(tm);
  if (depth >= MIN_SPLITS && (segDist(pm, p0, p1) <= tol || depth >= MAX_DEPTH)) {
    out.push(p1);
    return;
  }
  adaptive(f, t0, tm, p0, pm, tol, out, depth + 1);
  adaptive(f, tm, t1, pm, p1, tol, out, depth + 1);
}

/* ── Bezier ──────────────────────────────────────────────────────────────── */

const at = (pts: SplinePoint[], i: number, closed: boolean): SplinePoint => {
  const n = pts.length;
  if (closed) return pts[((i % n) + n) % n];
  return pts[Math.max(0, Math.min(n - 1, i))];
};

/**
 * The two control points of the segment from `i` to `i+1`.
 *
 * With no explicit handles the tangent is Catmull-Rom converted to Bezier
 * (`c1 = p1 + (p2 - p0) / 6`), which is what makes the curve pass *through*
 * every point. A corner collapses its own handle onto itself, so the tangent on
 * that side is free to disagree with the other one.
 */
function controlPoints(pts: SplinePoint[], i: number, closed: boolean): [Pt, Pt] {
  const p1 = at(pts, i, closed);
  const p2 = at(pts, i + 1, closed);
  const p0 = at(pts, i - 1, closed);
  const p3 = at(pts, i + 2, closed);

  const c1: Pt = p1.corner
    ? [p1.x, p1.y]
    : p1.h
      ? [p1.x + p1.h[2], p1.y + p1.h[3]]
      : [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6];

  const c2: Pt = p2.corner
    ? [p2.x, p2.y]
    : p2.h
      ? [p2.x + p2.h[0], p2.y + p2.h[1]]
      : [p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6];

  return [c1, c2];
}

/** Cubic segments as [p0, c1, c2, p3] — what `ctx.bezierCurveTo` wants. */
export function bezierSegments(pts: SplinePoint[], closed: boolean): Array<[Pt, Pt, Pt, Pt]> {
  const segs: Array<[Pt, Pt, Pt, Pt]> = [];
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const [c1, c2] = controlPoints(pts, i, closed);
    const a = at(pts, i, closed);
    const b = at(pts, i + 1, closed);
    segs.push([[a.x, a.y], c1, c2, [b.x, b.y]]);
  }
  return segs;
}

const cubic = (p0: Pt, c1: Pt, c2: Pt, p3: Pt) => (t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
};

/* ── B-spline (NURBS) ────────────────────────────────────────────────────── */

const NURBS_DEGREE = 3;

/** Clamped uniform knots — the curve starts and ends on its end points. */
function clampedKnots(nPts: number, degree: number): number[] {
  const order = degree + 1;
  if (nPts <= degree) return new Array(nPts + order).fill(0);
  const knots: number[] = [];
  for (let i = 0; i < order; i++) knots.push(0);
  const interior = nPts - degree;
  for (let i = 1; i < interior; i++) knots.push(i / interior);
  for (let i = 0; i < order; i++) knots.push(1);
  return knots;
}

/** Plain uniform knots. Paired with wrapped control points: a periodic curve. */
function uniformKnots(nPts: number, degree: number): number[] {
  const knots: number[] = [];
  for (let i = 0; i < nPts + degree + 1; i++) knots.push(i);
  return knots;
}

/** Cox-de Boor, iterative. Ported from the NKD Sigmas Curve widget unchanged. */
function nurbsBasis(knots: number[], nPts: number, degree: number, u: number): number[] {
  u = Math.max(knots[degree], Math.min(knots[nPts], u));
  if (u >= knots[nPts]) u = knots[nPts] - 1e-10;

  const len = knots.length - 1;
  let N = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (knots[i] <= u && u < knots[i + 1]) N[i] = 1;
  }
  for (let p = 1; p <= degree; p++) {
    const next = new Array(len).fill(0);
    for (let i = 0; i < len - p; i++) {
      const d1 = knots[i + p] - knots[i];
      const d2 = knots[i + p + 1] - knots[i + 1];
      const c1 = d1 > 0 ? ((u - knots[i]) / d1) * N[i] : 0;
      const c2 = d2 > 0 ? ((knots[i + p + 1] - u) / d2) * N[i + 1] : 0;
      next[i] = c1 + c2;
    }
    N = next;
  }
  return N.slice(0, nPts);
}

/** Rational evaluation: Σ Nᵢwᵢ Pᵢ / Σ Nᵢwᵢ. */
function nurbsEvaluate(P: Pt[], weights: number[], knots: number[],
                       degree: number, u: number): Pt {
  const N = nurbsBasis(knots, P.length, degree, u);
  let wx = 0, wy = 0, sum = 0;
  for (let i = 0; i < P.length; i++) {
    const nw = N[i] * weights[i];
    wx += nw * P[i][0];
    wy += nw * P[i][1];
    sum += nw;
  }
  return sum === 0 ? P[0] : [wx / sum, wy / sum];
}

/**
 * B-spline → polyline.
 *
 * Approximating, and that is exactly the point: a cubic B-spline is contained in
 * the convex hull of its control points, so it *cannot* overshoot. Interpolating
 * splines — Catmull-Rom, X-Splines at a negative shape parameter — derive each
 * tangent from the neighbouring points, so two points close together get a
 * tangent far too long for the short span between them and the curve loops out
 * past them. That is the failure this evaluator does not have, and it is why
 * every roto package's B-spline mode behaves this way.
 *
 * Per-point weight is the tension control: raising it pulls the curve toward its
 * control point without adding points, and it can never push the curve outside
 * the hull. Only *relative* weights matter — scaling them all cancels in the
 * rational form.
 *
 * A closed shape wraps: the first `degree` control points are repeated at the end
 * over a uniform, *unclamped* knot vector. Clamped knots would pin the curve to
 * the first and last point and the shape visibly opens at the seam.
 */
type BSpline = {
  P: Pt[]; weights: number[]; knots: number[]; degree: number;
  /** Original control-point index each expanded entry came from. */
  srcOf: number[];
};

function bsplineSetup(pts: SplinePoint[], closed: boolean): BSpline | null {
  const n = pts.length;
  if (n < 3) return null;

  // A corner is knot multiplicity: repeating a control point `degree` times in a
  // degree-d B-spline drops the continuity there to C⁰, which is an exact sharp
  // corner. Weight alone cannot do this — however hard you pull, the curve stays
  // smooth and merely tightens. This is the textbook construction, and it is why
  // a rectangle costs four points rather than a rounded approximation of one.
  const expanded: SplinePoint[] = [];
  const src: number[] = [];
  pts.forEach((p, i) => {
    for (let k = 0; k < (p.corner ? NURBS_DEGREE : 1); k++) { expanded.push(p); src.push(i); }
  });

  const degree = Math.min(NURBS_DEGREE, closed ? expanded.length : expanded.length - 1);
  if (degree < 1) return null;

  const ctrl = closed ? expanded.concat(expanded.slice(0, degree)) : expanded;
  const srcOf = closed ? src.concat(src.slice(0, degree)) : src;
  return {
    P: ctrl.map((p) => [p.x, p.y] as Pt),
    weights: ctrl.map((p) => clampW(p.w)),
    knots: closed ? uniformKnots(ctrl.length, degree) : clampedKnots(ctrl.length, degree),
    degree,
    srcOf,
  };
}

/**
 * Greville abscissae — the parameter each control point "sits at".
 *
 * Monotone by construction, which is the whole point: it gives an exact ordering
 * of the control points along the curve, without any geometric guessing about
 * where a control point that may be nowhere near the curve belongs.
 */
function greville(b: BSpline): number[] {
  const out: number[] = [];
  for (let j = 0; j < b.P.length; j++) {
    let s = 0;
    for (let k = 1; k <= b.degree; k++) s += b.knots[j + k];
    out.push(s / b.degree);
  }
  return out;
}

function bsplinePolyline(pts: SplinePoint[], closed: boolean, tol: number): Pt[] {
  const b = bsplineSetup(pts, closed);
  if (!b) return pts.map((p) => [p.x, p.y] as Pt);
  const { P, weights, knots, degree } = b;

  // One adaptive pass per knot span rather than one over the whole curve, so a
  // feature in the middle of a long shape cannot be stepped over.
  const out: Pt[] = [];
  const ev = (u: number) => nurbsEvaluate(P, weights, knots, degree, u);
  for (let i = degree; i < P.length; i++) {
    const u0 = knots[i], u1 = knots[i + 1];
    if (!(u1 > u0)) continue;
    const a = ev(u0);
    if (!out.length) out.push(a);              // seeded from the CURVE, not a control point
    adaptive(ev, u0, u1, a, ev(u1), tol, out, 0);
  }
  return out;
}

/* ── Simplification ──────────────────────────────────────────────────────── */

/**
 * Douglas-Peucker. Adaptive sampling already emits near-minimal points, but
 * recursive subdivision always splits in halves, so a span that needed one
 * extra point gets two. This claws those back and keeps the serialized polyline
 * in the single-digit kilobytes even at a fine tolerance.
 */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];

  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    let best = -1, bestD = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist(pts[i], pts[lo], pts[hi]);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best < 0) continue;
    keep[best] = 1;
    stack.push([lo, best], [best, hi]);
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Drop points that are collinear with their neighbours, wrapping around.
 *
 * Douglas-Peucker has to pin a first and a last point, but a closed polyline
 * has no natural pair — they are wherever sampling happened to start, and the
 * closing edge is never measured against any chord. So a couple of samples near
 * the seam survive on merit they do not have, and which ones they are depends
 * on where the user began drawing. One wrap-aware pass removes exactly those.
 *
 * `prev` is the last *kept* point rather than the previous input point, so a run
 * of redundant samples collapses in this single pass.
 */
function dropCollinearWrapped(pts: Pt[], tol: number): Pt[] {
  const n = pts.length;
  if (n < 4) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = out.length ? out[out.length - 1] : pts[n - 1];
    if (segDist(pts[i], prev, pts[(i + 1) % n]) > tol) out.push(pts[i]);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * Where a new control point goes when the user clicks on the curve.
 *
 * Returns null if `target` is further than `tol` from the curve. Distances are
 * scaled by `aspect` on x so they stay isotropic on a non-square image — `tol`
 * is then in the same units, i.e. screen pixels divided by the drawn height.
 *
 * The index is the fiddly part: the polyline carries no record of which control
 * point produced which stretch of it, and on a B-spline the control points are
 * not even on the curve. So each control point is projected onto the polyline —
 * its nearest vertex — which orders the points along the curve; the click's own
 * position in that order says which pair it falls between. Cheap, and it works
 * for both curve types without touching the knot maths.
 */
export function insertionIndex(pts: SplinePoint[], type: SplineType, closed: boolean,
                               target: Pt, tol: number, aspect = 1,
                               ): { at: number; point: Pt } | null {
  if (pts.length < 2) return null;
  const sx = (p: Pt): Pt => [p[0] * aspect, p[1]];
  const t = sx(target);

  /** Nearest point on a densely sampled arc, in aspect-corrected distance. */
  const scan = (ev: (u: number) => Pt, u0: number, u1: number, steps: number) => {
    let bd = Infinity, bu = u0, bp: Pt = ev(u0);
    let prev = ev(u0), prevU = u0;
    for (let i = 1; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const cur = ev(u);
      const a = sx(prev), b = sx(cur);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const s = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((t[0] - a[0]) * dx + (t[1] - a[1]) * dy) / l2));
      const d = Math.hypot(t[0] - (a[0] + s * dx), t[1] - (a[1] + s * dy));
      if (d < bd) {
        bd = d;
        bu = prevU + (u - prevU) * s;
        bp = [prev[0] + (cur[0] - prev[0]) * s, prev[1] + (cur[1] - prev[1]) * s];
      }
      prev = cur; prevU = u;
    }
    return { d: bd, u: bu, p: bp };
  };

  // ── Bezier: the parameter IS the segment index, so the index is exact. ──
  if (type !== "bspline") {
    const segs = bezierSegments(pts, closed);
    let best = { d: Infinity, i: -1, p: [0, 0] as Pt };
    segs.forEach(([p0, c1, c2, p3], i) => {
      const got = scan(cubic(p0, c1, c2, p3), 0, 1, 48);
      if (got.d < best.d) best = { d: got.d, i, p: got.p };
    });
    if (best.i < 0 || best.d > tol) return null;
    // Interpolating, so the new point belongs exactly where it was clicked.
    return { at: Math.max(1, best.i + 1), point: best.p };
  }

  // ── B-spline: order the control points by PARAMETER, never by geometry. ──
  // The obvious shortcut — "which polyline vertex is each control point nearest
  // to" — is wrong, and wrong in a way that only shows up on real shapes: a
  // control point of a slack curve can sit hundreds of pixels off the curve, so
  // that mapping is not even monotone and the click lands in an arbitrary slot.
  // Greville abscissae are the exact ordering and cost nothing.
  const b = bsplineSetup(pts, closed);
  if (!b) return null;
  const { P, weights, knots, degree, srcOf } = b;
  const ev = (u: number) => nurbsEvaluate(P, weights, knots, degree, u);

  let best = { d: Infinity, u: 0, p: [0, 0] as Pt };
  for (let i = degree; i < P.length; i++) {
    if (!(knots[i + 1] > knots[i])) continue;
    const got = scan(ev, knots[i], knots[i + 1], 32);
    if (got.d < best.d) best = got;
  }
  if (best.d > tol) return null;

  const grev = greville(b);
  let j = grev.findIndex((g) => g > best.u);
  if (j < 1) j = 1;
  const n = pts.length;
  const at = Math.max(1, Math.min(n, srcOf[j - 1] + 1));

  // Where to put it: under the cursor, even though a B-spline control point does
  // not otherwise sit on the curve.
  //
  // The alternative is the midpoint of the control-polygon edge, which is what a
  // knot insertion would give and does disturb the shape least. Measured on real
  // shapes it is not worth it: the midpoint moves the curve 0.058 against 0.079
  // for the click, but it drops the new point 0.26 away from where you clicked —
  // a quarter of the frame, on a slack curve whose control points are nowhere
  // near it. A point that appears somewhere else is not a point you placed.
  return { at, point: best.p };
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

/**
 * Control points → the dense polyline Python rasterizes. Normalized 0..1.
 *
 * A closed shape's polyline is not repeated back to its first point: PIL closes
 * the polygon itself, and a duplicate final point is a zero-length segment that
 * every downstream tangent calculation then has to special-case.
 */
export function flatten(pts: SplinePoint[], type: SplineType, closed: boolean,
                        tol: number = FLATTEN_TOL): Pt[] {
  if (pts.length < 2) return pts.map((p) => [p.x, p.y] as Pt);

  let out: Pt[];
  if (type === "bspline") {
    out = bsplinePolyline(pts, closed, tol);
  } else {
    out = [[pts[0].x, pts[0].y]];
    for (const [p0, c1, c2, p3] of bezierSegments(pts, closed)) {
      adaptive(cubic(p0, c1, c2, p3), 0, 1, p0, p3, tol, out, 0);
    }
  }

  out = simplify(out, tol);
  if (closed && out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < tol) out.pop();
    out = dropCollinearWrapped(out, tol);
  }
  return out;
}
