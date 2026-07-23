// Mirror of color_core/{oklab,ryb,mesh,lut}.py. Kept 1:1 so the JS/WebGL preview
// can't drift from the Python render. If you change the math, change BOTH and
// re-run tests/parity/parity_check.mjs. Constants (C_REF, OKLAB matrices,
// DEFAULT_ANCHORS) are copied by value on purpose — this is the second host.

type Vec3 = [number, number, number];

// --- oklab ---

const _M1: number[][] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const _M2: number[][] = [
  [0.2104542553, 0.7936177850, -0.0040720468],
  [1.9779984951, -2.4285922050, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.8086757660],
];
// Inverses computed once via numpy.linalg.inv on the Python _M1/_M2 (float64),
// pasted by value — do NOT invert at runtime.
const _M1_INV: number[][] = [
  [4.076741661347994, -3.3077115904081933, 0.23096992872942793],
  [-1.2684380040921763, 2.6097574006633715, -0.3413193963102196],
  [-0.004196086541837079, -0.7034186144594495, 1.7076147009309446],
];
const _M2_INV: number[][] = [
  [0.9999999984505196, 0.39633779217376774, 0.2158037580607588],
  [1.0000000088817607, -0.10556134232365633, -0.0638541747717059],
  [1.0000000546724108, -0.08948418209496574, -1.2914855378640917],
];

function matVec(m: number[][], v: Vec3): Vec3 {
  // out[i] = sum_j m[i][j] * v[j]  (equivalent to numpy `v @ m.T`)
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

const cbrt = Math.cbrt;

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
}

export function srgbToOklab(rgb: Vec3): Vec3 {
  const lin: Vec3 = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  const lms = matVec(_M1, lin);
  const lms_: Vec3 = [cbrt(lms[0]), cbrt(lms[1]), cbrt(lms[2])];
  return matVec(_M2, lms_);
}

export function oklabToSrgb(lab: Vec3): Vec3 {
  const lms_ = matVec(_M2_INV, lab);
  const lms: Vec3 = [lms_[0] ** 3, lms_[1] ** 3, lms_[2] ** 3];
  const lin = matVec(_M1_INV, lms);
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function oklabToOklch(lab: Vec3): Vec3 {
  const [L, a, b] = lab;
  const C = Math.hypot(a, b);
  const h = mod(Math.atan2(b, a) * DEG, 360.0);
  return [L, C, h];
}

export function oklchToOklab(lch: Vec3): Vec3 {
  const [L, C, h] = lch;
  const r = h * RAD;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

export function srgbToHsl(rgb: Vec3): Vec3 {
  const [r, g, b] = rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const L = (mx + mn) / 2.0;
  const S = d === 0 ? 0.0 : d / (1 - Math.abs(2 * L - 1) + 1e-12);
  let h = 0.0;
  if (d !== 0) {
    // per-channel max branches, same precedence as numpy version
    if (mx === r) {
      h = mod((g - b) / (d + 1e-12), 6);
    } else if (mx === g) {
      h = (b - r) / (d + 1e-12) + 2;
    } else if (mx === b) {
      h = (r - g) / (d + 1e-12) + 4;
    }
  }
  h = mod(h * 60.0, 360.0);
  return [h, S, L];
}

export function hslToSrgb(hsl: Vec3): Vec3 {
  const h = mod(hsl[0], 360.0);
  const s = hsl[1];
  const L = hsl[2];
  const c = (1 - Math.abs(2 * L - 1)) * s;
  const x = c * (1 - Math.abs(mod(h / 60.0, 2) - 1));
  const m = L - c / 2.0;
  const z = 0.0;
  const seg = mod(Math.trunc(h / 60.0), 6);
  let rp: number, gp: number, bp: number;
  switch (seg) {
    case 0: rp = c; gp = x; bp = z; break;
    case 1: rp = x; gp = c; bp = z; break;
    case 2: rp = z; gp = c; bp = x; break;
    case 3: rp = z; gp = x; bp = c; break;
    case 4: rp = x; gp = z; bp = c; break;
    default: rp = c; gp = z; bp = x; break; // 5
  }
  return [rp + m, gp + m, bp + m];
}

// --- ryb ---

export const DEFAULT_ANCHORS: [number, number][] = [
  [0.0, 0.0],
  [60.0, 30.0],
  [120.0, 60.0],
  [180.0, 120.0],
  [240.0, 240.0],
  [300.0, 290.0],
  [360.0, 360.0],
];

// numpy.interp: xs must be increasing; clamps to endpoints outside range.
function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[n - 1];
}

export function displayToHue(displayDeg: number, anchors: [number, number][] = DEFAULT_ANCHORS): number {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  return mod(interp(mod(displayDeg, 360.0), xs, ys), 360.0);
}

export function hueToDisplay(hueDeg: number, anchors: [number, number][] = DEFAULT_ANCHORS): number {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  return mod(interp(mod(hueDeg, 360.0), ys, xs), 360.0);
}

// --- mesh ---

export interface Mesh {
  hue_segments: number;
  sat_rings: number;
  offsets: number[][][]; // [ring][seg][3]
  neutral?: [number, number]; // global OKLab (a,b) cast (draggable centre node)
}

export function meshIdentity(hueSegments = 12, satRings = 6): Mesh {
  const offsets: number[][][] = [];
  for (let r = 0; r <= satRings; r++) {
    const ring: number[][] = [];
    for (let s = 0; s < hueSegments; s++) ring.push([0, 0, 0]);
    offsets.push(ring);
  }
  return { hue_segments: hueSegments | 0, sat_rings: satRings | 0, offsets, neutral: [0, 0] };
}

export function meshFromDict(d: any): Mesh {
  return {
    hue_segments: d.hue_segments | 0,
    sat_rings: d.sat_rings | 0,
    offsets: d.offsets.map((ring: number[][]) => ring.map((c: number[]) => [c[0], c[1], c[2]])),
    neutral: d.neutral ? [d.neutral[0], d.neutral[1]] : [0, 0],
  };
}

export function meshToDict(m: Mesh): any {
  return {
    hue_segments: m.hue_segments,
    sat_rings: m.sat_rings,
    offsets: m.offsets.map((ring) => ring.map((c) => [c[0], c[1], c[2]])),
    neutral: m.neutral ? [m.neutral[0], m.neutral[1]] : [0, 0],
  };
}

export function meshSample(m: Mesh, hueDeg: number, satNorm: number): Vec3 {
  const off = m.offsets;
  const R = m.sat_rings;
  const S = m.hue_segments;
  const hue = mod(hueDeg, 360.0);
  const sat = Math.min(Math.max(satNorm, 0.0), 1.0);

  const rf = sat * R;
  let ri = Math.floor(rf);
  ri = Math.min(Math.max(ri, 0), R - 1);
  const rt = rf - ri;

  const sf = (hue / 360.0) * S;
  const sj = mod(Math.floor(sf), S);
  const st = sf - Math.floor(sf);
  const sj1 = mod(sj + 1, S);

  const c00 = off[ri][sj];
  const c01 = off[ri][sj1];
  const c10 = off[ri + 1][sj];
  const c11 = off[ri + 1][sj1];

  const val: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const top = c00[k] * (1 - st) + c01[k] * st;
    const bot = c10[k] * (1 - st) + c11[k] * st;
    val[k] = top * (1 - rt) + bot * rt;
  }

  const dh = val[0] * sat; // center-safe: no hue push at gray
  const ds = val[1];
  const dl = val[2];
  return [dh, ds, dl];
}

// --- lut ---

export const C_REF = 0.35;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// LUT is [r,g,b]-indexed, red = axis 0, red-fastest? No: flat index
// ((r*size+g)*size+b)*3 makes b the fastest-varying (innermost) axis, matching
// Python's lut[r,g,b] C-order flatten. bake iterates the same order.
export function bakeLut(m: Mesh, size = 33): Float64Array {
  const out = new Float64Array(size * size * size * 3);
  const step = size > 1 ? 1.0 / (size - 1) : 0.0;
  const na = m.neutral ? m.neutral[0] : 0, nb = m.neutral ? m.neutral[1] : 0;
  for (let ri = 0; ri < size; ri++) {
    const r = ri * step;
    for (let gi = 0; gi < size; gi++) {
      const g = gi * step;
      for (let bi = 0; bi < size; bi++) {
        const b = bi * step;
        const lab = srgbToOklab([r, g, b]);
        const [L, C, h] = oklabToOklch(lab);
        const sat = C / C_REF;
        const [dh, ds, dl] = meshSample(m, h, sat);
        const h2 = mod(h + dh, 360.0);
        const sat2 = Math.max(sat + ds, 0.0);
        const C2 = sat2 * C_REF;
        const L2 = clamp(L + dl, 0.0, 1.0);
        const lab2 = oklchToOklab([L2, C2, h2]);
        lab2[1] += na; lab2[2] += nb; // global neutral cast
        const rgb = oklabToSrgb(lab2);
        const idx = ((ri * size + gi) * size + bi) * 3;
        out[idx] = clamp(rgb[0], 0.0, 1.0);
        out[idx + 1] = clamp(rgb[1], 0.0, 1.0);
        out[idx + 2] = clamp(rgb[2], 0.0, 1.0);
      }
    }
  }
  return out;
}

export function applyRgb(lut: Float64Array, size: number, rgb: [number, number, number]): Vec3 {
  const N = size;
  const r = clamp(rgb[0], 0.0, 1.0);
  const g = clamp(rgb[1], 0.0, 1.0);
  const b = clamp(rgb[2], 0.0, 1.0);
  const pr = r * (N - 1);
  const pg = g * (N - 1);
  const pb = b * (N - 1);
  const r0 = clamp(Math.floor(pr), 0, N - 2);
  const g0 = clamp(Math.floor(pg), 0, N - 2);
  const b0 = clamp(Math.floor(pb), 0, N - 2);
  const fr = pr - r0;
  const fg = pg - g0;
  const fb = pb - b0;

  const at = (dr: number, dg: number, db: number, c: number): number =>
    lut[(((r0 + dr) * N + (g0 + dg)) * N + (b0 + db)) * 3 + c];

  const res: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = at(0, 0, 0, c) * (1 - fr) + at(1, 0, 0, c) * fr;
    const c01 = at(0, 0, 1, c) * (1 - fr) + at(1, 0, 1, c) * fr;
    const c10 = at(0, 1, 0, c) * (1 - fr) + at(1, 1, 0, c) * fr;
    const c11 = at(0, 1, 1, c) * (1 - fr) + at(1, 1, 1, c) * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    res[c] = c0 * (1 - fb) + c1 * fb;
  }
  return res;
}
