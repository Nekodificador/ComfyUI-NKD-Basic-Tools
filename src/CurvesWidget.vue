<template>
  <div class="nkd-root" @pointerdown.stop @mousedown.stop @mouseup.stop @mousemove.stop @contextmenu.prevent>
    <canvas ref="preview" class="nkd-preview" :style="{ aspectRatio: previewAspect }"></canvas>
    <canvas
      ref="canvas"
      class="nkd-canvas"
      :style="{ cursor }"
      @pointerdown.stop.prevent="onDown"
      @dblclick.stop.prevent="onDblClick"
      @pointermove.stop="onMove"
      @pointerup.stop="onUp"
      @pointercancel.stop="onUp"
      @pointerleave.stop="onLeave"
    ></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <button
          v-for="c in CHANNELS"
          :key="c"
          class="nkd-btn nkd-btn--ch"
          :class="{ 'nkd-btn--on': channel === c }"
          :style="channel === c ? { borderColor: CH_COLOR[c], color: CH_COLOR[c] } : {}"
          @click.stop="setChannel(c)"
        >{{ c.toUpperCase() }}</button>
        <span class="nkd-spacer"></span>
        <button class="nkd-btn" title="Reset this channel" @click.stop="resetChannel">Reset</button>
        <button class="nkd-btn" title="Reset every channel" @click.stop="resetAll">All</button>
      </div>
      <div class="nkd-row nkd-row--hint">
        <span v-if="readout" class="nkd-info">{{ readout }}</span>
        <span v-else-if="maskNote" class="nkd-hint nkd-hint--warn">{{ maskNote }}</span>
        <span v-else class="nkd-hint">Click: add · Double-click: corner · Shift: fine · Right-click: delete</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

type Pt = [number, number, number?];  // third = 1 marks a corner
type Channel = "rgb" | "r" | "g" | "b";

const props = defineProps<{
  onChange: (json: string) => void;
  getSourceImg: () => HTMLImageElement | null;
  getMaskImg: () => HTMLImageElement | null;
  hasMask: () => boolean;
}>();

const CHANNELS: Channel[] = ["rgb", "r", "g", "b"];
const CH_COLOR: Record<Channel, string> = { rgb: "#4ab4ff", r: "#ff5c5c", g: "#4cd97b", b: "#5a8cff" };
const CW = 320, CH = 240;
const PAD = 10;
const IW = CW - 2 * PAD, IH = CH - 2 * PAD;
const HIT_R = 10;
const MIN_GAP = 0.01;   // min x distance between neighbouring points
const DELETE_OUT = 24;  // px beyond the plot that turns a drag into a delete
const FINE_GAIN = 0.1;  // Shift = ×0.1, pack-wide convention
const MIN_RENDER_SCALE = 2;
const CACHE_RES = 640;
const DEFAULT_ASPECT = "16 / 10";
const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

const C = {
  bg: "#111318",
  grid: "rgba(255,255,255,0.06)",
  gridBorder: "rgba(255,255,255,0.16)",
  diag: "rgba(255,255,255,0.12)",
  hist: "rgba(255,255,255,0.09)",
  ptHover: "#ffd166",
  ptActive: "#ff6b6b",
  ptStroke: "rgba(0,0,0,0.65)",
} as const;

// ── Spline: clamped uniform B-spline over the points, same as nkd_curves.py ──
const SPLINE_DEGREE = 3;
const SPLINE_SAMPLES = 500;

function bsplineTable(pts: Pt[]): [Float64Array, Float64Array] {
  // A corner repeats its point `degree` times: continuity drops to C0 there, so
  // the curve runs through it with a sharp kink (same as NKD Vector Mask).
  pts = pts.flatMap((q) => (q[2] ? [q, q, q] : [q]));
  const n = pts.length, p = Math.min(SPLINE_DEGREE, n - 1), inner = n - p;
  const knots: number[] = [];
  for (let i = 0; i <= p; i++) knots.push(0);
  for (let i = 1; i < inner; i++) knots.push(i / inner);
  for (let i = 0; i <= p; i++) knots.push(1);
  const xs = new Float64Array(SPLINE_SAMPLES + 1), ys = new Float64Array(SPLINE_SAMPLES + 1);
  const N = new Float64Array(knots.length - 1);
  for (let s = 0; s <= SPLINE_SAMPLES; s++) {
    const u = Math.min(s / SPLINE_SAMPLES, 1 - 1e-10);
    for (let i = 0; i < N.length; i++) N[i] = knots[i] <= u && u < knots[i + 1] ? 1 : 0;
    for (let d = 1; d <= p; d++) { // Cox-de Boor, in place (N[i+1] still holds degree d-1)
      for (let i = 0; i < N.length - d; i++) {
        const a = knots[i + d] > knots[i] ? ((u - knots[i]) / (knots[i + d] - knots[i])) * N[i] : 0;
        const b = knots[i + d + 1] > knots[i + 1]
          ? ((knots[i + d + 1] - u) / (knots[i + d + 1] - knots[i + 1])) * N[i + 1] : 0;
        N[i] = a + b;
      }
    }
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += N[i] * pts[i][0]; y += N[i] * pts[i][1]; }
    xs[s] = x; ys[s] = y;
  }
  return [xs, ys];
}

function curveLut(pts: Pt[], n: number): Float32Array {
  const [xs, ys] = bsplineTable(pts);
  const last = xs.length - 1;
  const out = new Float32Array(n);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    if (x <= xs[0]) { out[j] = ys[0]; continue; }
    if (x >= xs[last]) { out[j] = ys[last]; continue; }
    while (x > xs[k + 1]) k++;
    const dx = xs[k + 1] - xs[k];
    const t = dx > 0 ? (x - xs[k]) / dx : 0;
    out[j] = Math.min(1, Math.max(0, ys[k] + t * (ys[k + 1] - ys[k])));
  }
  return out;
}

// ── State ──
const identity = (): Pt[] => [[0, 0], [1, 1]];
let curves: Record<Channel, Pt[]> = { rgb: identity(), r: identity(), g: identity(), b: identity() };
const channel = ref<Channel>("rgb");
const readout = ref("");
const maskNote = ref("");
const cursor = ref("crosshair");
const previewAspect = ref(DEFAULT_ASPECT);

const canvas = ref<HTMLCanvasElement | null>(null);
const preview = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let pctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
const dpr = window.devicePixelRatio || 1;

let hoverIdx = -1;
let dragIdx = -1;
let pendingDelete = false;
let dragOffX = 0, dragOffY = 0;
let virtX = 0, virtY = 0, lastCX = 0, lastCY = 0;

const toCX = (nx: number) => PAD + nx * IW;
const toCY = (ny: number) => PAD + (1 - ny) * IH;
const rawNX = (cx: number) => (cx - PAD) / IW;
const rawNY = (cy: number) => 1 - (cy - PAD) / IH;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const isIdentity = (pts: Pt[]) => pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;

function activePts(): Pt[] {
  const pts = curves[channel.value];
  return pendingDelete && dragIdx >= 0 ? pts.filter((_, i) => i !== dragIdx) : pts;
}

function serialise(): string {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  const out: Record<string, number[][]> = {};
  for (const c of CHANNELS) out[c] = curves[c].map(([x, y, k]) => (k ? [r(x), r(y), 1] : [r(x), r(y)]));
  return JSON.stringify(out);
}

function deserialise(json: string) {
  let data: any = {};
  try { data = JSON.parse(json); } catch { /* defaults */ }
  for (const c of CHANNELS) {
    const raw = Array.isArray(data?.[c]) ? data[c] : [];
    const pts: Pt[] = raw
      .filter((p: any) => Array.isArray(p) && p.length >= 2)
      .map((p: any) => (p[2] ? [clamp01(Number(p[0]) || 0), clamp01(Number(p[1]) || 0), 1]
        : [clamp01(Number(p[0]) || 0), clamp01(Number(p[1]) || 0)]) as Pt)
      .sort((a: Pt, b: Pt) => a[0] - b[0]);
    curves[c] = pts.length >= 2 ? pts : identity();
  }
  redrawAll();
}

function commit() {
  props.onChange(serialise());
  redrawAll();
}

// ── Source cache (same pattern as the Gradient Map preview) ──
let cacheW = 0, cacheH = 0;
let cacheRgb: Uint8ClampedArray | null = null;
let cacheMask: Float32Array | null = null;
let lastSrc: string | null = null, lastMaskSrc: string | null = null;
let hist: Record<Channel, Float32Array> | null = null;
let offscreen: HTMLCanvasElement | null = null;
let outCanvas: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;
let outImg: ImageData | null = null;
let lastSig = "";

function buildHistogram() {
  if (!cacheRgb) { hist = null; return; }
  const h = { rgb: new Float32Array(256), r: new Float32Array(256), g: new Float32Array(256), b: new Float32Array(256) };
  const d = cacheRgb;
  for (let i = 0; i < d.length; i += 4) {
    h.r[d[i]]++; h.g[d[i + 1]]++; h.b[d[i + 2]]++;
    h.rgb[Math.round(d[i] * LUMA_R + d[i + 1] * LUMA_G + d[i + 2] * LUMA_B)]++;
  }
  // ponytail: normalise ignoring the clipped 0/255 bins, they'd flatten everything else
  for (const c of CHANNELS) {
    let mx = 1;
    for (let i = 1; i < 255; i++) mx = Math.max(mx, h[c][i]);
    for (let i = 0; i < 256; i++) h[c][i] = Math.min(1, h[c][i] / mx);
  }
  hist = h;
}

function decodeSource(img: HTMLImageElement) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.min(1, CACHE_RES / Math.max(iw, ih));
  cacheW = Math.max(1, Math.round(iw * scale));
  cacheH = Math.max(1, Math.round(ih * scale));
  if (!offscreen) offscreen = document.createElement("canvas");
  offscreen.width = cacheW; offscreen.height = cacheH;
  const octx = offscreen.getContext("2d")!;
  octx.drawImage(img, 0, 0, cacheW, cacheH);
  cacheRgb = octx.getImageData(0, 0, cacheW, cacheH).data;
  buildHistogram();
}

// Two mask sources, alpha first:
// - alphaMask: a Load Image's painted alpha (its MASK is 1 - alpha), read client-side
//   so it previews without running. Only trusted when the alpha actually varies.
// - sentMask: the resolved mask the backend pushes on execution — any source works,
//   but only once the node has run. Kept at its own size and fitted to the cache grid,
//   since a directly connected Load Image re-decodes the source at another size.
let alphaMask: Float32Array | null = null;
let sentMask: { d: Uint8Array; w: number; h: number } | null = null;
let sentSeq = 0;
let maskKey = "";

function decodeMask(img: HTMLImageElement): Float32Array | null {
  if (!cacheW || !cacheH) return null;
  const c = document.createElement("canvas");
  c.width = cacheW; c.height = cacheH;
  const mctx = c.getContext("2d")!;
  mctx.drawImage(img, 0, 0, cacheW, cacheH);
  const data = mctx.getImageData(0, 0, cacheW, cacheH).data;
  let varies = false;
  for (let i = 3; i < data.length; i += 4) { if (data[i] < 250) { varies = true; break; } }
  if (!varies) return null;
  const m = new Float32Array(cacheW * cacheH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) m[p] = 1 - data[i + 3] / 255;
  return m;
}

function resolveMask() {
  cacheMask = alphaMask;
  if (cacheMask || !sentMask || !cacheW) return;
  const { d, w, h } = sentMask;
  const m = new Float32Array(cacheW * cacheH);
  for (let y = 0, p = 0; y < cacheH; y++) {
    const row = Math.min(h - 1, Math.floor((y * h) / cacheH)) * w;
    for (let x = 0; x < cacheW; x++, p++) m[p] = d[row + Math.min(w - 1, Math.floor((x * w) / cacheW))] / 255;
  }
  cacheMask = m;
}

function setSentImage(rgb: Uint8Array, w: number, h: number, mask: Uint8Array | null) {
  const n = w * h;
  const data = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0, j = 0; p < n; p++, i += 4, j += 3) {
    data[i] = rgb[j]; data[i + 1] = rgb[j + 1]; data[i + 2] = rgb[j + 2]; data[i + 3] = 255;
  }
  cacheRgb = data; cacheW = w; cacheH = h;
  lastSrc = "__sent__"; lastMaskSrc = null; alphaMask = null;
  sentMask = mask ? { d: mask, w, h } : null;
  sentSeq++;
  buildHistogram();
  previewAspect.value = `${w} / ${h}`;
  refreshExternal();
}

function refreshExternal() {
  const img = props.getSourceImg();
  const src = img?.currentSrc || img?.src || null;
  let srcChanged = false;
  if (img && img.complete && src && src !== lastSrc) {
    decodeSource(img); lastSrc = src; srcChanged = true;
  } else if (!img && lastSrc !== null && lastSrc !== "__sent__") {
    cacheRgb = null; hist = null; lastSrc = null;
  }
  const linked = props.hasMask();
  if (!linked) {
    alphaMask = null; sentMask = null; lastMaskSrc = null;
  } else {
    const mimg = props.getMaskImg();
    const msrc = mimg?.currentSrc || mimg?.src || null;
    if (mimg && mimg.complete && cacheRgb && (msrc !== lastMaskSrc || srcChanged)) {
      alphaMask = decodeMask(mimg); lastMaskSrc = msrc;
    }
  }
  const key = `${linked}|${lastMaskSrc}|${sentSeq}|${cacheW}x${cacheH}|${lastSrc}`;
  if (key !== maskKey) { maskKey = key; resolveMask(); }
  maskNote.value = linked && cacheRgb && !cacheMask ? "Mask connected · run the node (▶) to preview it" : "";
  const want = cacheRgb ? `${cacheW} / ${cacheH}` : DEFAULT_ASPECT;
  if (want !== previewAspect.value) { previewAspect.value = want; return; } // RO redraws
  const sig = `${key}|${cacheMask ? 1 : 0}`;
  if (sig !== lastSig) { lastSig = sig; redrawAll(); }
}

// ── Drawing ──
function redrawPreview() {
  const c = preview.value;
  if (!pctx || !c) return;
  const w = c.clientWidth, h = c.clientHeight;
  if (w < 1 || h < 1) return;
  pctx.fillStyle = C.bg;
  pctx.fillRect(0, 0, w, h);
  if (!cacheRgb) {
    pctx.font = "11px Inter, sans-serif";
    pctx.fillStyle = "rgba(255,255,255,0.32)";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText("Connect an image", w / 2, h / 2);
    return;
  }
  // 256-entry LUTs per channel, the RGB master applied on top.
  const master = curveLut(activeOr("rgb"), 256);
  const luts = (["r", "g", "b"] as Channel[]).map((ch) => {
    const l = curveLut(activeOr(ch), 256);
    const u = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const p = l[i] * 255, i0 = Math.min(254, p | 0), f = p - i0;
      u[i] = (master[i0] * (1 - f) + master[i0 + 1] * f) * 255 + 0.5;
    }
    return u;
  });
  if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = cacheW; outCanvas.height = cacheH;
    outCtx = outCanvas.getContext("2d");
    outImg = outCtx!.createImageData(cacheW, cacheH);
  }
  const src = cacheRgb, dst = outImg!.data, [lr, lg, lb] = luts;
  for (let p = 0, i = 0; i < dst.length; p++, i += 4) {
    const r = src[i], g = src[i + 1], b = src[i + 2];
    if (cacheMask) {
      const m = cacheMask[p], k = 1 - m;
      dst[i] = r * k + lr[r] * m; dst[i + 1] = g * k + lg[g] * m; dst[i + 2] = b * k + lb[b] * m;
    } else {
      dst[i] = lr[r]; dst[i + 1] = lg[g]; dst[i + 2] = lb[b];
    }
    dst[i + 3] = 255;
  }
  outCtx!.putImageData(outImg!, 0, 0);
  pctx.imageSmoothingEnabled = true;
  pctx.drawImage(outCanvas, 0, 0, w, h);
}

function activeOr(ch: Channel): Pt[] {
  return ch === channel.value ? activePts() : curves[ch];
}

function strokeCurve(pts: Pt[], color: string, width: number) {
  if (!ctx) return;
  const lut = curveLut(pts, IW + 1);
  ctx.beginPath();
  for (let j = 0; j <= IW; j++) {
    const x = PAD + j, y = toCY(lut[j]);
    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.stroke();
}

function redrawCurve() {
  if (!ctx) return;
  const ch = channel.value;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CW, CH);

  if (hist) {
    const hst = hist[ch];
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + IH);
    for (let i = 0; i < 256; i++) ctx.lineTo(PAD + (i / 255) * IW, PAD + IH - hst[i] * IH);
    ctx.lineTo(PAD + IW, PAD + IH);
    ctx.closePath();
    ctx.fillStyle = ch === "rgb" ? C.hist : CH_COLOR[ch] + "22";
    ctx.fill();
  }

  ctx.setLineDash([2.5, 5]);
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = C.grid;
  for (let i = 1; i < 4; i++) {
    const gx = PAD + (i / 4) * IW, gy = PAD + (i / 4) * IH;
    ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, PAD + IH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + IW, gy); ctx.stroke();
  }
  ctx.strokeStyle = C.diag;
  ctx.beginPath(); ctx.moveTo(toCX(0), toCY(0)); ctx.lineTo(toCX(1), toCY(1)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = C.gridBorder;
  ctx.strokeRect(PAD, PAD, IW, IH);

  // Edited curves of the other channels, faint, so the whole grade reads at once.
  for (const c of CHANNELS) {
    if (c !== ch && !isIdentity(curves[c])) strokeCurve(curves[c], CH_COLOR[c] + "66", 1);
  }
  // Control polygon: the points pull the curve rather than sit on it.
  const poly = activePts();
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx!.lineTo(toCX(x), toCY(y)) : ctx!.moveTo(toCX(x), toCY(y))));
  ctx.stroke();
  ctx.setLineDash([]);

  strokeCurve(poly, CH_COLOR[ch], 2);

  const pts = curves[ch];
  pts.forEach(([x, y, corner], i) => {
    if (i === dragIdx && pendingDelete) return;
    const active = i === dragIdx, hover = i === hoverIdx;
    const r = active ? 6 : hover ? 5.5 : 4.5;
    ctx!.beginPath();
    if (corner) ctx!.rect(toCX(x) - r * 0.85, toCY(y) - r * 0.85, r * 1.7, r * 1.7);  // corners read as squares
    else ctx!.arc(toCX(x), toCY(y), r, 0, Math.PI * 2);
    ctx!.fillStyle = active ? C.ptActive : hover ? C.ptHover : CH_COLOR[ch];
    ctx!.fill();
    ctx!.lineWidth = 1.5;
    ctx!.strokeStyle = C.ptStroke;
    ctx!.stroke();
  });
}

function redrawAll() {
  redrawCurve();
  redrawPreview();
}

function syncCanvasSize(): boolean {
  const c = canvas.value, p = preview.value;
  if (!c || !p) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const s = Math.max(dpr, MIN_RENDER_SCALE);
  const sx = Math.max((rect.width / CW) * dpr, s), sy = Math.max((rect.height / CH) * dpr, s);
  const w = Math.round(CW * sx), h = Math.round(CH * sy);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx = c.getContext("2d");
  ctx?.setTransform(sx, 0, 0, sy, 0, 0);

  const pw = p.clientWidth, ph = p.clientHeight;
  if (pw > 0 && ph > 0) {
    const nw = Math.round(pw * s), nh = Math.round(ph * s);
    if (p.width !== nw || p.height !== nh) { p.width = nw; p.height = nh; }
    pctx = p.getContext("2d");
    pctx?.setTransform(nw / pw, 0, 0, nh / ph, 0, 0);
  }
  redrawAll();
  return true;
}

// ── Interaction ──
function toLogical(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (CW / rect.width), y: (e.clientY - rect.top) * (CH / rect.height) };
}

function hitTest(x: number, y: number): number {
  const pts = curves[channel.value];
  let best = -1, bestD = HIT_R;
  pts.forEach(([px, py], i) => {
    const d = Math.hypot(toCX(px) - x, toCY(py) - y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

const fmt = (v: number) => Math.round(v * 255);

function updateReadout(x: number) {
  const idx = dragIdx >= 0 ? dragIdx : hoverIdx;
  const nx = idx >= 0 && !pendingDelete ? curves[channel.value][idx][0] : rawNX(x);
  if (nx < 0 || nx > 1) { readout.value = ""; return; }
  const lut = curveLut(activePts(), 256);
  readout.value = `In ${fmt(nx)} → Out ${fmt(lut[fmt(nx)])}`;
}

function onDown(e: PointerEvent) {
  const { x, y } = toLogical(e);
  const pts = curves[channel.value];
  let idx = hitTest(x, y);
  if (e.button === 2) {
    if (idx > 0 && idx < pts.length - 1) { pts.splice(idx, 1); hoverIdx = -1; commit(); }
    return;
  }
  if (e.button !== 0) return;
  if (idx < 0) {
    const nx = clamp01(rawNX(x)), ny = clamp01(rawNY(y));
    let at = pts.findIndex((p) => p[0] > nx);
    if (at <= 0) return; // outside the endpoints' span
    if (nx - pts[at - 1][0] < MIN_GAP || pts[at][0] - nx < MIN_GAP) return;
    pts.splice(at, 0, [nx, ny]);
    idx = at;
    dragOffX = dragOffY = 0;
  } else {
    dragOffX = pts[idx][0] - rawNX(x);
    dragOffY = pts[idx][1] - rawNY(y);
  }
  dragIdx = idx;
  pendingDelete = false;
  virtX = x; virtY = y; lastCX = x; lastCY = y;
  canvas.value?.setPointerCapture(e.pointerId);
  cursor.value = "grabbing";
  updateReadout(x);
  redrawAll();
}

function onMove(e: PointerEvent) {
  const { x, y } = toLogical(e);
  if (dragIdx < 0) {
    const h = hitTest(x, y);
    if (h !== hoverIdx) { hoverIdx = h; redrawCurve(); }
    cursor.value = h >= 0 ? "grab" : "crosshair";
    updateReadout(x);
    return;
  }
  // Incremental so toggling Shift mid-drag never jumps the point.
  const gain = e.shiftKey ? FINE_GAIN : 1;
  virtX += (x - lastCX) * gain; virtY += (y - lastCY) * gain;
  lastCX = x; lastCY = y;
  const pts = curves[channel.value];
  const last = pts.length - 1;
  const interior = dragIdx > 0 && dragIdx < last;
  pendingDelete = interior && (virtY < PAD - DELETE_OUT || virtY > PAD + IH + DELETE_OUT
    || virtX < PAD - DELETE_OUT || virtX > PAD + IW + DELETE_OUT);
  const lo = dragIdx > 0 ? pts[dragIdx - 1][0] + MIN_GAP : 0;
  const hi = dragIdx < last ? pts[dragIdx + 1][0] - MIN_GAP : 1;
  pts[dragIdx][0] = Math.max(lo, Math.min(hi, rawNX(virtX) + dragOffX));
  pts[dragIdx][1] = clamp01(rawNY(virtY) + dragOffY);
  updateReadout(x);
  redrawAll();
}

function onUp(e: PointerEvent) {
  if (dragIdx < 0) return;
  if (pendingDelete) curves[channel.value].splice(dragIdx, 1);
  dragIdx = -1;
  pendingDelete = false;
  canvas.value?.releasePointerCapture?.(e.pointerId);
  cursor.value = "crosshair";
  commit();
}

// Photoshop's convert-point toggle, as in Vector Mask. End points already sit on
// the curve, so only interior points convert.
function onDblClick(e: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  const idx = hitTest((e.clientX - rect.left) * (CW / rect.width), (e.clientY - rect.top) * (CH / rect.height));
  const pts = curves[channel.value];
  if (idx <= 0 || idx >= pts.length - 1) return;
  const p = pts[idx];
  if (p[2]) p.length = 2; else p[2] = 1;
  commit();
}

function onLeave() {
  if (dragIdx >= 0) return;
  hoverIdx = -1;
  readout.value = "";
  redrawCurve();
}

function setChannel(c: Channel) {
  channel.value = c;
  hoverIdx = -1;
  redrawCurve();
}

function resetChannel() {
  curves[channel.value] = identity();
  commit();
}

function resetAll() {
  for (const c of CHANNELS) curves[c] = identity();
  commit();
}

function forceResize(): boolean {
  return syncCanvasSize();
}

function cleanup() {
  ro?.disconnect();
}

onMounted(() => {
  ro = new ResizeObserver(() => syncCanvasSize());
  if (canvas.value) ro.observe(canvas.value);
  if (preview.value) ro.observe(preview.value);
  syncCanvasSize();
});
onBeforeUnmount(cleanup);

defineExpose({ serialise, deserialise, refreshExternal, setSentImage, forceResize, cleanup });
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
.nkd-preview {
  width: 100%;
  height: auto;
  display: block;
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border-color, #2a2d36);
}
.nkd-canvas {
  width: 100%;
  aspect-ratio: 320 / 240;
  height: auto;
  display: block;
  flex: 0 0 auto;
  touch-action: none;
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
.nkd-row--controls { padding: 5px 8px 3px; }
.nkd-row--hint { padding: 3px 8px 5px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.06)); }
.nkd-spacer { flex: 1 1 auto; }
.nkd-hint {
  font-size: 9.5px;
  color: rgba(255,255,255,0.32);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nkd-hint--warn { color: #ffb43c; opacity: 1; }
.nkd-info {
  font: 10px monospace;
  font-variant-numeric: tabular-nums;
  color: rgba(180,210,255,0.65);
  white-space: nowrap;
}
.nkd-btn {
  background: var(--comfy-input-bg, #252830);
  border: 1px solid var(--border-color, #3a3d46);
  color: var(--input-text, rgba(255,255,255,0.65));
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
  cursor: pointer;
}
.nkd-btn:hover {
  border-color: #4ab4ff;
  color: rgba(255,255,255,0.95);
}
.nkd-btn--ch { padding: 2px 6px; font-size: 10px; min-width: 30px; }
</style>
