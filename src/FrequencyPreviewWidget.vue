<template>
  <div class="nkd-root" @mousedown.stop @mouseup.stop @mousemove.stop>
    <canvas
      ref="canvas"
      class="nkd-canvas"
      :class="{ 'nkd-canvas--pan': zoom }"
      :style="{ aspectRatio: canvasAspect }"
      @mousedown.stop.prevent="onDown"
      @mousemove.stop="onMove"
      @mouseup.stop="onUp"
      @mouseleave.stop="onUp"
    ></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-label">Low</span>
        <input class="nkd-slider" type="range" min="0" max="1" step="0.01"
               v-model.number="blend" @input="drawWipe" />
        <span class="nkd-label">High</span>
      </div>
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hintText }}</span>
        <span class="nkd-spacer"></span>
        <button class="nkd-btn" @click.stop="toggleZoom">{{ zoomLabel }}</button>
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
const zoom = ref(false);            // false = Fit (whole image), true = 1:1 crop
const pan = ref<[number, number]>([0.5, 0.5]);  // crop center, normalised
const zoomLabel = ref("1:1");

let cacheW = 0, cacheH = 0;
let cacheRgba: Uint8ClampedArray | null = null;
let lastSrc: string | null = null;
let offscreen: HTMLCanvasElement | null = null;
// Pixels-per-source-pixel of the current cache. The filters run on the cache,
// so `radius` must be scaled by this or the preview shows a much wider blur
// than the render (r3 on a 640px cache of a 2048px image ≈ r10 at full res).
let cacheScale = 1;

// Image pushed by the backend on partial-execution (for sources that arrive via
// a resize/subgraph, where the upstream node has no decoded imgs to read). It
// arrives already downscaled, so srcW/srcH carry the node's real render size.
let sentCanvas: HTMLCanvasElement | null = null;
let sentW = 0, sentH = 0, sentSrcW = 0, sentSrcH = 0;

let sep: Separation | null = null; // cached HF/LF views (heavy — recomputed on filter change)
let outCanvas: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;
let outImg: ImageData | null = null;
let lastSig = "";

// The best pixels available, plus the resolution the NODE renders at (which a
// backend-pushed image no longer has — it arrives downscaled to ≤512).
interface Source { drawable: CanvasImageSource; natW: number; natH: number; srcW: number; srcH: number }
function source(): Source | null {
  const img = props.getSourceImg();
  if (img?.complete && img.naturalWidth > 0) {
    const w = img.naturalWidth, h = img.naturalHeight;
    return { drawable: img, natW: w, natH: h, srcW: w, srcH: h };  // full res, live
  }
  if (sentCanvas) {
    return { drawable: sentCanvas, natW: sentW, natH: sentH,
             srcW: sentSrcW || sentW, srcH: sentSrcH || sentH };
  }
  return null;
}

// Fit: downscale the whole image (fast overview; radius scaled to match).
// 1:1 : crop the visible box at native resolution — the only way to judge the
// real high-frequency, which a downscale destroys by definition.
function buildCache(): boolean {
  const s = source();
  if (!s) { cacheRgba = null; return false; }
  if (!offscreen) offscreen = document.createElement("canvas");
  const octx = offscreen.getContext("2d", { willReadFrequently: true })!;

  if (zoom.value) {
    const cw = Math.max(16, Math.min(s.natW, Math.round(logicalW || 320)));
    const ch = Math.max(16, Math.min(s.natH, Math.round(logicalH || 210)));
    const sx = Math.round((s.natW - cw) * Math.min(1, Math.max(0, pan.value[0])));
    const sy = Math.round((s.natH - ch) * Math.min(1, Math.max(0, pan.value[1])));
    offscreen.width = cacheW = cw; offscreen.height = cacheH = ch;
    octx.drawImage(s.drawable, sx, sy, cw, ch, 0, 0, cw, ch);
    cacheScale = s.natW / s.srcW;  // 1 for a real image; <1 if all we got was the sent copy
  } else {
    const fit = Math.min(CACHE_RES / Math.max(s.natW, s.natH), 1);
    offscreen.width = cacheW = Math.max(1, Math.round(s.natW * fit));
    offscreen.height = cacheH = Math.max(1, Math.round(s.natH * fit));
    octx.drawImage(s.drawable, 0, 0, cacheW, cacheH);
    cacheScale = cacheW / s.srcW;
  }
  cacheRgba = octx.getImageData(0, 0, cacheW, cacheH).data;
  return true;
}

function opts(): FreqOpts {
  return {
    method: (props.getMethod() as Method) || "Guided",
    // Scaled to the cache — see cacheScale. Never below 1: a sub-pixel radius
    // would mean "no filter at all", which is a worse lie than rounding up.
    radius: Math.max(1, Math.round((Number(props.getRadius()) || 8) * cacheScale)),
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

// Heavy: rebuild the cache (crop/downscale), run the filters, cache both
// HF/LF views. Then draw the wipe.
function recompute() {
  sep = buildCache() ? computeSeparation(cacheRgba!, cacheW, cacheH, opts()) : null;
  drawWipe();
}

// --- Fit / 1:1 --------------------------------------------------------------

function toggleZoom() {
  zoom.value = !zoom.value;
  lastSig = "__force__";
  recompute();
}

// Drag to move the 1:1 crop around the image.
let dragging = false;
let dragX = 0, dragY = 0;
let panTimer: number | undefined;
function onDown(e: MouseEvent) {
  if (!zoom.value) return;
  dragging = true; dragX = e.clientX; dragY = e.clientY;
}
function onMove(e: MouseEvent) {
  if (!dragging) return;
  const s = source();
  if (!s) return;
  // Drag moves the image under a fixed window, so the crop origin goes the
  // other way; span is how far the crop can travel, in source pixels.
  const spanX = Math.max(1, s.natW - cacheW), spanY = Math.max(1, s.natH - cacheH);
  pan.value = [
    Math.min(1, Math.max(0, pan.value[0] - (e.clientX - dragX) / spanX)),
    Math.min(1, Math.max(0, pan.value[1] - (e.clientY - dragY) / spanY)),
  ];
  dragX = e.clientX; dragY = e.clientY;
  // Debounced: the filters are the expensive part, not the crop.
  window.clearTimeout(panTimer);
  panTimer = window.setTimeout(() => { lastSig = "__force__"; recompute(); }, 80);
}
function onUp() { dragging = false; }

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
function setSentImage(rgb: Uint8Array, w: number, h: number,
                      srcW = 0, srcH = 0) {
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0, j = 0; p < n; p++, i += 4, j += 3) {
    rgba[i] = rgb[j]; rgba[i + 1] = rgb[j + 1]; rgba[i + 2] = rgb[j + 2]; rgba[i + 3] = 255;
  }
  sentW = w; sentH = h;
  sentSrcW = srcW || w; sentSrcH = srcH || h;
  const c = sentCanvas ?? document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d")!;
  const id = cx.createImageData(w, h);
  id.data.set(rgba);
  cx.putImageData(id, 0, 0);
  sentCanvas = c;
  lastSrc = "__sent__";
  const wantAspect = `${sentSrcW} / ${sentSrcH}`;
  if (wantAspect !== canvasAspect.value) canvasAspect.value = wantAspect;
  lastSig = "__force__"; recompute();
}

function refreshExternal() {
  const s = source();
  const img = props.getSourceImg();
  const src = img?.currentSrc || img?.src || (s ? "__sent__" : null);
  if (!s && lastSrc !== null) { cacheRgba = null; sep = null; lastSrc = null; }
  else if (s) lastSrc = src;

  const layer = blend.value >= 0.99 ? "all HF" : blend.value <= 0.01 ? "all LF" : "HF ◄ wipe ► LF";
  const rawR = Number(props.getRadius()) || 8;
  if (!s) {
    hintText.value = "Connect an image";
    zoomLabel.value = "1:1";
  } else if (zoom.value) {
    // cacheScale < 1 here means the full-res pixels never reached the browser
    // (source behind a subgraph → backend sends a ≤512px copy). Say so rather
    // than claim a 1:1 we don't have.
    const pct = Math.round(cacheScale * 100);
    zoomLabel.value = "Fit";
    hintText.value = cacheScale >= 0.999
      ? `${layer} · ${props.getMethod()} · r${rawR} · 1:1 · drag to pan`
      : `${layer} · r${rawR} · ${pct}% max (source not local) · drag to pan`;
  } else {
    zoomLabel.value = "1:1";
    const eff = Math.max(1, Math.round(rawR * cacheScale));
    hintText.value = `${layer} · ${props.getMethod()} · r${rawR} → r${eff} @ ${Math.round(cacheScale * 100)}%`;
  }

  const wantAspect = s ? `${s.srcW} / ${s.srcH}` : DEFAULT_ASPECT;
  if (wantAspect !== canvasAspect.value) { canvasAspect.value = wantAspect; return; }
  const o = opts();
  const sig = `${lastSrc}|${zoom.value}|${pan.value.join()}|${Math.round(logicalW)}`
    + `|${o.method}|${rawR}|${o.edge}|${o.mode}|${o.detail}|${o.linear}`;
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
.nkd-canvas--pan { cursor: grab; }
.nkd-canvas--pan:active { cursor: grabbing; }
.nkd-spacer { flex: 1 1 auto; }
.nkd-btn {
  background: var(--comfy-input-bg, #252830);
  border: 1px solid var(--border-color, #3a3d46);
  color: var(--input-text, rgba(255,255,255,0.65));
  border-radius: 5px;
  padding: 1px 7px;
  font-size: 10px;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.nkd-btn:hover { border-color: #4ab4ff; color: rgba(255,255,255,0.95); }
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
