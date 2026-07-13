<template>
  <div class="nkd-root">
    <canvas ref="canvas" class="nkd-canvas"></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hintText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

interface Stop { pos: number; color: string }

const props = defineProps<{
  getRamp: () => string;
  getInvert: () => boolean;
  getStrength: () => number;
  getSourceImg: () => HTMLImageElement | null;
}>();

const BOX_W = 320, BOX_H = 200, PAD = 10;
const MIN_RENDER_SCALE = 2;
const CACHE_RES = 220; // longest side of the cached source decode — preview only

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let dpr = window.devicePixelRatio || 1;

const hintText = ref("Connect an image");

// Cached decode of the source image: RGB + luminance, at a small fixed
// resolution so ramp/invert/strength edits redraw instantly with no
// backend round-trip. Re-decoded only when the source image itself changes.
let cacheW = 0, cacheH = 0;
let cacheRgb: Uint8ClampedArray | null = null;
let cacheLuma: Float32Array | null = null;
let lastSrc: string | null = null;
let offscreen: HTMLCanvasElement | null = null;

// Reusable output surface + a 256-entry ramp lookup table. Rebuilding these
// per redraw (new canvas, per-pixel ramp search) was what made the preview
// crawl; now each redraw is a flat pass of LUT lookups into a persistent
// ImageData.
let outCanvas: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;
let outImg: ImageData | null = null;
let rampLut: Uint8ClampedArray | null = null;
let lutKey = "";
let lastSig = "";  // dirty-check so the idle poll doesn't recompute the map

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function parseRamp(): Stop[] {
  try {
    const data = JSON.parse(props.getRamp());
    if (Array.isArray(data.stops) && data.stops.length >= 2) {
      return [...data.stops].sort((a: Stop, b: Stop) => a.pos - b.pos);
    }
  } catch { /* fall through */ }
  return [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
}

// Build a 256×RGB LUT once per ramp change: sample the ramp at 256 evenly
// spaced positions. Per-pixel work then collapses to a single array index.
function buildLut(stops: Stop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  let si = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (si < stops.length - 2 && t > stops[si + 1].pos) si++;
    const a = stops[si], b = stops[Math.min(si + 1, stops.length - 1)];
    const span = Math.max(1e-6, b.pos - a.pos);
    const f = Math.max(0, Math.min(1, (t - a.pos) / span));
    const [r1, g1, b1] = hexToRgb(a.color), [r2, g2, b2] = hexToRgb(b.color);
    lut[i * 3] = r1 + (r2 - r1) * f;
    lut[i * 3 + 1] = g1 + (g2 - g1) * f;
    lut[i * 3 + 2] = b1 + (b2 - b1) * f;
  }
  return lut;
}

function decodeSource(img: HTMLImageElement) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = CACHE_RES / Math.max(iw, ih);
  cacheW = Math.max(1, Math.round(iw * scale));
  cacheH = Math.max(1, Math.round(ih * scale));
  if (!offscreen) offscreen = document.createElement("canvas");
  offscreen.width = cacheW; offscreen.height = cacheH;
  const octx = offscreen.getContext("2d")!;
  octx.drawImage(img, 0, 0, cacheW, cacheH);
  const data = octx.getImageData(0, 0, cacheW, cacheH).data;
  cacheRgb = data;
  cacheLuma = new Float32Array(cacheW * cacheH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    cacheLuma[p] = (data[i] * LUMA_R + data[i + 1] * LUMA_G + data[i + 2] * LUMA_B) / 255;
  }
}

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const sx = Math.max((rect.width / BOX_W) * dpr, MIN_RENDER_SCALE);
  const sy = Math.max((rect.height / BOX_H) * dpr, MIN_RENDER_SCALE);
  const newW = Math.round(BOX_W * sx), newH = Math.round(BOX_H * sy);
  if (c.width !== newW || c.height !== newH) {
    c.width = newW; c.height = newH;
    ctx = c.getContext("2d");
    ctx?.setTransform(sx, 0, 0, sy, 0, 0);
  }
  redraw();
  return true;
}

function redraw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, BOX_W, BOX_H);
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, BOX_W, BOX_H);

  const maxW = BOX_W - PAD * 2, maxH = BOX_H - PAD * 2;
  if (!cacheRgb || !cacheLuma) {
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Connect an image", BOX_W / 2, BOX_H / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return;
  }

  const aspect = cacheW / cacheH;
  let fw = maxW, fh = maxW / aspect;
  if (fh > maxH) { fh = maxH; fw = maxH * aspect; }
  const fitX = PAD + (maxW - fw) / 2, fitY = PAD + (maxH - fh) / 2;

  const rampStr = props.getRamp();
  const invert = props.getInvert();
  const strength = Math.max(0, Math.min(1, props.getStrength()));

  // Rebuild the LUT only when the ramp string changes.
  if (rampStr !== lutKey) { rampLut = buildLut(parseRamp()); lutKey = rampStr; }
  const lut = rampLut!;

  // Reuse the output canvas + ImageData; only reallocate on cache-size change.
  if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = cacheW; outCanvas.height = cacheH;
    outCtx = outCanvas.getContext("2d");
    outImg = outCtx!.createImageData(cacheW, cacheH);
  }
  const data = outImg!.data;
  const invStrength = 1 - strength;
  for (let p = 0, i = 0; p < cacheW * cacheH; p++, i += 4) {
    let idx = (cacheLuma[p] * 255) | 0;
    if (idx < 0) idx = 0; else if (idx > 255) idx = 255;
    if (invert) idx = 255 - idx;
    const li = idx * 3;
    data[i] = cacheRgb[i] * invStrength + lut[li] * strength;
    data[i + 1] = cacheRgb[i + 1] * invStrength + lut[li + 1] * strength;
    data[i + 2] = cacheRgb[i + 2] * invStrength + lut[li + 2] * strength;
    data[i + 3] = 255;
  }
  outCtx!.putImageData(outImg!, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(outCanvas, fitX, fitY, fw, fh);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 0.75;
  ctx.strokeRect(fitX + 0.5, fitY + 0.5, fw - 1, fh - 1);
}

function refreshExternal() {
  const img = props.getSourceImg();
  const src = img?.currentSrc || img?.src || null;
  if (img && img.complete && src && src !== lastSrc) {
    decodeSource(img);
    lastSrc = src;
  } else if (!img && lastSrc !== null) {
    cacheRgb = null; cacheLuma = null; lastSrc = null;
  }
  hintText.value = cacheRgb ? "Live preview" : "Connect an image";
  // Dirty-check: skip the (heavy) remap unless something the preview depends on
  // actually changed. This is what keeps the idle poll from pegging the CPU.
  const sig = `${lastSrc}|${cacheW}x${cacheH}|${props.getRamp()}|${props.getInvert()}|${props.getStrength()}`;
  if (sig !== lastSig) { lastSig = sig; redraw(); }
}

function forceResize(): boolean {
  return syncCanvasSize();
}
function cleanup() {
  ro?.disconnect();
}

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
  height: 100%;
  box-sizing: border-box;
  background: var(--comfy-menu-bg, #1a1c22);
  border: 1px solid var(--border-color, #2a2d36);
  border-radius: 6px;
  overflow: hidden;
  font: 11px Inter, sans-serif;
}
.nkd-canvas {
  width: 100%;
  aspect-ratio: 320 / 200;
  height: auto;
  display: block;
  flex: 0 0 auto;
}
.nkd-bar {
  flex: 1 0 auto;
  background: var(--comfy-menu-bg, #1a1c22);
  border-top: 1px solid var(--border-color, #2a2d36);
}
.nkd-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nkd-row--controls { padding: 5px 8px; }
.nkd-hint {
  font-size: 9.5px;
  color: rgba(255,255,255,0.32);
  opacity: 0.7;
  white-space: nowrap;
}
</style>
