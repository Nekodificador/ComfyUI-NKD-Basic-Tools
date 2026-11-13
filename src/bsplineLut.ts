/** The tone-curve spline shared by every NKD curve editor that mirrors nkd_curves.py:
 *  a clamped uniform B-spline over the control points, read back as y(x). */
export type Pt = [number, number, number?];  // third = 1 marks a corner

// ── Spline: clamped uniform B-spline over the points, same as nkd_curves.py ──
const SPLINE_DEGREE = 3;
const SPLINE_SAMPLES = 500;

function bsplineTable(pts: Pt[]): [Float64Array, Float64Array] {
  // A corner repeats its point `degree` times: continuity drops to C0 there, so
  // the curve runs through it with a sharp kink (same as NKD Vector Mask).
  pts = pts.flatMap((q) => (q[2] ? [q, q, q] : [q]));
  const n = pts.length, p = Math.min(SPLINE_DEGREE, n - 1), inner = n - p;
  const knots: number[] = [];
  for (let i = 0; i <= p; i++) knots.push(0);
  for (let i = 1; i < inner; i++) knots.push(i / inner);
  for (let i = 0; i <= p; i++) knots.push(1);
  const xs = new Float64Array(SPLINE_SAMPLES + 1), ys = new Float64Array(SPLINE_SAMPLES + 1);
  const N = new Float64Array(knots.length - 1);
  for (let s = 0; s <= SPLINE_SAMPLES; s++) {
    const u = Math.min(s / SPLINE_SAMPLES, 1 - 1e-10);
    for (let i = 0; i < N.length; i++) N[i] = knots[i] <= u && u < knots[i + 1] ? 1 : 0;
    for (let d = 1; d <= p; d++) { // Cox-de Boor, in place (N[i+1] still holds degree d-1)
      for (let i = 0; i < N.length - d; i++) {
        const a = knots[i + d] > knots[i] ? ((u - knots[i]) / (knots[i + d] - knots[i])) * N[i] : 0;
        const b = knots[i + d + 1] > knots[i + 1]
          ? ((knots[i + d + 1] - u) / (knots[i + d + 1] - knots[i + 1])) * N[i + 1] : 0;
        N[i] = a + b;
      }
    }
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += N[i] * pts[i][0]; y += N[i] * pts[i][1]; }
    xs[s] = x; ys[s] = y;
  }
  return [xs, ys];
}

export function curveLut(pts: Pt[], n: number): Float32Array {
  const [xs, ys] = bsplineTable(pts);
  const last = xs.length - 1;
  const out = new Float32Array(n);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    if (x <= xs[0]) { out[j] = ys[0]; continue; }
    if (x >= xs[last]) { out[j] = ys[last]; continue; }
    while (x > xs[k + 1]) k++;
    const dx = xs[k + 1] - xs[k];
    const t = dx > 0 ? (x - xs[k]) / dx : 0;
    out[j] = Math.min(1, Math.max(0, ys[k] + t * (ys[k + 1] - ys[k])));
  }
  return out;
}
