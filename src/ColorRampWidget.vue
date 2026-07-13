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
        <span class="nkd-hint">Click bar: add stop · click stop: pick color · Shift+click: delete · drag: move</span>
        <span class="nkd-spacer"></span>
        <button class="nkd-btn" @click.stop="reset">Reset</button>
      </div>
      <div class="nkd-row nkd-row--presets">
        <span class="nkd-label">Preset</span>
        <select
          class="nkd-select nkd-select--preset"
          :value="selectedPreset"
          @change="onPresetSelect(($event.target as HTMLSelectElement).value)"
        >
          <option value="">— Select —</option>
          <option v-for="p in userPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
        <button class="nkd-btn nkd-btn--preset" @click.stop="saveCurrentAsPreset">Save</button>
        <button
          class="nkd-btn nkd-btn--preset"
          :disabled="!selectedPreset"
          @click.stop="deleteSelectedPreset"
        >Delete</button>
      </div>
    </div>
    <input ref="colorInput" type="color" class="nkd-color-input" @input="onColorInput" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

interface Stop { pos: number; color: string }
interface Preset { name: string; stops: Stop[] }

const props = defineProps<{
  onChange: (json: string) => void;
}>();

const CW = 380, CH = 64;
const PAD = { top: 12, right: 16, bottom: 12, left: 16 };
const IW = CW - PAD.left - PAD.right;
const BAR_Y = PAD.top;
const BAR_H = CH - PAD.top - PAD.bottom;
const BAR_MID = BAR_Y + BAR_H / 2;
const HIT_R = 10;
const MIN_RENDER_SCALE = 2;

const C = {
  bg: "#111318",
  gridBorder: "rgba(255,255,255,0.16)",
  ptStroke: "rgba(0,0,0,0.65)",
  active: "rgba(74,180,255,0.65)",
  tooltipBg: "rgba(15,18,26,0.88)",
  tooltipBorder: "rgba(74,180,255,0.5)",
  tooltipText: "#e8eef8",
} as const;

const canvas = ref<HTMLCanvasElement | null>(null);
const colorInput = ref<HTMLInputElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let dpr = window.devicePixelRatio || 1;

const stops = ref<Stop[]>([{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }]);
let activeStop: Stop | null = null;
let hoverStop: Stop | null = null;
let dragging = false;
let dragOffsetX = 0;
let downX = 0, downY = 0, moved = false;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeHex(c: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : "#000000";
}

function toCanvasX(pos: number): number {
  return PAD.left + pos * IW;
}

function fromCanvasX(x: number): number {
  return clamp01((x - PAD.left) / IW);
}

function eventToLogical(e: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (CW / rect.width),
    y: (e.clientY - rect.top) * (CH / rect.height),
  };
}

function stopAt(x: number): Stop | null {
  let best: Stop | null = null;
  let bestDist = HIT_R;
  for (const s of stops.value) {
    const d = Math.abs(toCanvasX(s.pos) - x);
    if (d <= bestDist) { best = s; bestDist = d; }
  }
  return best;
}

// --- rendering --------------------------------------------------------------

function syncCanvasSize(): boolean {
  const c = canvas.value;
  if (!c) return false;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const sx = Math.max((rect.width / CW) * dpr, MIN_RENDER_SCALE);
  const sy = Math.max((rect.height / CH) * dpr, MIN_RENDER_SCALE);
  const newW = Math.round(CW * sx), newH = Math.round(CH * sy);
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
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CW, CH);

  // Gradient bar — rendered via the browser's own linear gradient, so it's
  // pixel-identical to how a human reads the ramp.
  const grad = ctx.createLinearGradient(PAD.left, 0, PAD.left + IW, 0);
  for (const s of stops.value) grad.addColorStop(s.pos, s.color);
  ctx.fillStyle = grad;
  roundRectPath(PAD.left, BAR_Y, IW, BAR_H, 5);
  ctx.fill();
  ctx.strokeStyle = C.gridBorder;
  ctx.lineWidth = 0.75;
  roundRectPath(PAD.left, BAR_Y, IW, BAR_H, 5);
  ctx.stroke();

  for (const s of stops.value) {
    const x = toCanvasX(s.pos);
    const isActive = s === activeStop;
    const isHover = s === hoverStop;
    const r = isActive ? 7 : isHover ? 6 : 4.5;
    if (isActive) {
      ctx.beginPath();
      ctx.arc(x, BAR_MID, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = C.active;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(x, BAR_MID, r, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.ptStroke;
    ctx.stroke();
  }

  const tip = dragging ? activeStop : hoverStop;
  if (tip) drawTooltip(tip);
}

function drawTooltip(stop: Stop) {
  if (!ctx) return;
  const x = toCanvasX(stop.pos);
  const label = `${Math.round(stop.pos * 100)}%  ${stop.color}`;
  ctx.font = "10px monospace";
  const textW = ctx.measureText(label).width;
  const padX = 6, h = 16;
  const w = textW + padX * 2;
  let tx = x - w / 2;
  tx = Math.max(2, Math.min(CW - w - 2, tx));
  const ty = BAR_MID - 5 - h - 6; // above the bar
  ctx.fillStyle = C.tooltipBg;
  ctx.strokeStyle = dragging ? "rgba(255,107,107,0.6)" : C.tooltipBorder;
  ctx.lineWidth = 1;
  roundRectPath(tx, ty, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tooltipText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, tx + w / 2, ty + h / 2 + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- interaction -------------------------------------------------------------

function sampleColorAt(pos: number): string {
  const sorted = [...stops.value].sort((a, b) => a.pos - b.pos);
  if (pos <= sorted[0].pos) return sorted[0].color;
  if (pos >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const t = (pos - a.pos) / Math.max(1e-6, b.pos - a.pos);
      return lerpHex(a.color, b.color, t);
    }
  }
  return sorted[0].color;
}

function lerpHex(c1: string, c2: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

function onDown(e: MouseEvent) {
  const { x, y } = eventToLogical(e);
  downX = x; downY = y; moved = false;
  const hit = stopAt(x);
  if (hit && e.shiftKey) {
    if (stops.value.length > 2) {
      stops.value = stops.value.filter((s) => s !== hit);
      activeStop = null;
      emitChange();
    }
    redraw();
    return;
  }
  if (hit) {
    activeStop = hit;
    dragOffsetX = hit.pos - fromCanvasX(x);
    dragging = true;
  } else if (y >= BAR_Y - HIT_R && y <= BAR_Y + BAR_H + HIT_R) {
    const pos = fromCanvasX(x);
    const newStop: Stop = { pos, color: sampleColorAt(pos) };
    stops.value.push(newStop);
    activeStop = newStop;
    dragOffsetX = 0;
    dragging = true;
    emitChange();
  }
  redraw();
}

function onMove(e: MouseEvent) {
  const { x, y } = eventToLogical(e);
  if (Math.abs(x - downX) > 3 || Math.abs(y - downY) > 3) moved = true;
  if (dragging && activeStop) {
    activeStop.pos = clamp01(fromCanvasX(x) + dragOffsetX);
    stops.value.sort((a, b) => a.pos - b.pos);
    emitChange();
    redraw();
    return;
  }
  const prevHover = hoverStop;
  hoverStop = stopAt(x);
  if (hoverStop !== prevHover) redraw();
  if (canvas.value) canvas.value.style.cursor = hoverStop ? "grab" : "crosshair";
}

function onUp() {
  if (dragging && activeStop && !moved) {
    openPickerFor(activeStop);
  }
  dragging = false;
  redraw();
}

function onLeave() {
  if (dragging) onUp();
  hoverStop = null;
  redraw();
}

function openPickerFor(stop: Stop) {
  activeStop = stop;
  const input = colorInput.value;
  if (!input) return;
  input.value = stop.color;
  input.click();
}

function onColorInput(e: Event) {
  if (!activeStop) return;
  activeStop.color = normalizeHex((e.target as HTMLInputElement).value);
  emitChange();
  redraw();
}

function reset() {
  stops.value = [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
  activeStop = null;
  emitChange();
  redraw();
}

// --- serialisation -----------------------------------------------------------

let debounceTimer: number | undefined;
function emitChange() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    props.onChange(JSON.stringify({ stops: [...stops.value].sort((a, b) => a.pos - b.pos) }));
  }, 60);
}

function serialise(): string {
  return JSON.stringify({ stops: [...stops.value].sort((a, b) => a.pos - b.pos) });
}

function deserialise(json: string) {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data.stops) && data.stops.length >= 2) {
      stops.value = data.stops.map((s: any) => ({
        pos: clamp01(Number(s.pos)),
        color: normalizeHex(String(s.color)),
      })).sort((a: Stop, b: Stop) => a.pos - b.pos);
      redraw();
      return;
    }
  } catch {
    // fall through to default
  }
}

function forceResize(): boolean {
  return syncCanvasSize();
}

// --- presets -------------------------------------------------------------

const userPresets = ref<Preset[]>([]);
const selectedPreset = ref<string>("");

async function loadPresets(): Promise<void> {
  try {
    const res = await fetch("/nkd_color_ramp/presets");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.user)) userPresets.value = data.user;
  } catch {
    // Endpoint not available — leave the dropdown empty.
  }
}

function onPresetSelect(name: string) {
  selectedPreset.value = name;
  if (!name) return;
  const p = userPresets.value.find((x) => x.name === name);
  if (!p) return;
  stops.value = p.stops.map((s) => ({ pos: clamp01(s.pos), color: normalizeHex(s.color) }));
  activeStop = null;
  emitChange();
  redraw();
}

async function saveCurrentAsPreset(): Promise<void> {
  const raw = window.prompt("Preset name (1–64 chars: letters, numbers, spaces, -_().):");
  if (raw === null) return;
  const name = raw.trim();
  if (!name) return;
  if (!/^[\w \-().]{1,64}$/.test(name)) {
    window.alert("Invalid name. Use letters, numbers, spaces, or - _ ( ) .");
    return;
  }
  const exists = userPresets.value.some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (exists && !window.confirm(`Overwrite existing preset "${name}"?`)) return;

  const payload = { name, stops: [...stops.value].sort((a, b) => a.pos - b.pos) };
  try {
    const res = await fetch("/nkd_color_ramp/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      window.alert(`Save failed: ${err.error ?? res.statusText}`);
      return;
    }
    await loadPresets();
    selectedPreset.value = name;
  } catch (e) {
    window.alert(`Save failed: ${e}`);
  }
}

async function deleteSelectedPreset(): Promise<void> {
  const name = selectedPreset.value;
  if (!name) return;
  if (!window.confirm(`Delete preset "${name}"?`)) return;
  try {
    const res = await fetch(`/nkd_color_ramp/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      window.alert(`Delete failed: ${err.error ?? res.statusText}`);
      return;
    }
    await loadPresets();
    selectedPreset.value = "";
  } catch (e) {
    window.alert(`Delete failed: ${e}`);
  }
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
  loadPresets();
});
onBeforeUnmount(cleanup);

defineExpose({ serialise, deserialise, forceResize, cleanup });
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
  display: block;
  cursor: crosshair;
}
.nkd-color-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.nkd-bar {
  background: var(--comfy-menu-bg, #1a1c22);
  border-top: 1px solid var(--border-color, #2a2d36);
}
.nkd-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nkd-row--controls { padding: 5px 8px 3px; }
.nkd-row--presets  { padding: 3px 8px 5px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.06)); }

.nkd-spacer { flex: 1 1 auto; }
.nkd-hint {
  font-size: 9.5px;
  color: rgba(255,255,255,0.32);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nkd-label {
  font-size: 10px;
  color: var(--descrip-text, rgba(255,255,255,0.45));
  white-space: nowrap;
}
.nkd-select--preset { flex: 1 1 auto; min-width: 0; max-width: 240px; }

.nkd-btn, .nkd-select {
  background: var(--comfy-input-bg, #252830);
  border: 1px solid var(--border-color, #3a3d46);
  color: var(--input-text, rgba(255,255,255,0.65));
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
  cursor: pointer;
}
.nkd-btn:hover, .nkd-select:hover, .nkd-select:focus {
  border-color: #4ab4ff;
  color: rgba(255,255,255,0.95);
}
.nkd-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
