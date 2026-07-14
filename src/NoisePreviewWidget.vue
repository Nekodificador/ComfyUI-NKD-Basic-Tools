<template>
  <div class="nkd-root">
    <canvas ref="canvas" class="nkd-canvas" :style="{ aspectRatio: aspect }"></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hint }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

// Frame-0 preview of NKD Noise. Mirrors _fractal_noise / _value_noise / _h32 in
// helpers.py bit-for-bit (integer hash), so the preview equals the render.

interface NoiseParams {
  width: number; height: number; scale: number; detail: number;
  roughness: number; lacunarity: number; distortion: number;
  contrast: number; brightness: number; evolution: number; loop: boolean;
  offset_x: number; offset_y: number; seed: number;
}

const props = defineProps<{ getParams: () => NoiseParams }>();

const PREVIEW_MAX = 256;     // longest side of the sampled preview (per-pixel JS — keep modest)
const MIN_RENDER_SCALE = 2;
const EVO_SPEED = 0.12;      // must match _NOISE_EVO_SPEED
const LOOP_RADIUS = 1.5;     // must match _NOISE_LOOP_RADIUS

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
const dpr = window.devicePixelRatio || 1;
let logicalW = 0, logicalH = 0;

const hint = ref("Live preview");
const aspect = ref("1 / 1");
let lastSig = "";

// --- noise (mirror of helpers.py) -----------------------------------------

function h32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

// value noise for D dims (D = coords.length), quintic-interpolated hashed corners
function vnoise(c: number[], seed: number): number {
  const d = c.length;
  const fl: number[] = [], u: number[] = [];
  for (let k = 0; k < d; k++) {
    const f0 = Math.floor(c[k]);
    fl[k] = f0;
    const fr = c[k] - f0;
    u[k] = fr * fr * fr * (fr * (fr * 6 - 15) + 10);
  }
  let total = 0;
  for (let corner = 0; corner < (1 << d); corner++) {
    let w = 1, h = seed >>> 0;
    for (let k = 0; k < d; k++) {
      const bit = (corner >> k) & 1;
      h = h32(h + fl[k] + bit);
      w *= bit ? u[k] : 1 - u[k];
    }
    total += w * (h / 4294967296);
  }
  return total;
}

function fbm(gx: number, gy: number, tc: number[], p: NoiseParams, seedLow: number): number {
  let val = 0, amp = 1, freq = 1, norm = 0;
  const detail = Math.max(1, Math.round(p.detail));
  for (let o = 0; o < detail; o++) {
    let cx = gx * freq, cy = gy * freq;
    const t = tc.map((v) => v * freq);
    if (p.distortion > 0) {
      const wx = vnoise([cx + 17.3, cy + 5.1, ...t], (seedLow ^ 0x9e3779b1) >>> 0);
      const wy = vnoise([cx + 3.7, cy + 19.2, ...t], (seedLow ^ 0x85ebca77) >>> 0);
      cx += (wx - 0.5) * 2 * p.distortion;
      cy += (wy - 0.5) * 2 * p.distortion;
    }
    val += amp * vnoise([cx, cy, ...t], (seedLow + o * 1013) >>> 0);
    norm += amp; amp *= p.roughness; freq *= p.lacunarity;
  }
  return val / Math.max(norm, 1e-6);
}

// --- rendering -------------------------------------------------------------

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  logicalW = rect.width; logicalH = rect.height;
  const s = Math.max(dpr, MIN_RENDER_SCALE);
  const nw = Math.round(rect.width * s), nh = Math.round(rect.height * s);
  if (c.width !== nw || c.height !== nh) { c.width = nw; c.height = nh; ctx = c.getContext("2d"); }
  ctx?.setTransform(nw / rect.width, 0, 0, nh / rect.height, 0, 0);
  redraw();
  return true;
}

let offscreen: HTMLCanvasElement | null = null;

function redraw() {
  if (!ctx || logicalW < 1) return;
  const p = props.getParams();
  const W = Math.max(1, p.width), H = Math.max(1, p.height);
  const aspectN = W / H;
  const pw = aspectN >= 1 ? PREVIEW_MAX : Math.max(1, Math.round(PREVIEW_MAX * aspectN));
  const ph = aspectN >= 1 ? Math.max(1, Math.round(PREVIEW_MAX / aspectN)) : PREVIEW_MAX;

  const evo = Math.max(0, p.evolution) / 100;
  let tc: number[] = [];
  if (p.loop && evo > 0) tc = [evo * LOOP_RADIUS, 0];
  else if (evo > 0) tc = [0];  // frame 0 → linear time is 0
  const seedLow = ((p.seed % 4294967296) + 4294967296) % 4294967296;

  if (!offscreen || offscreen.width !== pw || offscreen.height !== ph) {
    offscreen = document.createElement("canvas");
    offscreen.width = pw; offscreen.height = ph;
  }
  const octx = offscreen.getContext("2d")!;
  const img = octx.createImageData(pw, ph);
  const data = img.data;
  for (let j = 0; j < ph; j++) {
    const gy = (j / ph) * p.scale + p.offset_y;
    for (let i = 0; i < pw; i++) {
      const gx = (i / pw) * p.scale * aspectN + p.offset_x;
      let v = fbm(gx, gy, tc, p, seedLow);
      v = (v - 0.5) * p.contrast + 0.5 + p.brightness;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const px = (j * pw + i) * 4, g = (v * 255) | 0;
      data[px] = g; data[px + 1] = g; data[px + 2] = g; data[px + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, 0, 0, logicalW, logicalH);
}

function refreshExternal() {
  const p = props.getParams();
  const a = `${Math.max(1, p.width)} / ${Math.max(1, p.height)}`;
  if (a !== aspect.value) { aspect.value = a; return; }  // element resize → RO redraws
  const sig = JSON.stringify(p);
  if (sig !== lastSig) { lastSig = sig; redraw(); }
}

function forceResize(): boolean { return syncCanvasSize(); }
function cleanup() { ro?.disconnect(); }

onMounted(() => {
  ctx = canvas.value?.getContext("2d") ?? null;
  ro = new ResizeObserver(() => syncCanvasSize());
  if (canvas.value) ro.observe(canvas.value);
  syncCanvasSize();
});
onBeforeUnmount(cleanup);

defineExpose({ refreshExternal, forceResize, cleanup });
</script>

<style scoped>
.nkd-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  background: var(--comfy-menu-bg, #1a1c22);
  border: 1px solid var(--border-color, #2a2d36);
  border-radius: 6px;
  overflow: hidden;
  font: 11px Inter, sans-serif;
}
.nkd-root, .nkd-root *, .nkd-root *::before, .nkd-root *::after { box-sizing: border-box; }
.nkd-canvas { width: 100%; height: auto; display: block; flex: 0 0 auto; }
.nkd-bar {
  flex: 0 0 auto;
  background: var(--comfy-menu-bg, #1a1c22);
  border-top: 1px solid var(--border-color, #2a2d36);
}
.nkd-row { display: flex; align-items: center; gap: 6px; }
.nkd-row--controls { padding: 5px 8px; }
.nkd-hint { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap; }
</style>
