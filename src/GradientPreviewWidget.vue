<template>
  <div class="nkd-root" @mousedown.stop @mouseup.stop @mousemove.stop @contextmenu.prevent>
    <canvas
      ref="canvas"
      class="nkd-canvas"
      @mousedown.stop.prevent="onDown"
      @mousemove.stop="onMove"
      @mouseup.stop="onUp"
      @mouseleave.stop="onLeave"
    ></canvas>
    <div class="nkd-bar">
      <div class="nkd-row nkd-row--controls">
        <span class="nkd-hint">{{ hintText }}</span>
        <span class="nkd-spacer"></span>
        <button class="nkd-btn" @click.stop="resetHandles">Reset</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

interface Pt { pos: number; color: string }
type Vec = [number, number];

const props = defineProps<{
  onChange: (json: string) => void;
  getRamp: () => string;
  getShape: () => string;
  getSize: () => [number, number];
}>();

const BOX_W = 320, BOX_H = 210, PAD = 14;
const HIT_R = 11;
const MIN_RENDER_SCALE = 2;

const SHAPE_DEFAULTS: Record<string, { p0: Vec; p1: Vec }> = {
  Linear:  { p0: [0, 0.5],   p1: [1, 0.5] },
  Radial:  { p0: [0.5, 0.5], p1: [1, 0.5] },
  Angular: { p0: [0.5, 0.5], p1: [1, 0.5] },
  Diamond: { p0: [0.5, 0.5], p1: [1, 1] },  // diagonal — a horizontal drag degenerates to a sliver
};
const HANDLE_LABELS: Record<string, [string, string]> = {
  Linear:  ["Start", "End"],
  Radial:  ["Center", "Edge"],
  Angular: ["Center", "Angle"],
  Diamond: ["Center", "Edge"],
};

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let dpr = window.devicePixelRatio || 1;

const p0 = ref<Vec>([0, 0.5]);
const p1 = ref<Vec>([1, 0.5]);
const hintText = ref("Drag the handles to set direction");
let lastShape: string | null = null;
let dragging: "p0" | "p1" | null = null;
let hover: "p0" | "p1" | null = null;

// fit rect (letterboxed image area) recomputed each redraw
let fitX = PAD, fitY = PAD, fitW = BOX_W - PAD * 2, fitH = BOX_H - PAD * 2;

function toPx(pt: Vec): Vec {
  return [fitX + pt[0] * fitW, fitY + pt[1] * fitH];
}
function fromPx(x: number, y: number): Vec {
  return [
    Math.max(0, Math.min(1, (x - fitX) / fitW)),
    Math.max(0, Math.min(1, (y - fitY) / fitH)),
  ];
}
function eventToLogical(e: MouseEvent): Vec {
  const rect = canvas.value!.getBoundingClientRect();
  return [(e.clientX - rect.left) * (BOX_W / rect.width), (e.clientY - rect.top) * (BOX_H / rect.height)];
}

function parseRamp(): Pt[] {
  try {
    const data = JSON.parse(props.getRamp());
    if (Array.isArray(data.stops) && data.stops.length >= 2) {
      return [...data.stops].sort((a: Pt, b: Pt) => a.pos - b.pos);
    }
  } catch { /* fall through */ }
  return [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
}

// --- rendering ---------------------------------------------------------

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

function computeFitRect() {
  const [w, h] = props.getSize();
  const aspect = w > 0 && h > 0 ? w / h : 1;
  const maxW = BOX_W - PAD * 2, maxH = BOX_H - PAD * 2;
  let fw = maxW, fh = maxW / aspect;
  if (fh > maxH) { fh = maxH; fw = maxH * aspect; }
  fitX = PAD + (maxW - fw) / 2;
  fitY = PAD + (maxH - fh) / 2;
  fitW = fw; fitH = fh;
}

function buildFill(shape: string, stops: Pt[], a: Vec, b: Vec): CanvasGradient | null {
  if (!ctx) return null;
  if (shape === "Radial") {
    const r = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1);
    const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r);
    stops.forEach((s) => g.addColorStop(s.pos, s.color));
    return g;
  }
  if (shape === "Angular" && "createConicGradient" in ctx) {
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const g = (ctx as any).createConicGradient(angle, a[0], a[1]);
    stops.forEach((s) => g.addColorStop(s.pos, s.color));
    return g;
  }
  if (shape === "Diamond") return null; // rendered via pixel loop below
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  stops.forEach((s) => g.addColorStop(s.pos, s.color));
  return g;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function sampleRamp(stops: Pt[], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  if (t <= stops[0].pos) return hexToRgb(stops[0].color);
  const last = stops[stops.length - 1];
  if (t >= last.pos) return hexToRgb(last.color);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.pos && t <= b.pos) {
      const f = (t - a.pos) / Math.max(1e-6, b.pos - a.pos);
      const [r1, g1, b1] = hexToRgb(a.color), [r2, g2, b2] = hexToRgb(b.color);
      return [r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f];
    }
  }
  return hexToRgb(stops[0].color);
}

// Diamond has no native canvas gradient — render at a small fixed
// resolution offscreen, then scale up. The real node output is computed
// at full resolution in Python; this is a preview only.
const DIAMOND_RES = 96;
let diamondCanvas: HTMLCanvasElement | null = null;

function drawDiamond(stops: Pt[], a: Vec, b: Vec) {
  if (!ctx) return;
  const aspect = fitW / fitH;
  const dw = DIAMOND_RES, dh = Math.max(1, Math.round(DIAMOND_RES / aspect));
  if (!diamondCanvas) diamondCanvas = document.createElement("canvas");
  diamondCanvas.width = dw; diamondCanvas.height = dh;
  const dctx = diamondCanvas.getContext("2d")!;
  const img = dctx.createImageData(dw, dh);
  const p0n: Vec = [(a[0] - fitX) / fitW, (a[1] - fitY) / fitH];
  const p1n: Vec = [(b[0] - fitX) / fitW, (b[1] - fitY) / fitH];
  const ex = Math.max(Math.abs(p1n[0] - p0n[0]), 1e-4);
  const ey = Math.max(Math.abs(p1n[1] - p0n[1]), 1e-4);
  for (let py = 0; py < dh; py++) {
    const ny = (py + 0.5) / dh;
    for (let px = 0; px < dw; px++) {
      const nx = (px + 0.5) / dw;
      const t = Math.min(1, 0.5 * (Math.abs(nx - p0n[0]) / ex + Math.abs(ny - p0n[1]) / ey));
      const [r, g, bch] = sampleRamp(stops, t);
      const i = (py * dw + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bch; img.data[i + 3] = 255;
    }
  }
  dctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(diamondCanvas, fitX, fitY, fitW, fitH);
}

function redraw() {
  if (!ctx) return;
  computeFitRect();
  ctx.clearRect(0, 0, BOX_W, BOX_H);
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, BOX_W, BOX_H);

  const shape = props.getShape() || "Linear";
  const stops = parseRamp();
  const a = toPx(p0.value), b = toPx(p1.value);

  const fill = buildFill(shape, stops, a, b);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(fitX, fitY, fitW, fitH);
  } else {
    drawDiamond(stops, a, b);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 0.75;
  ctx.strokeRect(fitX + 0.5, fitY + 0.5, fitW - 1, fitH - 1);

  // connecting line
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  const labels = HANDLE_LABELS[shape] ?? HANDLE_LABELS.Linear;
  drawHandle(a, "p0", labels[0]);
  drawHandle(b, "p1", labels[1]);

  const tipWhich = dragging ?? hover;
  if (tipWhich) {
    const pos = tipWhich === "p0" ? p0.value : p1.value;
    const label = tipWhich === "p0" ? labels[0] : labels[1];
    drawTooltip(tipWhich === "p0" ? a : b, `${label}  ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}`);
  }
}

function drawTooltip(at: Vec, text: string) {
  if (!ctx) return;
  ctx.font = "10px monospace";
  const textW = ctx.measureText(text).width;
  const padX = 6, h = 16;
  const w = textW + padX * 2;
  let tx = at[0] - w / 2;
  tx = Math.max(2, Math.min(BOX_W - w - 2, tx));
  let ty = at[1] - 12 - h;
  if (ty < 2) ty = at[1] + 12; // flip below if too close to the top
  ctx.fillStyle = "rgba(15,18,26,0.88)";
  ctx.strokeStyle = dragging ? "rgba(255,107,107,0.6)" : "rgba(74,180,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx + 4, ty);
  ctx.arcTo(tx + w, ty, tx + w, ty + h, 4);
  ctx.arcTo(tx + w, ty + h, tx, ty + h, 4);
  ctx.arcTo(tx, ty + h, tx, ty, 4);
  ctx.arcTo(tx, ty, tx + w, ty, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8eef8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, tx + w / 2, ty + h / 2 + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawHandle(pos: Vec, which: "p0" | "p1", label: string) {
  if (!ctx) return;
  const isDrag = dragging === which;
  const isHover = hover === which;
  const r = isDrag ? 7 : isHover ? 6 : 4.5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2);
  ctx.fillStyle = which === "p0" ? "#4ab4ff" : "#ffd166";
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.stroke();

  ctx.font = "9px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = pos[0] > BOX_W - 40 ? "right" : "left";
  ctx.fillText(label, pos[0] + (ctx.textAlign === "right" ? -r - 4 : r + 4), pos[1] + 3);
}

// --- interaction -------------------------------------------------------

function hitTest(x: number, y: number): "p0" | "p1" | null {
  const a = toPx(p0.value), b = toPx(p1.value);
  const da = Math.hypot(a[0] - x, a[1] - y);
  const db = Math.hypot(b[0] - x, b[1] - y);
  if (da <= HIT_R && da <= db) return "p0";
  if (db <= HIT_R) return "p1";
  return null;
}

function onDown(e: MouseEvent) {
  const [x, y] = eventToLogical(e);
  dragging = hitTest(x, y);
  redraw();
}
function onMove(e: MouseEvent) {
  const [x, y] = eventToLogical(e);
  if (dragging) {
    const target = dragging === "p0" ? p0 : p1;
    target.value = fromPx(x, y);
    emitChange();
    redraw();
    return;
  }
  const prevHover = hover;
  hover = hitTest(x, y);
  if (hover !== prevHover) redraw();
  if (canvas.value) canvas.value.style.cursor = hover ? "grab" : "default";
}
function onUp() {
  dragging = null;
  redraw();
}
function onLeave() {
  dragging = null;
  hover = null;
  redraw();
}

function resetHandles() {
  const shape = props.getShape() || "Linear";
  const def = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.Linear;
  p0.value = [...def.p0];
  p1.value = [...def.p1];
  emitChange();
  redraw();
}

// --- serialisation / external sync --------------------------------------

let debounceTimer: number | undefined;
function emitChange() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    props.onChange(JSON.stringify({ p0: p0.value, p1: p1.value }));
  }, 40);
}

function serialise(): string {
  return JSON.stringify({ p0: p0.value, p1: p1.value });
}

function deserialise(json: string) {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data.p0) && Array.isArray(data.p1)) {
      p0.value = [Number(data.p0[0]), Number(data.p0[1])];
      p1.value = [Number(data.p1[0]), Number(data.p1[1])];
      lastShape = props.getShape();
      redraw();
      return;
    }
  } catch { /* fall through */ }
  lastShape = props.getShape();
}

// Called on a poll from the host: refresh the ramp preview (edited on the
// OTHER widget) and reset handles when the shape combo changes.
function refreshExternal() {
  const shape = props.getShape();
  if (lastShape !== null && shape !== lastShape) {
    const def = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.Linear;
    p0.value = [...def.p0];
    p1.value = [...def.p1];
    emitChange();
  }
  lastShape = shape;
  hintText.value = `Drag ${(HANDLE_LABELS[shape] ?? HANDLE_LABELS.Linear).join(" / ")}`;
  redraw();
}

function forceResize(): boolean {
  return syncCanvasSize();
}

function cleanup() {
  window.clearTimeout(debounceTimer);
  ro?.disconnect();
}

onMounted(() => {
  ctx = canvas.value?.getContext("2d") ?? null;
  ro = new ResizeObserver(() => syncCanvasSize());
  if (canvas.value) ro.observe(canvas.value);
  syncCanvasSize();
});
onBeforeUnmount(cleanup);

defineExpose({ serialise, deserialise, refreshExternal, forceResize, cleanup });
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
  aspect-ratio: 320 / 210;
  height: auto;
  display: block;
  cursor: default;
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
.nkd-spacer { flex: 1 1 auto; }
.nkd-hint {
  font-size: 9.5px;
  color: rgba(255,255,255,0.32);
  opacity: 0.7;
  white-space: nowrap;
}
.nkd-btn {
  background: var(--comfy-input-bg, #252830);
  border: 1px solid var(--border-color, #3a3d46);
  color: var(--input-text, rgba(255,255,255,0.65));
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.nkd-btn:hover {
  border-color: #4ab4ff;
  color: rgba(255,255,255,0.95);
}
</style>
