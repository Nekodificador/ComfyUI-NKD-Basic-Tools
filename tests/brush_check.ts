// node-run check of brush.ts's pure maths (the canvas half needs a browser).
// Preview Tools keeps a verbatim copy of brush.ts; this pins the numbers both share.
import { adjustBrush, coreRadius, fringeBlur, healPatch, membrane, stepSize, SIZE_MAX } from "../src/brush";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};

// Photoshop's soft round: hardness 0 -> core r/2, sigma 0.3r; hardness 1 -> solid, no blur.
eq(coreRadius(10, 0), 5, "soft core");
eq(fringeBlur(10, 0), 3, "soft fringe");
eq(coreRadius(10, 1), 10, "hard core");
eq(fringeBlur(10, 1), 0, "hard fringe");

// [ ] never sticks at 1 and never passes the cap.
eq(stepSize(1, 1), 2, "] from 1");
eq(stepSize(1, -1), 1, "[ floors at 1");
eq(stepSize(SIZE_MAX, 1), SIZE_MAX, "] caps");
eq(stepSize(100, -1), 90, "[ is ten percent");

// Alt + right drag: x = size in layer px, y = hardness over 150 px, both clamped.
eq(adjustBrush(20, 0.5, 30, 0, 2), { size: 35, hardness: 0.5 }, "drag right grows");
eq(adjustBrush(20, 0.5, 0, 75, 1), { size: 20, hardness: 1 }, "drag down hardens");
eq(adjustBrush(20, 0.5, -999, -999, 1), { size: 1, hardness: 0 }, "clamped low");

// Heal: a harmonic field is exact for a linear edge, so a hole in a ramp fills with the ramp.
{
  const w = 97, h = 61, f = new Float32Array(w * h * 3), inside = new Uint8Array(w * h);
  const ramp = (x: number, y: number) => 0.5 * x + 0.3 * y;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, hole = Math.hypot(x - 48, y - 30) < 25;
    inside[i] = hole ? 1 : 0;
    for (let k = 0; k < 3; k++) f[i * 3 + k] = hole ? 999 : ramp(x, y);
  }
  membrane(f, inside, w, h);
  let err = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) err = Math.max(err, Math.abs(f[(y * w + x) * 3] - ramp(x, y)));
  if (err > 0.5) throw new Error(`membrane misses the ramp by ${err}`);
}

// Heal on pixels: a grey source over a brighter destination takes the destination's level
// and keeps its own texture; outside the stroke nothing is painted.
{
  const w = 80, h = 80, n = w * h;
  const s = new Uint8ClampedArray(n * 4), d = new Uint8ClampedArray(n * 4), m = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, tex = (x + y) % 2 ? 10 : -10;
    for (let k = 0; k < 3; k++) { s[i * 4 + k] = 100 + tex; d[i * 4 + k] = 180; }
    s[i * 4 + 3] = d[i * 4 + 3] = 255;
    m[i * 4 + 3] = Math.hypot(x - 40, y - 40) < 20 ? 255 : 0;
  }
  const out = healPatch(s, d, m, w, h);
  const c = (40 * w + 40) * 4, c1 = (40 * w + 41) * 4;
  if (Math.abs((out[c] + out[c1]) / 2 - 180) > 2) throw new Error(`heal level ${out[c]}, ${out[c1]}`);
  if (Math.abs(Math.abs(out[c] - out[c1]) - 20) > 2) throw new Error("heal lost the texture");
  eq(out[3], 0, "heal paints only the stroke");
  // Speed: a big stroke on a 2048-wide layer is one solve on release.
  const W = 1024, H = 1024, N = W * H;
  const S = new Uint8ClampedArray(N * 4).fill(255), D = new Uint8ClampedArray(N * 4).fill(200), M = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) M[i * 4 + 3] = Math.hypot((i % W) - 512, ((i / W) | 0) - 512) < 480 ? 255 : 0;
  const t = Date.now(); healPatch(S, D, M, W, H);
  console.log(`heal 1024x1024: ${Date.now() - t} ms`);
}

console.log("brush - all good.");
