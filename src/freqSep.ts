/**
 * Client-side mirror of nkd_frequency.py, for the live preview only. Runs on a
 * small cached decode (not the full render), so it is a faithful low-res
 * approximation of the node output, not bit-exact. Keep the formulas in step
 * with the Python: sRGB<->linear, the four LF filters, and divide/subtract.
 */
export type Method = "Gaussian" | "Guided" | "Rolling Guidance" | "Median";
export type Mode = "Divide" | "Subtract";
export type Detail = "Luminance" | "RGB";

const EPS = 1e-6;
const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number): number {
  if (v <= 0) return 0;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// Separable box mean, radius r, replicate-padded. Plane is Float32 [w*h].
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const k = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / k;
      const add = row + Math.min(w - 1, x + r + 1);
      const sub = row + Math.min(w - 1, Math.max(0, x - r));
      acc += src[add] - src[sub];
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      const add = Math.min(h - 1, y + r + 1) * w + x;
      const sub = Math.min(h - 1, Math.max(0, y - r)) * w + x;
      acc += tmp[add] - tmp[sub];
    }
  }
  return out;
}

// Separable gaussian, sigma = r/2 (mirrors the Python).
function gaussian(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const sigma = Math.max(r / 2, 0.5);
  const k = 2 * r + 1;
  const ker = new Float32Array(k);
  let sum = 0;
  for (let i = 0; i < k; i++) { const t = i - r; ker[i] = Math.exp(-(t * t) / (2 * sigma * sigma)); sum += ker[i]; }
  for (let i = 0; i < k; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += ker[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = acc;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += ker[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = acc;
  }
  return out;
}

// Guided filter (self-guided when guide === src).
function guided(src: Float32Array, guide: Float32Array, w: number, h: number,
                r: number, eps: number): Float32Array {
  const n = w * h;
  const meanG = boxMean(guide, w, h, r);
  const meanX = boxMean(src, w, h, r);
  const gg = new Float32Array(n), gx = new Float32Array(n);
  for (let i = 0; i < n; i++) { gg[i] = guide[i] * guide[i]; gx[i] = guide[i] * src[i]; }
  const corrGG = boxMean(gg, w, h, r);
  const corrGX = boxMean(gx, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varG = corrGG[i] - meanG[i] * meanG[i];
    const covGX = corrGX[i] - meanG[i] * meanX[i];
    a[i] = covGX / (varG + eps);
    b[i] = meanX[i] - a[i] * meanG[i];
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ma[i] * guide[i] + mb[i];
  return out;
}

function rollingGuidance(src: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  let g = gaussian(src, w, h, r);
  for (let it = 0; it < 4; it++) g = guided(src, g, w, h, r, eps);
  return g;
}

// Approximate median with a 3x3-ish rank in the preview is costly; the preview
// Windowed median (real, mirrors the node — no gaussian fallback). radius is
// capped for the preview so the O((2r+1)^2·log) pass stays interactive; the
// render uses the full radius. Recompute is debounced (dirty-check), so this
// only runs on a param change, not on every wipe scrub.
function median(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  r = Math.min(r, 5);
  const k = 2 * r + 1, area = k * k, mid = area >> 1;
  const out = new Float32Array(w * h);
  const win = new Float32Array(area);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = Math.min(h - 1, Math.max(0, y + dy));
      const xx = Math.min(w - 1, Math.max(0, x + dx));
      win[m++] = src[yy * w + xx];
    }
    out[y * w + x] = win.slice().sort()[mid]; // TypedArray.sort is numeric
  }
  return out;
}

function lowFreq(plane: Float32Array, w: number, h: number, method: Method,
                 r: number, edge: number): Float32Array {
  const eps = Math.pow(Math.max(edge, 1e-3), 2);
  if (method === "Guided") return guided(plane, plane, w, h, r, eps);
  if (method === "Rolling Guidance") return rollingGuidance(plane, w, h, r, eps);
  if (method === "Median") return median(plane, w, h, r);
  return gaussian(plane, w, h, r);
}

export interface FreqOpts {
  method: Method; radius: number; edge: number; mode: Mode; detail: Detail; linear: boolean;
}

export interface Separation {
  hf: Uint8ClampedArray; // the RAW high-frequency, exactly as the node exports it
  lf: Uint8ClampedArray; // the soft base (blurred image in display space)
}

/**
 * Compute both output layers from an RGBA Uint8 buffer, FAITHFUL to what the
 * node exports (so preview == render): hf is the raw ratio (Divide) or
 * difference (Subtract) in work space, clamped to [0,1] just like ComfyUI shows
 * the tensor — NOT a prettified gray relief. lf is the blurred base in display
 * (sRGB) space. Returned separately so the wipe slider costs nothing.
 */
export function computeSeparation(rgba: Uint8ClampedArray, w: number, h: number,
                                  opts: FreqOpts): Separation {
  const n = w * h;
  const r = Math.max(1, Math.round(opts.radius));
  const hf = new Uint8ClampedArray(n * 4);
  const lf = new Uint8ClampedArray(n * 4);
  const toWork = (v: number) => (opts.linear ? srgbToLinear(v) : v);
  const toDisp = (v: number) => (opts.linear ? linearToSrgb(v) : v);

  // RGB planes in work space -> RGB low-frequency base (always, for the LF view).
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    planes[0][p] = toWork(rgba[i] / 255);
    planes[1][p] = toWork(rgba[i + 1] / 255);
    planes[2][p] = toWork(rgba[i + 2] / 255);
  }
  const lfs = planes.map((pl) => lowFreq(pl, w, h, opts.method, r, opts.edge));
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    lf[i] = Math.round(toDisp(lfs[0][p]) * 255);
    lf[i + 1] = Math.round(toDisp(lfs[1][p]) * 255);
    lf[i + 2] = Math.round(toDisp(lfs[2][p]) * 255);
    lf[i + 3] = 255;
  }

  // HF = raw ratio (Divide) or difference (Subtract), in work space, *255.
  // Uint8ClampedArray clamps to [0,255] — matching how ComfyUI displays the
  // exported tensor (Divide ≈ white with dark detail; Subtract ≈ near black).
  if (opts.detail === "Luminance") {
    const luma = new Float32Array(n);
    for (let p = 0; p < n; p++) luma[p] = LUMA_R * planes[0][p] + LUMA_G * planes[1][p] + LUMA_B * planes[2][p];
    const lfl = lowFreq(luma, w, h, opts.method, r, opts.edge);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const v = opts.mode === "Divide" ? luma[p] / (lfl[p] + EPS) : luma[p] - lfl[p];
      const g = v * 255;
      hf[i] = hf[i + 1] = hf[i + 2] = g; hf[i + 3] = 255;
    }
  } else {
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = opts.mode === "Divide" ? planes[c][p] / (lfs[c][p] + EPS) : planes[c][p] - lfs[c][p];
        hf[i + c] = v * 255;
      }
      hf[i + 3] = 255;
    }
  }
  return { hf, lf };
}
