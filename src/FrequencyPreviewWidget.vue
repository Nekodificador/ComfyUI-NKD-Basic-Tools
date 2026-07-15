<template>
  <div class="nkd-root">
    <canvas ref="canvas" class="nkd-canvas" :style="{ aspectRatio: canvasAspect }"></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-label">Low</span>
        <input class="nkd-slider" type="range" min="0" max="1" step="0.01"
               v-model.number="blend" @input="drawWipe" />
        <span class="nkd-label">High</span>
      </div>
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hintText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { computeSeparation, type FreqOpts, type Method, type Mode, type Detail, type Separation } from "./freqSep";

const props = defineProps<{
  getSourceImg: () => HTMLImageElement | null;
  getMethod: () => string;
  getRadius: () => number;
  getEdge: () => number;
  getMode: () => string;
  getDetail: () => string;
  getLinear: () => boolean;
}>();

const MIN_RENDER_SCALE = 2;
const CACHE_RES = 512; // longest side of the cached decode — this is a FAST, low-res
                       // CPU guide for scrubbing. For pixel-exact full-res, view the
                       // node's high_frequency output (GPU-computed) in a PreviewImage.
const DEFAULT_ASPECT = "16 / 10";

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let dpr = window.devicePixelRatio || 1;
let logicalW = 0, logicalH = 0;

const hintText = ref("Connect an image");
const canvasAspect = ref(DEFAULT_ASPECT);
const blend = ref(1); // 0 = low frequency, 1 = high frequency

let cacheW = 0, cacheH = 0;
let cacheRgba: Uint8ClampedArray | null = null;
let lastSrc: string | null = null;
let offscreen: HTMLCanvasElement | null = null;

// Image pushed by the backend on partial-execution (for sources that arrive via
// a resize/subgraph, where the upstream node has no decoded imgs to read).
let sentRgba: Uint8ClampedArray | null = null;
let sentW = 0, sentH = 0;

let sep: Separation | null = null; // cached HF/LF views (heavy — recomputed on filter change)
let outCanvas: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;
let outImg: ImageData | null = null;
let lastSig = "";

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
  cacheRgba = octx.getImageData(0, 0, cacheW, cacheH).data;
}

function opts(): FreqOpts {
  return {
    method: (props.getMethod() as Method) || "Guided",
    radius: Number(props.getRadius()) || 8,
    edge: Number(props.getEdge()) || 0.1,
    mode: (props.getMode() as Mode) || "Divide",
    detail: (props.getDetail() as Detail) || "Luminance",
    linear: !!props.getLinear(),
  };
}

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  logicalW = rect.width; logicalH = rect.height;
  const s = Math.max(dpr, MIN_RENDER_SCALE);
  const newW = Math.round(rect.width * s), newH = Math.round(rect.height * s);
  if (c.width !== newW || c.height !== newH) { c.width = newW; c.height = newH; ctx = c.getContext("2d"); }
  ctx?.setTransform(newW / rect.width, 0, 0, newH / rect.height, 0, 0);
  drawWipe();
  return true;
}

// Heavy: run the filters and cache both HF/LF views. Then draw the wipe.
function recompute() {
  sep = cacheRgba ? computeSeparation(cacheRgba, cacheW, cacheH, opts()) : null;
  drawWipe();
}

// Cheap: SOLID wipe — high frequency left of the divider, low frequency right,
// hard split at the slider position (no opacity blend). Lets you compare the
// two bands side by side. No filter recompute.
function drawWipe() {
  if (!ctx || logicalW < 1) return;
  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, logicalW, logicalH);

  if (!sep) {
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Connect an image", logicalW / 2, logicalH / 2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    return;
  }

  if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = cacheW; outCanvas.height = cacheH;
    outCtx = outCanvas.getContext("2d");
    outImg = outCtx!.createImageData(cacheW, cacheH);
  }
  const t = Math.max(0, Math.min(1, blend.value));
  const split = Math.round(t * cacheW); // columns [0,split) = HF, [split,W) = LF
  const d = outImg!.data, hf = sep.hf, lf = sep.lf;
  for (let y = 0; y < cacheH; y++) {
    const row = y * cacheW;
    for (let x = 0; x < cacheW; x++) {
      const i = (row + x) * 4;
      const s = x < split ? hf : lf;
      d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255;
    }
  }
  outCtx!.putImageData(outImg!, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(outCanvas, 0, 0, logicalW, logicalH);

  // divider line at the wipe position
  if (split > 0 && split < cacheW) {
    const dx = (split / cacheW) * logicalW;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, logicalH); ctx.stroke();
  }
}

// Backend push: raw RGB bytes of the resolved input. Use it as the preview
// source (a directly-connected Load Image still takes priority when present).
function setSentImage(rgb: Uint8Array, w: number, h: number) {
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0, j = 0; p < n; p++, i += 4, j += 3) {
    rgba[i] = rgb[j]; rgba[i + 1] = rgb[j + 1]; rgba[i + 2] = rgb[j + 2]; rgba[i + 3] = 255;
  }
  sentRgba = rgba; sentW = w; sentH = h;
  cacheRgba = rgba; cacheW = w; cacheH = h; lastSrc = "__sent__";
  const wantAspect = `${w} / ${h}`;
  if (wantAspect !== canvasAspect.value) canvasAspect.value = wantAspect;
  lastSig = "__force__"; recompute();
}

function refreshExternal() {
  const img = props.getSourceImg();
  const src = img?.currentSrc || img?.src || null;
  if (img && img.complete && src && src !== lastSrc) { decodeSource(img); lastSrc = src; }
  else if (!img && sentRgba && lastSrc !== "__sent__") {
    cacheRgba = sentRgba; cacheW = sentW; cacheH = sentH; lastSrc = "__sent__";  // fall back to the sent image
  }
  else if (!img && !sentRgba && lastSrc !== null) { cacheRgba = null; lastSrc = null; }

  const o = opts();
  const layer = blend.value >= 0.99 ? "all HF" : blend.value <= 0.01 ? "all LF" : "HF ◄ wipe ► LF";
  hintText.value = cacheRgba
    ? `${layer} · ${o.method} · r${o.radius}`
    : "Connect an image";
  const wantAspect = cacheRgba ? `${cacheW} / ${cacheH}` : DEFAULT_ASPECT;
  if (wantAspect !== canvasAspect.value) { canvasAspect.value = wantAspect; return; }
  const sig = `${lastSrc}|${cacheW}x${cacheH}|${o.method}|${o.radius}|${o.edge}|${o.mode}|${o.detail}|${o.linear}`;
  if (sig !== lastSig) { lastSig = sig; recompute(); }
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
.nkd-root, .nkd-root *, .nkd-root *::before, .nkd-root *::after { box-sizing: border-box; }
.nkd-canvas { width: 100%; height: auto; display: block; flex: 0 0 auto; }
.nkd-bar { flex: 0 0 auto; background: var(--comfy-menu-bg, #1a1c22); border-top: 1px solid var(--border-color, #2a2d36); }
.nkd-row { display: flex; align-items: center; gap: 6px; }
.nkd-row--controls { padding: 5px 8px; }
.nkd-hint { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap; }
.nkd-label { font-size: 9.5px; color: rgba(255,255,255,0.45); white-space: nowrap; }
.nkd-slider {
  flex: 1 1 auto;
  min-width: 40px;
  height: 3px;
  accent-color: #4ab4ff;
  cursor: ew-resize;
}
</style>
