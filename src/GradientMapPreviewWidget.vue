<template>
  <div class="nkd-root">
    <canvas ref="canvas" class="nkd-canvas" :style="{ aspectRatio: canvasAspect }"></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hintText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { buildRampLut, parseInterp } from "./rampInterp";

interface Stop { pos: number; color: string }

const props = defineProps<{
  getRamp: () => string;
  getInvert: () => boolean;
  getStrength: () => number;
  getSourceImg: () => HTMLImageElement | null;
  getMaskImg: () => HTMLImageElement | null;
}>();

const MIN_RENDER_SCALE = 2;
const CACHE_RES = 640; // longest side of the cached source decode — preview only
const DEFAULT_ASPECT = "16 / 10";

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let dpr = window.devicePixelRatio || 1;
let logicalW = 0, logicalH = 0; // CSS display size of the canvas

const hintText = ref("Connect an image");
// The canvas matches the source image aspect (portrait image → portrait
// canvas), so the remapped image fills it edge-to-edge — no letterbox waste.
const canvasAspect = ref(DEFAULT_ASPECT);

// Cached decode of the source image: RGB + luminance, at a small fixed
// resolution so ramp/invert/strength edits redraw instantly with no
// backend round-trip. Re-decoded only when the source image itself changes.
let cacheW = 0, cacheH = 0;
let cacheRgb: Uint8ClampedArray | null = null;
let cacheLuma: Float32Array | null = null;
let lastSrc: string | null = null;
let offscreen: HTMLCanvasElement | null = null;

// Optional connected mask, decoded to the same cache grid: the effect is
// confined to it (blend scaled per pixel), so the preview matches the render.
let cacheMask: Float32Array | null = null;
let lastMaskSrc: string | null = null;
let maskOffscreen: HTMLCanvasElement | null = null;

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

function parseRamp(): Stop[] {
  try {
    const data = JSON.parse(props.getRamp());
    if (Array.isArray(data.stops) && data.stops.length >= 2) {
      return [...data.stops].sort((a: Stop, b: Stop) => a.pos - b.pos);
    }
  } catch { /* fall through */ }
  return [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
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

// Decode the connected mask onto the source cache grid. ComfyUI's Load Image
// stores the mask as (1 - alpha), so we can only reliably reproduce it when the
// source actually carries a painted alpha channel. If the alpha is flat (no
// real mask in the thumbnail — e.g. a mask computed elsewhere), we leave the
// preview UNMASKED rather than guess and draw garbage; the render is confined
// correctly regardless.
function decodeMask(img: HTMLImageElement) {
  cacheMask = null;
  if (!cacheW || !cacheH) return;
  if (!maskOffscreen) maskOffscreen = document.createElement("canvas");
  maskOffscreen.width = cacheW; maskOffscreen.height = cacheH;
  const mctx = maskOffscreen.getContext("2d")!;
  mctx.clearRect(0, 0, cacheW, cacheH);
  mctx.drawImage(img, 0, 0, cacheW, cacheH);
  const data = mctx.getImageData(0, 0, cacheW, cacheH).data;
  let alphaVaries = false;
  for (let i = 3; i < data.length; i += 4) { if (data[i] < 250) { alphaVaries = true; break; } }
  if (!alphaVaries) return;  // no painted alpha → don't fake a mask
  const m = new Float32Array(cacheW * cacheH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) m[p] = 1 - data[i + 3] / 255;
  cacheMask = m;
}

// Backend push on partial-execution: raw RGB bytes of the resolved input, used
// as the preview source when it arrives behind a resize/subgraph (no decoded
// upstream img to read). A directly-connected Load Image still refreshes over it.
function setSentImage(rgb: Uint8Array, w: number, h: number) {
  const n = w * h;
  const data = new Uint8ClampedArray(n * 4);
  const luma = new Float32Array(n);
  for (let p = 0, i = 0, j = 0; p < n; p++, i += 4, j += 3) {
    data[i] = rgb[j]; data[i + 1] = rgb[j + 1]; data[i + 2] = rgb[j + 2]; data[i + 3] = 255;
    luma[p] = (rgb[j] * LUMA_R + rgb[j + 1] * LUMA_G + rgb[j + 2] * LUMA_B) / 255;
  }
  cacheRgb = data; cacheLuma = luma; cacheMask = null;
  cacheW = w; cacheH = h; lastSrc = "__sent__"; lastMaskSrc = null;
  hintText.value = "Live preview";
  const wantAspect = `${w} / ${h}`;
  if (wantAspect !== canvasAspect.value) canvasAspect.value = wantAspect;
  lastSig = "__force__"; redraw();
}

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  logicalW = rect.width; logicalH = rect.height;
  const s = Math.max(dpr, MIN_RENDER_SCALE);
  const newW = Math.round(rect.width * s), newH = Math.round(rect.height * s);
  if (c.width !== newW || c.height !== newH) {
    c.width = newW; c.height = newH;
    ctx = c.getContext("2d");
  }
  // Uniform scale — canvas aspect matches the image, so no distortion.
  ctx?.setTransform(newW / rect.width, 0, 0, newH / rect.height, 0, 0);
  redraw();
  return true;
}

function redraw() {
  if (!ctx || logicalW < 1) return;
  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, logicalW, logicalH);

  if (!cacheRgb || !cacheLuma) {
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Connect an image", logicalW / 2, logicalH / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return;
  }

  const rampStr = props.getRamp();
  const invert = props.getInvert();
  const strength = Math.max(0, Math.min(1, props.getStrength()));

  // Rebuild the LUT only when the ramp string changes (interp is baked in).
  if (rampStr !== lutKey) { rampLut = buildRampLut(parseRamp(), parseInterp(rampStr)); lutKey = rampStr; }
  const lut = rampLut!;

  // Reuse the output canvas + ImageData; only reallocate on cache-size change.
  if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = cacheW; outCanvas.height = cacheH;
    outCtx = outCanvas.getContext("2d");
    outImg = outCtx!.createImageData(cacheW, cacheH);
  }
  const data = outImg!.data;
  for (let p = 0, i = 0; p < cacheW * cacheH; p++, i += 4) {
    let idx = (cacheLuma[p] * 255) | 0;
    if (idx < 0) idx = 0; else if (idx > 255) idx = 255;
    if (invert) idx = 255 - idx;
    const li = idx * 3;
    // Confine to the mask: blend scaled per pixel (mask=0 → untouched original).
    const sf = cacheMask ? strength * cacheMask[p] : strength;
    const inv = 1 - sf;
    data[i] = cacheRgb[i] * inv + lut[li] * sf;
    data[i + 1] = cacheRgb[i + 1] * inv + lut[li + 1] * sf;
    data[i + 2] = cacheRgb[i + 2] * inv + lut[li + 2] * sf;
    data[i + 3] = 255;
  }
  outCtx!.putImageData(outImg!, 0, 0);
  // Canvas aspect already matches the image, so fill it edge-to-edge.
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(outCanvas, 0, 0, logicalW, logicalH);
}

function refreshExternal() {
  const img = props.getSourceImg();
  const src = img?.currentSrc || img?.src || null;
  let srcChanged = false;
  if (img && img.complete && src && src !== lastSrc) {
    decodeSource(img); lastSrc = src; srcChanged = true;
  } else if (!img && lastSrc !== null && lastSrc !== "__sent__") {
    // Keep a backend-pushed image (source lives behind a resize/subgraph, so
    // getSourceImg legitimately finds nothing); only clear a real disconnect.
    cacheRgb = null; cacheLuma = null; cacheMask = null; lastSrc = null; lastMaskSrc = null;
  }
  // Mask: (re)decode when it changes, or when the source grid it aligns to did.
  const mimg = props.getMaskImg();
  const msrc = mimg?.currentSrc || mimg?.src || null;
  if (mimg && mimg.complete && cacheRgb && (msrc !== lastMaskSrc || srcChanged)) {
    decodeMask(mimg); lastMaskSrc = msrc;
  } else if (!mimg && lastMaskSrc !== null) {
    cacheMask = null; lastMaskSrc = null;
  }
  hintText.value = cacheRgb ? (cacheMask ? "Live preview · masked" : "Live preview") : "Connect an image";
  // Match the canvas box to the image aspect. When it changes, the element
  // resizes → the ResizeObserver re-syncs the buffer and redraws.
  const wantAspect = cacheRgb ? `${cacheW} / ${cacheH}` : DEFAULT_ASPECT;
  if (wantAspect !== canvasAspect.value) { canvasAspect.value = wantAspect; return; }
  // Dirty-check: skip the (heavy) remap unless something the preview depends on
  // actually changed. This is what keeps the idle poll from pegging the CPU.
  const sig = `${lastSrc}|${lastMaskSrc}|${cacheW}x${cacheH}|${props.getRamp()}|${props.getInvert()}|${props.getStrength()}`;
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

defineExpose({ refreshExternal, forceResize, cleanup, setSentImage });
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
.nkd-root, .nkd-root *, .nkd-root *::before, .nkd-root *::after {
  box-sizing: border-box;
}
.nkd-canvas {
  width: 100%;
  height: auto;
  display: block;
  flex: 0 0 auto;
}
.nkd-bar {
  flex: 0 0 auto;
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
