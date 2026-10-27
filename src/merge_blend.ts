/**
 * Per-pixel port of core's `comfy_extras/compositor_blend.py` (the engine behind NKD Merge's
 * non-"normal" modes), so the editor preview shows what the render will. Keep the maths and the
 * mode table in lock-step with it. Straight-alpha RGBA in and out; the backdrop's alpha is kept
 * (every mode but "normal" composites clip-to-backdrop).
 */
const E = 1e-6;
const LUM = [0.2224884, 0.71690369, 0.06060791];

const div = (a: number, b: number) => (Math.abs(b) >= E ? a / b : 0);
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((Math.max(c, 0) + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

const CHANNEL: Record<string, (i: number, l: number) => number> = {
  multiply: (i, l) => i * l,
  screen: (i, l) => 1 - (1 - i) * (1 - l),
  overlay: (i, l) => (i < 0.5 ? 2 * i * l : 1 - 2 * (1 - l) * (1 - i)),
  darken: (i, l) => Math.min(i, l),
  lighten: (i, l) => Math.max(i, l),
  "color-dodge": (i, l) => (i <= 0 ? 0 : 1 - l <= E ? 1 : Math.min(div(i, 1 - l), 1)),
  "color-burn": (i, l) => (i >= 1 ? 1 : l <= E ? 0 : 1 - Math.min(div(1 - i, l), 1)),
  "hard-light": (i, l) => (l > 0.5 ? Math.min(1 - (1 - i) * (1 - (l - 0.5) * 2), 1) : Math.min(i * l * 2, 1)),
  "soft-light": (i, l) => (1 - i) * (i * l) + i * (1 - (1 - i) * (1 - l)),
  difference: (i, l) => Math.abs(i - l),
  exclusion: (i, l) => 0.5 - 2 * (i - 0.5) * (l - 0.5),
  "linear-dodge": (i, l) => i + l,
  "linear-burn": (i, l) => i + l - 1,
  "vivid-light": (i, l) => l <= 0.5
    ? (i >= 1 ? 1 : 2 * l <= E ? 0 : Math.max(1 - div(1 - i, 2 * l), 0))
    : (i <= 0 ? 0 : 2 * (1 - l) <= E ? 1 : Math.min(div(i, 2 * (1 - l)), 1)),
  "pin-light": (i, l) => (l > 0.5 ? Math.max(i, 2 * (l - 0.5)) : Math.min(i, 2 * l)),
  "linear-light": (i, l) => i + 2 * l - 1,
  "hard-mix": (i, l) => (i + l < 1 ? 0 : 1),
  subtract: (i, l) => Math.max(i - l, 0),
  divide: (i, l) => Math.min(Math.max(i / Math.max(l, E), 0), 1),
  "grain-extract": (i, l) => i - l + 0.5,
  "grain-merge": (i, l) => i + l - 0.5,
};

type V3 = [number, number, number];
const lum = (c: V3) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];
const mx = (c: V3) => Math.max(c[0], c[1], c[2]);
const mn = (c: V3) => Math.min(c[0], c[1], c[2]);

const HSL: Record<string, (i: V3, l: V3, o: V3) => void> = {
  hue(i, l, o) {
    const sd = mx(l) - mn(l);
    if (sd <= E) { o[0] = i[0]; o[1] = i[1]; o[2] = i[2]; return; }
    const dm = mx(i), ds = dm !== 0 ? (dm - mn(i)) / dm : 0;
    const ratio = (ds * dm) / sd, off = dm - mx(l) * ratio;
    for (let k = 0; k < 3; k++) o[k] = l[k] * ratio + off;
  },
  saturation(i, l, o) {
    const dm = mx(i), dd = dm - mn(i);
    if (dd <= E) { o[0] = o[1] = o[2] = dm; return; }
    const sm = mx(l), ss = sm !== 0 ? (sm - mn(l)) / sm : 0;
    const ratio = (ss * dm) / dd, off = (1 - ratio) * dm;
    for (let k = 0; k < 3; k++) o[k] = i[k] * ratio + off;
  },
  color(i, l, o) {
    const dl = (mn(i) + mx(i)) / 2, sl = (mn(l) + mx(l)) / 2;
    if (Math.abs(sl) <= E || Math.abs(1 - sl) <= E) { o[0] = o[1] = o[2] = dl; return; }
    const d = Math.min(dl, 1 - dl), s = Math.min(sl, 1 - sl), ratio = d / s;
    const off = (dl > 0.5 ? 1 - 2 * d : 0) + (sl > 0.5 ? 2 * d - ratio : 0);
    for (let k = 0; k < 3; k++) o[k] = l[k] * ratio + off;
  },
  luminosity(i, l, o) {
    const li = lum(i), ll = lum(l);
    if (li <= E) { o[0] = o[1] = o[2] = ll; return; }
    const ratio = ll / li;
    for (let k = 0; k < 3; k++) o[k] = i[k] * ratio;
  },
};

// Modes blended on linear light; every other one blends on the sRGB values.
const LINEAR = new Set(["multiply", "darken", "lighten", "linear-dodge", "subtract", "divide", "luminosity"]);

export const blendFrame = (mode: string, bg: Uint8ClampedArray, fg: Uint8ClampedArray,
                           opacity: number, out: Uint8ClampedArray): void => {
  const fn = CHANNEL[mode], hsl = HSL[mode], linear = LINEAR.has(mode);
  const i: V3 = [0, 0, 0], l: V3 = [0, 0, 0], c: V3 = [0, 0, 0], bl: V3 = [0, 0, 0];
  for (let p = 0; p < bg.length; p += 4) {
    out[p] = bg[p]; out[p + 1] = bg[p + 1]; out[p + 2] = bg[p + 2]; out[p + 3] = bg[p + 3];
    const la = (fg[p + 3] / 255) * opacity;
    if (bg[p + 3] === 0 || la === 0) continue;
    for (let k = 0; k < 3; k++) {
      bl[k] = toLin(bg[p + k] / 255);
      i[k] = linear ? bl[k] : bg[p + k] / 255;
      l[k] = linear ? toLin(fg[p + k] / 255) : fg[p + k] / 255;
    }
    if (hsl) hsl(i, l, c); else for (let k = 0; k < 3; k++) c[k] = fn(i[k], l[k]);
    for (let k = 0; k < 3; k++) {
      const comp = linear ? c[k] : toLin(c[k]);
      const mixed = comp * la + bl[k] * (1 - la);
      out[p + k] = toSrgb(Math.min(Math.max(mixed, 0), 1)) * 255 + 0.5;
    }
  }
};

export const isBlended = (mode: string) => mode in CHANNEL || mode in HSL;
