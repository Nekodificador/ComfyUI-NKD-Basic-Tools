// Ramp interpolation — shared by all three ramp previews (ColorRamp bar,
// Gradient Generate, Gradient Map). Mirrors _sample_ramp in nkd_color_ramp.py:
//   smooth = linear · bezier = smoothstep ease · steps = hard blocks.
// Kept in one place so the JS previews can't drift from the Python output.

export type Interp = "smooth" | "bezier" | "steps";
// `mid` (0..1, default 0.5) biases the color transition to the NEXT stop — the
// Photoshop/Blender midpoint diamond. Stored on the left stop of each segment.
export interface Stop { pos: number; color: string; mid?: number }

const MODES: Interp[] = ["smooth", "bezier", "steps"];

// Per-segment midpoint warp: a sample at fraction `mid` of the segment reaches
// the 50% color. Mirrors _sample_ramp's midpoint in nkd_color_ramp.py.
export function midWarp(f: number, mid: number | undefined): number {
  const m = Math.min(0.95, Math.max(0.05, mid ?? 0.5));
  if (Math.abs(m - 0.5) < 1e-4) return f;
  return f <= 0 ? 0 : Math.pow(f, Math.log(0.5) / Math.log(m));
}
function smoothstep(f: number): number { return f * f * (3 - 2 * f); }

export function parseInterp(rampJson: string): Interp {
  try {
    const m = JSON.parse(rampJson)?.interp;
    if (MODES.includes(m)) return m;
  } catch { /* fall through */ }
  return "smooth";
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// 256×3 ramp lookup table honoring the interpolation mode. Used by the
// per-pixel previews (Gradient Map, the Diamond gradient).
export function buildRampLut(stops: Stop[], interp: Interp): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  let si = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    if (interp === "steps") {
      // last stop whose pos <= t
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1].pos <= t) k++;
      const [r, g, b] = hexToRgb(stops[k].color);
      lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b;
      continue;
    }
    while (si < stops.length - 2 && t > stops[si + 1].pos) si++;
    const a = stops[si], b = stops[Math.min(si + 1, stops.length - 1)];
    let f = Math.max(0, Math.min(1, (t - a.pos) / Math.max(1e-6, b.pos - a.pos)));
    f = midWarp(f, a.mid);
    if (interp === "bezier") f = smoothstep(f);
    const [r1, g1, b1] = hexToRgb(a.color), [r2, g2, b2] = hexToRgb(b.color);
    lut[i * 3] = r1 + (r2 - r1) * f;
    lut[i * 3 + 1] = g1 + (g2 - g1) * f;
    lut[i * 3 + 2] = b1 + (b2 - b1) * f;
  }
  return lut;
}

function lerpHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1), [r2, g2, b2] = hexToRgb(c2);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

// Expand a ramp into color stops a native CanvasGradient can render with the
// given interpolation. `remap` optionally warps each output position (the
// Gradient Generate midpoint bias); it must be monotonic on [0,1].
//   smooth → stops unchanged · steps → piecewise-constant (hard edges)
//   bezier → each segment subdivided with a smoothstep color ease
export function expandStops(
  stops: Stop[],
  interp: Interp,
  remap: (pos: number) => number = (p) => p,
): Stop[] {
  if (interp === "smooth") return stops.map((s) => ({ pos: remap(s.pos), color: s.color }));

  const out: Stop[] = [];
  if (interp === "steps") {
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (i > 0) out.push({ pos: remap(s.pos), color: stops[i - 1].color }); // hold previous
      out.push({ pos: remap(s.pos), color: s.color });
    }
    return out;
  }
  // Subdivide each segment that isn't a plain linear blend (bezier, or a
  // midpoint ≠ 0.5) so the native gradient reproduces the warp. Junctions may
  // repeat with the same color — harmless for addColorStop.
  const SUB = 12;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const needsSub = interp === "bezier" || Math.abs((a.mid ?? 0.5) - 0.5) > 1e-4;
    const n = needsSub ? SUB : 1;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      let e = midWarp(u, a.mid);
      if (interp === "bezier") e = smoothstep(e);
      out.push({ pos: remap(a.pos + (b.pos - a.pos) * u), color: lerpHex(a.color, b.color, e) });
    }
  }
  return out;
}
