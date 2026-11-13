<template>
  <div class="nkd-root" @pointerdown.stop @mousedown.stop @mouseup.stop @mousemove.stop @contextmenu.prevent>
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
      <div class="nkd-row">
        <span v-if="readout" class="nkd-info">{{ readout }}</span>
        <span v-else class="nkd-hint">{{ hint }}</span>
        <span class="nkd-spacer"></span>
        <template v-if="editable">
          <button class="nkd-btn" :class="{ on: mode === 'points' }" title="Add and move points" @click.stop="mode = 'points'">Points</button>
          <button class="nkd-btn" :class="{ on: mode === 'draw' }" title="Paint the curve freehand" @click.stop="mode = 'draw'">Draw</button>
          <button v-if="!state.binary" class="nkd-btn" title="Thin out the points between peaks and valleys" @click.stop="reduce">Reduce</button>
          <button class="nkd-btn" title="Back to the default curve" @click.stop="reset">Reset</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The curve 😺NKD Event Curve Audio turns into sound: time runs left to right over the clip,
// height is how loud the carrier is. Periodic shapes are previewed (same formulas as
// shape_curve in nkd_event_curve.py); `custom` is drawn here, with the tone-curve spline.
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { curveLut, type Pt } from "./bsplineLut";

const props = defineProps<{
  onChange: (json: string) => void;
  // kept current by the host from the node's widgets
  // binary: the guide reads the curve as on/off (P and B), so it is drawn as a staircase
  state: { shape: string; cycles: number; phase: number; seconds: number; hasSource: boolean; binary: boolean;
           sourceCurve: number[] | null };
}>();

const CW = 400, CH = 160;
const PAD = { top: 12, right: 10, bottom: 18, left: 26 };
const IW = CW - PAD.left - PAD.right, IH = CH - PAD.top - PAD.bottom;
const HIT_R = 10;
const MIN_GAP = 0.01;   // min x distance between neighbouring points
const FINE_GAIN = 0.1;  // Shift = x0.1, pack-wide convention
const MIN_RENDER_SCALE = 2;
const SAMPLES = 300;
const PULSE_WIDTH = 0.1;
const DRAW_GAP = 0.015;  // min x distance between freehand samples
const FLAT = 0.02;       // rises smaller than this count as flat, so hand jitter is not a peak

const C = {
  bg: "#111318",
  grid: "rgba(255,255,255,0.06)",
  gridBorder: "rgba(255,255,255,0.16)",
  curve: "#4ab4ff",
  curveFade: "rgba(74,180,255,0.15)",
  pt: "#4ab4ff",
  ptHover: "#ffd166",
  ptActive: "#ff6b6b",
  ptStroke: "rgba(0,0,0,0.65)",
  axisLabel: "rgba(255,255,255,0.40)",
  axisLabelDim: "rgba(255,255,255,0.20)",
} as const;

const defaults = (): Pt[] => [[0, 0], [0.25, 1], [0.5, 0], [0.75, 1], [1, 0]];
let points: Pt[] = defaults();

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
const dpr = window.devicePixelRatio || 1;
const cursor = ref("default");
const readout = ref("");

const mode = ref<"points" | "draw">("points");
let hoverIdx = -1, dragIdx = -1;
let stroke: Pt[] | null = null, before: Pt[] = [], strokeX = 0;   // freehand stroke and the curve it paints over
let virtX = 0, virtY = 0, lastX = 0, lastY = 0;   // damped pointer for the fine drag

const editable = computed(() => props.state.shape === "custom" && !props.state.hasSource);
const hint = computed(() =>
  props.state.hasSource ? (props.state.sourceCurve ? "Curve read from source on the last run"
      : "Run the node to see the curve read from source")
    : editable.value && mode.value === "draw" ? "Drag to paint the curve over what is there"
    : editable.value ? (props.state.binary
      ? "Each rise is one event · Click: add · Drag: move · Right-click: delete"
      : "Click: add · Double-click: corner · Shift: fine · Right-click: delete")
      : "Preview · pick the custom shape to draw your own");

const toCX = (nx: number) => PAD.left + nx * IW;
const toCY = (ny: number) => PAD.top + (1 - ny) * IH;
const rawNX = (cx: number) => (cx - PAD.left) / IW;
const rawNY = (cy: number) => 1 - (cy - PAD.top) / IH;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function shapeY(u: number): number {
  const c = u * props.state.cycles + props.state.phase, f = c - Math.floor(c);
  switch (props.state.shape) {
    case "sine": return 0.5 - 0.5 * Math.cos(2 * Math.PI * c);
    case "square": return f >= 0.5 ? 1 : 0;
    case "triangle": return 1 - Math.abs(2 * f - 1);
    case "sawtooth": return f;
    case "pulses": return f >= 0.5 && f < 0.5 + PULSE_WIDTH ? 1 : 0;
    default: return 0;
  }
}

// Same reading as custom_curve / execute in nkd_event_curve.py: an on/off guide holds each
// point's level until the next point, and reads any shape as above-or-below half.
function curveSamples(): Float32Array {
  const { shape, binary } = props.state;
  const src = props.state.hasSource ? props.state.sourceCurve : null;
  if (src?.length) {                                     // already in the guide's terms
    const out = new Float32Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) out[i] = src[Math.round((i / SAMPLES) * (src.length - 1))];
    return out;
  }
  if (shape === "custom" && !binary) return curveLut(points, SAMPLES + 1);
  const out = new Float32Array(SAMPLES + 1);
  for (let i = 0, k = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    if (shape === "custom") {
      while (k + 1 < points.length && points[k + 1][0] <= u) k++;
      out[i] = points[k][1] >= 0.5 ? 1 : 0;
    } else {
      const y = shapeY(u);
      out[i] = binary ? (y >= 0.5 ? 1 : 0) : y;
    }
  }
  return out;
}

function serialise(): string {
  return JSON.stringify({   // a third 1 marks a corner, as in NKD Curves
    points: points.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4), ...(p[2] ? [1] : [])]),
  });
}

function deserialise(json: string) {
  let pts: Pt[] = [];
  try {
    const raw = JSON.parse(json)?.points;
    if (Array.isArray(raw)) {
      pts = raw.filter((p: any) => Array.isArray(p) && p.length >= 2 && isFinite(+p[0]) && isFinite(+p[1]))
        .map((p: any): Pt => (p[2] ? [clamp01(+p[0]), clamp01(+p[1]), 1] : [clamp01(+p[0]), clamp01(+p[1])]))
        .sort((a, b) => a[0] - b[0]);
    }
  } catch { /* fall through to the default */ }
  if (pts.length < 2) pts = defaults();
  pts[0][0] = 0; pts[pts.length - 1][0] = 1;
  points = pts;
  redraw();
}

function commit() { props.onChange(serialise()); }

function redraw() {
  if (!ctx) return;
  const g = ctx;
  g.clearRect(0, 0, CW, CH);
  g.fillStyle = C.bg; g.fillRect(0, 0, CW, CH);

  g.lineWidth = 0.75; g.strokeStyle = C.grid; g.setLineDash([2.5, 5]);
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(toCX(i / 4), PAD.top); g.lineTo(toCX(i / 4), PAD.top + IH); g.stroke();
    g.beginPath(); g.moveTo(PAD.left, toCY(i / 4)); g.lineTo(PAD.left + IW, toCY(i / 4)); g.stroke();
  }
  g.setLineDash([]); g.strokeStyle = C.gridBorder; g.strokeRect(PAD.left, PAD.top, IW, IH);

  g.font = "9px monospace"; g.fillStyle = C.axisLabel;
  g.textAlign = "right"; g.textBaseline = "middle";
  g.fillText("1", PAD.left - 5, toCY(1)); g.fillText("0", PAD.left - 5, toCY(0));
  g.textAlign = "center"; g.textBaseline = "top";
  const secs = props.state.seconds;
  g.fillText("0s", toCX(0), PAD.top + IH + 4);
  g.fillText(secs.toFixed(2) + "s", toCX(1) - 10, PAD.top + IH + 4);
  g.fillStyle = C.axisLabelDim; g.fillText((secs / 2).toFixed(2) + "s", toCX(0.5), PAD.top + IH + 4);

  if (props.state.hasSource && !props.state.sourceCurve?.length) {
    g.fillStyle = C.axisLabel; g.font = "11px Inter, sans-serif"; g.textBaseline = "middle";
    g.fillText("loudness of the audio / motion of the video in source", toCX(0.5), toCY(0.5));
    return;
  }

  const ys = curveSamples();
  g.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const x = toCX(i / SAMPLES), y = toCY(ys[i]);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = C.curve; g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
  g.lineTo(toCX(1), toCY(0)); g.lineTo(toCX(0), toCY(0)); g.closePath();
  g.fillStyle = C.curveFade; g.fill();

  if (!editable.value) return;
  if (!props.state.binary) {                             // the staircase is its own control polygon
    g.beginPath();
    points.forEach((p, i) => (i ? g.lineTo(toCX(p[0]), toCY(p[1])) : g.moveTo(toCX(p[0]), toCY(p[1]))));
    g.setLineDash([3, 4]); g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
  }
  points.forEach((p, i) => {
    const active = i === dragIdx, hover = i === hoverIdx;
    g.save();
    g.shadowBlur = 5; g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowOffsetY = 1;
    const r = active ? 7 : hover ? 6 : 4.5;
    g.beginPath();
    if (p[2] && !props.state.binary) g.rect(toCX(p[0]) - r * 0.85, toCY(p[1]) - r * 0.85, r * 1.7, r * 1.7);   // corners read as squares
    else g.arc(toCX(p[0]), toCY(p[1]), r, 0, Math.PI * 2);
    g.fillStyle = active ? C.ptActive : hover ? C.ptHover : C.pt; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = C.ptStroke; g.stroke();
    g.restore();
  });
}

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const s = Math.max(dpr, MIN_RENDER_SCALE);
  const sx = Math.max((rect.width / CW) * dpr, s), sy = Math.max((rect.height / CH) * dpr, s);
  const w = Math.round(CW * sx), h = Math.round(CH * sy);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx = c.getContext("2d");
  ctx?.setTransform(sx, 0, 0, sy, 0, 0);
  redraw();
  return true;
}

function toLogical(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (CW / rect.width), y: (e.clientY - rect.top) * (CH / rect.height) };
}

function hitTest(x: number, y: number): number {
  let best = -1, bestD = HIT_R * HIT_R;
  points.forEach((p, i) => {
    const d = (toCX(p[0]) - x) ** 2 + (toCY(p[1]) - y) ** 2;
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

function place(i: number, nx: number, ny: number) {
  const last = points.length - 1;
  points[i][0] = i === 0 ? 0 : i === last ? 1
    : Math.min(points[i + 1][0] - MIN_GAP, Math.max(points[i - 1][0] + MIN_GAP, nx));
  points[i][1] = props.state.binary ? (ny >= 0.5 ? 1 : 0) : clamp01(ny);   // on/off: snap to the rails
  readout.value = `${(points[i][0] * props.state.seconds).toFixed(2)}s  ${points[i][1].toFixed(2)}`;
}

function onDown(e: PointerEvent) {
  if (!editable.value) return;
  const { x, y } = toLogical(e);
  if (mode.value === "draw") {
    if (e.button !== 0) return;
    before = points.map((p) => [...p] as Pt);
    stroke = [];
    canvas.value!.setPointerCapture(e.pointerId);
    paint(x, y);
    return;
  }
  let i = hitTest(x, y);
  if (e.button === 2) {                                  // right-click deletes an inner point
    if (i > 0 && i < points.length - 1) { points.splice(i, 1); hoverIdx = -1; commit(); redraw(); }
    return;
  }
  if (e.button !== 0) return;
  if (i < 0) {                                           // empty spot: add a point and drag it
    const nx = rawNX(x);
    if (nx <= MIN_GAP || nx >= 1 - MIN_GAP) return;
    i = points.findIndex((p) => p[0] > nx);
    if (nx - points[i - 1][0] < MIN_GAP || points[i][0] - nx < MIN_GAP) return;
    points.splice(i, 0, [nx, props.state.binary ? (rawNY(y) >= 0.5 ? 1 : 0) : clamp01(rawNY(y))]);
  }
  dragIdx = i;
  virtX = toCX(points[i][0]); virtY = toCY(points[i][1]);   // start from the point: no jump
  lastX = x; lastY = y;
  canvas.value!.setPointerCapture(e.pointerId);
  cursor.value = "grabbing";
  place(i, points[i][0], points[i][1]);
  redraw();
}

function onMove(e: PointerEvent) {
  const { x, y } = toLogical(e);
  if (stroke) { paint(x, y); return; }
  if (dragIdx >= 0) {
    const gain = e.shiftKey ? FINE_GAIN : 1;             // incremental, so toggling Shift never jumps
    virtX += (x - lastX) * gain; virtY += (y - lastY) * gain;
    lastX = x; lastY = y;
    place(dragIdx, rawNX(virtX), rawNY(virtY));
    commit(); redraw();
    return;
  }
  if (!editable.value) return;
  if (mode.value === "draw") { cursor.value = "crosshair"; return; }
  const i = hitTest(x, y);
  if (i !== hoverIdx) { hoverIdx = i; redraw(); }
  cursor.value = i >= 0 ? "grab" : "crosshair";
}

// The stroke replaces the curve over the stretch of time it has covered so far; going
// back over it repaints. Samples closer than DRAW_GAP in time are dropped.
function paint(x: number, y: number) {
  const nx = clamp01(rawNX(x)), ny = props.state.binary ? (rawNY(y) >= 0.5 ? 1 : 0) : clamp01(rawNY(y));
  const prev = stroke!.length ? strokeX : -1;
  if (prev >= 0 && Math.abs(nx - prev) < DRAW_GAP) return;   // wait for the pen to travel, or one sample just slides along
  // going back over the stroke repaints the stretch just swept
  const a = Math.min(prev, nx), b = Math.max(prev, nx);
  stroke = stroke!.filter((p) => p[0] === prev || p[0] <= a - DRAW_GAP / 2 || p[0] >= b + DRAW_GAP / 2);
  stroke.push([nx, ny]);
  strokeX = nx;
  stroke.sort((a, b) => a[0] - b[0]);
  const lo = stroke[0][0] - DRAW_GAP, hi = stroke[stroke.length - 1][0] + DRAW_GAP;
  const pts = [...before.filter((p) => p[0] < lo || p[0] > hi), ...stroke.map((p) => [...p] as Pt)]
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return;
  pts[0][0] = 0; pts[pts.length - 1][0] = 1;
  points = pts;
  readout.value = `${(nx * props.state.seconds).toFixed(2)}s  ${ny.toFixed(2)}`;
  redraw();
}

function onUp(e: PointerEvent) {
  if (stroke) {
    stroke = null;
    // on/off holds each level until the next point, so a repeated level is a no-op
    if (props.state.binary) points = points.filter((p, i) => i === 0 || i === points.length - 1 || p[1] !== points[i - 1][1]);
    try { canvas.value?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    readout.value = "";
    commit(); redraw();
    return;
  }
  if (dragIdx < 0) return;
  dragIdx = -1;
  try { canvas.value?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  cursor.value = "grab";
  readout.value = "";
  commit(); redraw();
}

function onDblClick(e: MouseEvent) {                     // smooth point <-> sharp corner
  if (!editable.value || props.state.binary) return;     // a staircase has no corners to round
  const rect = canvas.value!.getBoundingClientRect();
  const i = hitTest((e.clientX - rect.left) * (CW / rect.width), (e.clientY - rect.top) * (CH / rect.height));
  if (i <= 0 || i >= points.length - 1) return;
  if (points[i][2]) points[i].length = 2; else points[i][2] = 1;
  commit(); redraw();
}

function onLeave() {
  if (dragIdx >= 0) return;
  hoverIdx = -1; readout.value = "";
  redraw();
}

function reset() { points = defaults(); commit(); redraw(); }

// Peaks, valleys, the ends of flats and corners stay; every other point between two of
// them goes. Repeated clicks leave only the turning points.
function reduce() {
  const slope = (a: Pt, b: Pt) => (Math.abs(b[1] - a[1]) < FLAT ? 0 : Math.sign(b[1] - a[1]));
  const last = points.length - 1;
  const keep = points.map((p, i) => i === 0 || i === last || !!p[2] || slope(points[i - 1], p) !== slope(p, points[i + 1]));
  let drop = true;
  points = points.filter((_, i) => {
    if (keep[i]) { drop = true; return true; }
    drop = !drop;
    return drop;
  });
  commit(); redraw();
}

function forceResize(): boolean { return syncCanvasSize(); }
function cleanup() { ro?.disconnect(); ro = null; }

watch(() => [props.state.shape, props.state.cycles, props.state.phase, props.state.seconds, props.state.hasSource,
  props.state.binary, props.state.sourceCurve],
  () => { cursor.value = editable.value ? "crosshair" : "default"; redraw(); });

onMounted(() => {
  ro = new ResizeObserver(() => syncCanvasSize());
  if (canvas.value) ro.observe(canvas.value);
  syncCanvasSize();
});
onBeforeUnmount(cleanup);

defineExpose({ serialise, deserialise, forceResize, cleanup });
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
.nkd-canvas {
  width: 100%;
  aspect-ratio: 400 / 160;
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
.nkd-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px; min-height: 26px; }
.nkd-spacer { flex: 1 1 auto; }
.nkd-hint {
  font-size: 9.5px;
  color: rgba(255,255,255,0.32);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
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
.nkd-btn:hover { border-color: #4ab4ff; color: rgba(255,255,255,0.95); }
.nkd-btn.on { border-color: #4ab4ff; color: #4ab4ff; }
</style>
