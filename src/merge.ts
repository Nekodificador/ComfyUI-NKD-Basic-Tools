/**
 * 😺NKD Merge — drag the foreground over the background, in the node.
 *
 * The hidden `transform` STRING widget (`multiline=false`, see the nkd-node skill's textarea
 * trap) is the source of truth: `{x, y, scale, angle}`, x/y the foreground's CENTRE as a
 * fraction of the background. This widget is a view onto it, same split as Crop's `region`.
 *
 * Pixels only exist after a run: execute() pushes a few sampled frames of both inputs
 * (`nkd-merge-source`). Until then the node says so instead of drawing a guess.
 *
 * Geometry mirrors `place_matrix` in nkd_merge.py: the foreground is drawn `s` times its
 * size, `s = base(fit) * scale`, centred on (x*W, y*H) and turned `angle` degrees clockwise.
 * Keep the two in lock-step, or the node shows a placement the render doesn't produce.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { findW, hideWidget, mountDomWidget } from "./domHost";
import { checker } from "./paint";
import { FINE_GAIN } from "./fine_drag";

const NODE_NAME = "NKDMerge";
const EXT_NAME = "NKD.BasicTools.Merge";

console.log("[NKD Merge] rev 1.0.0");

type T = { x: number; y: number; scale: number; angle: number };
type Source = { bg: HTMLImageElement[]; fg: HTMLImageElement[];
                bgW: number; bgH: number; fgW: number; fgH: number };

const DEFAULT: T = { x: 0.5, y: 0.5, scale: 1, angle: 0 };
const sources = new Map<string, Source>();
// Keyed by the NODE, not its id: onNodeCreated runs before graph.add() assigns the final id,
// so an id captured at setup can be stale. The id is read when a payload arrives.
const live = new Map<any, () => void>();
const notify = (id: string) => {
  for (const [node, fn] of live) if (String(node.id) === id) fn();
};

/** Called by main.ts when an `nkd-merge-source` payload arrives. */
export function mergeSource(d: any): void {
  const load = (b64: string) => {
    const im = new Image();
    im.onload = () => notify(String(d.node));
    im.src = `data:image/webp;base64,${b64}`;
    return im;
  };
  sources.set(String(d.node), {
    bg: d.bg.map(load), fg: d.fg.map(load),
    bgW: d.bg_size[0], bgH: d.bg_size[1], fgW: d.fg_size[0], fgH: d.fg_size[1],
  });
  notify(String(d.node));
}

const BAR_H = 30;
const TOGGLE_H = 24;
const TRANSPORT_H = 26;
const CANVAS_W = 240;          // startup guess, before the element has been laid out
const MARGIN = 0.15;           // resting room around the background to drag the foreground into
const MARGIN_MAX = 1.0;        // the view grows to keep the whole foreground grabbable, up to this
const HANDLE_R = 4;
const HANDLE_HIT = 9;
const ROTATE_OFFSET = 20;      // canvas px above the foreground's top edge
const SNAP_PX = 8;             // canvas px within which an edge or centre sticks

const C = {
  bg: "#111318", frame: "rgba(255,255,255,0.35)", dim: "rgba(0,0,0,0.55)",
  box: "#4ab4ff", hover: "#ffd166", guide: "#ff6b6b",
};

function parseT(json: string): T {
  try {
    const d = JSON.parse(json || "{}");
    const out = { ...DEFAULT };
    for (const k of Object.keys(out) as (keyof T)[]) {
      if (typeof d[k] === "number" && isFinite(d[k])) out[k] = d[k];
    }
    return out;
  } catch { return { ...DEFAULT }; }
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const serialiseT = (t: T) => JSON.stringify({
  x: round(t.x, 5), y: round(t.y, 5), scale: round(t.scale, 5), angle: round(t.angle, 3),
});

function baseScale(fit: string, s: Source): number {
  if (fit === "fill") return Math.max(s.bgW / s.fgW, s.bgH / s.fgH);
  if (fit === "pixels") return 1;
  return Math.min(s.bgW / s.fgW, s.bgH / s.fgH);
}

/** The preview the backend kept from this node's last run, when the page has none (after
 *  a reload the run is cached and never pushes again). */
async function fetchSource(nodeId: string): Promise<void> {
  if (sources.has(nodeId)) return;
  try {
    const res = await api.fetchApi(`/nkd/merge/source?node_id=${encodeURIComponent(nodeId)}`,
                                   { cache: "no-store" });
    if (res.ok) mergeSource(await res.json());
  } catch { /* no preview yet: the node says "run once" */ }
}

export function registerMerge(): void {
  comfyApp.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdMergeWrapped) return;
      nodeType.prototype.__nkdMergeWrapped = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setupMergeWidget(this);
        return r;
      };
    },
  });
}

function setupMergeWidget(node: any): void {
  const tW = findW(node, "transform");
  if (!tW) return;
  hideWidget(tW);
  const fitW = findW(node, "fit");

  let t = parseT(tW.value);
  let frame = 0;
  let playing = 0;
  const src = () => sources.get(String(node.id)) ?? null;

  // ── DOM ────────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;background:#111318;" +
    "border:1px solid #2a2d36;border-radius:6px;overflow:hidden;width:100%;";
  const bar = document.createElement("div");
  bar.style.cssText = `display:flex;align-items:center;gap:6px;height:${BAR_H}px;` +
    "padding:0 8px;background:#1a1c22;border-bottom:1px solid #2a2d36;" +
    "font:11px sans-serif;color:#c8d0e0;";
  const fieldCss = "width:46px;background:#252830;color:#c8d0e0;border:1px solid #3a3d46;" +
    "border-radius:4px;font:11px sans-serif;padding:2px 3px;flex:0 0 auto;";
  const btnCss = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;" +
    "border-radius:4px;font:11px sans-serif;padding:2px 7px;cursor:pointer;flex:0 0 auto;";
  // Preview on/off: view-only state, so it lives in properties (like Crop's aspect), not in
  // an execute() input. Folded, the node is just the bar: the numbers still work.
  node.properties.nkdMergePreview = node.properties.nkdMergePreview ?? true;
  const showing = () => node.properties.nkdMergePreview !== false;
  const toggleBtn = document.createElement("button");
  toggleBtn.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;" +
    `width:100%;height:${TOGGLE_H}px;background:#1a1c22;color:#c8d0e0;border:0;` +
    "border-bottom:1px solid #2a2d36;font:11px sans-serif;cursor:pointer;";
  const toggleIcon = document.createElement("i");
  toggleIcon.style.cssText = "font-size:10px;color:inherit;";
  const toggleText = document.createElement("span");
  toggleBtn.append(toggleIcon, toggleText);
  const field = (label: string, title: string) => {
    const l = document.createElement("span");
    l.textContent = label; l.title = title;
    l.style.cssText = "opacity:0.6;flex:0 0 auto;";
    const i = document.createElement("input");
    i.type = "number"; i.title = title; i.style.cssText = fieldCss;
    bar.append(l, i);
    return i;
  };
  const xIn = field("X", "Centre of the foreground, background pixels from the left");
  const yIn = field("Y", "Centre of the foreground, background pixels from the top");
  const sIn = field("%", "Scale, on top of what `fit` sets");
  const aIn = field("°", "Rotation, clockwise");
  const centerBtn = document.createElement("button");
  centerBtn.textContent = "Center"; centerBtn.style.cssText = btnCss + "margin-left:auto;";
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset"; resetBtn.style.cssText = btnCss;
  bar.append(centerBtn, resetBtn);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;cursor:default;touch-action:none;";

  const transport = document.createElement("div");
  transport.style.cssText = "display:none;align-items:center;gap:6px;height:26px;" +
    "padding:0 8px;background:#1a1c22;border-top:1px solid #2a2d36;";
  const playBtn = document.createElement("button");
  playBtn.textContent = "▶"; playBtn.style.cssText = btnCss + "width:26px;padding:2px 0;";
  const scrub = document.createElement("input");
  scrub.type = "range"; scrub.min = "0"; scrub.value = "0"; scrub.style.cssText = "flex:1;";
  transport.append(playBtn, scrub);
  root.append(toggleBtn, bar, canvas, transport);

  const barMinWidth = () => {
    const kids = Array.from(bar.children) as HTMLElement[];
    return kids.reduce((sum, k) => sum + k.offsetWidth, 0) + 16 + 6 * (kids.length - 1);
  };

  // ── Geometry ───────────────────────────────────────────────────────────────
  const aspect = () => { const s = src(); return s ? s.bgH / s.bgW : 9 / 16; };
  // Frozen while dragging: a view that rescaled under the pointer would fight the drag.
  let margin = MARGIN;
  /** Enough room around the background for the whole foreground plus its rotate knob, so
   *  a foreground dragged far out never ends up with its handles off the canvas. */
  function fitMargin() {
    const s = src();
    if (!s) { margin = MARGIN; return; }
    const pad = 0.06;
    const cs = corners();
    const xs = cs.map((c) => c[0] / s.bgW), ys = cs.map((c) => c[1] / s.bgH);
    const need = Math.max(-Math.min(...xs), Math.max(...xs) - 1,
                          -Math.min(...ys), Math.max(...ys) - 1) + pad;
    margin = Math.min(MARGIN_MAX, Math.max(MARGIN, need));
  }
  function view() {
    const s = src();
    const cw = canvas.clientWidth || CANVAS_W;
    const bgW = s?.bgW ?? 1;
    const k = cw / (bgW * (1 + 2 * margin));               // canvas px per background px
    return { k, ox: margin * bgW * k, oy: margin * (s?.bgH ?? 1) * k, cw,
             ch: cw * aspect() };
  }
  const toCanvas = (px: number, py: number): [number, number] => {
    const { k, ox, oy } = view();
    return [ox + px * k, oy + py * k];
  };
  const toBg = (cx: number, cy: number): [number, number] => {
    const { k, ox, oy } = view();
    return [(cx - ox) / k, (cy - oy) / k];
  };
  /** The foreground's centre, size and rotation in background pixels. */
  function placed() {
    const s = src()!;
    const sc = baseScale(fitW?.value ?? "fit", s) * t.scale;
    return { cx: t.x * s.bgW, cy: t.y * s.bgH, w: s.fgW * sc, h: s.fgH * sc,
             a: (t.angle * Math.PI) / 180 };
  }
  /** Background point -> the foreground's own frame (unrotated, centred). */
  function toLocal(px: number, py: number): [number, number] {
    const p = placed();
    const dx = px - p.cx, dy = py - p.cy;
    const c = Math.cos(p.a), sn = Math.sin(p.a);
    return [dx * c + dy * sn, -dx * sn + dy * c];
  }
  function fromLocal(lx: number, ly: number): [number, number] {
    const p = placed();
    const c = Math.cos(p.a), sn = Math.sin(p.a);
    return [p.cx + lx * c - ly * sn, p.cy + lx * sn + ly * c];
  }
  const corners = () => {
    const p = placed();
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
      fromLocal((sx * p.w) / 2, (sy * p.h) / 2));
  };

  // ── Drawing ────────────────────────────────────────────────────────────────
  let hover = "";
  let guides: { x?: number; y?: number } = {};

  function draw() {
    const { cw, ch, k } = view();
    const d = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.round(cw * d), h = Math.round(ch * d);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(w / cw, 0, 0, h / ch, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cw, ch);
    const s = src();
    if (!s) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Run once to place the foreground", cw / 2, ch / 2);
      return;
    }
    const [x0, y0] = toCanvas(0, 0);
    const [x1, y1] = toCanvas(s.bgW, s.bgH);
    ctx.fillStyle = checker(ctx);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const bgIm = s.bg[frame % s.bg.length];
    if (bgIm?.complete) ctx.drawImage(bgIm, x0, y0, x1 - x0, y1 - y0);

    const p = placed();
    const fgIm = s.fg[frame % s.fg.length];
    const [ccx, ccy] = toCanvas(p.cx, p.cy);
    ctx.save();
    ctx.globalAlpha = findW(node, "opacity")?.value ?? 1;
    ctx.translate(ccx, ccy);
    ctx.rotate(p.a);
    if (fgIm?.complete) ctx.drawImage(fgIm, (-p.w * k) / 2, (-p.h * k) / 2, p.w * k, p.h * k);
    ctx.restore();

    // What falls outside the background is cropped by the render: dim it.
    ctx.fillStyle = C.dim;
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.fill("evenodd");
    ctx.strokeStyle = C.frame; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);

    ctx.strokeStyle = C.guide; ctx.setLineDash([4, 3]);
    if (guides.x !== undefined) {
      const [gx] = toCanvas(guides.x, 0);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke();
    }
    if (guides.y !== undefined) {
      const [, gy] = toCanvas(0, guides.y);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    const cs = corners().map(([x, y]) => toCanvas(x, y));
    ctx.strokeStyle = hover === "move" ? C.hover : C.box;
    ctx.beginPath();
    cs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.stroke();
    cs.forEach(([x, y], i) => {
      ctx.fillStyle = hover === `c${i}` ? C.hover : C.box;
      ctx.fillRect(x - HANDLE_R, y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
    });
    const [rx, ry] = rotateHandle();
    const [tx, ty] = toCanvas(...fromLocal(0, -p.h / 2));
    ctx.strokeStyle = C.box;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.fillStyle = hover === "rotate" ? C.hover : C.box;
    ctx.beginPath(); ctx.arc(rx, ry, HANDLE_R + 1, 0, Math.PI * 2); ctx.fill();
  }

  /** The rotate knob, canvas px: a fixed distance above the top edge, along the rotation. */
  function rotateHandle(): [number, number] {
    const p = placed();
    const [tx, ty] = toCanvas(...fromLocal(0, -p.h / 2));
    return [tx + Math.sin(p.a) * ROTATE_OFFSET, ty - Math.cos(p.a) * ROTATE_OFFSET];
  }

  let drawQueued = false;
  const scheduleDraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  };

  // ── State <-> widget ───────────────────────────────────────────────────────
  function syncFields() {
    const s = src();
    xIn.value = s ? String(round(t.x * s.bgW, 1)) : String(round(t.x * 100, 1));
    yIn.value = s ? String(round(t.y * s.bgH, 1)) : String(round(t.y * 100, 1));
    sIn.value = String(round(t.scale * 100, 2));
    aIn.value = String(round(t.angle, 2));
  }
  function commit() {
    tW.value = serialiseT(t);
    syncFields();
    if (src()) fitMargin();
    scheduleDraw();
  }
  const fromField = (i: HTMLInputElement, apply: (v: number) => void) =>
    i.addEventListener("change", () => {
      const v = parseFloat(i.value);
      if (isFinite(v)) apply(v);
      commit();
    });
  fromField(xIn, (v) => { const s = src(); t.x = s ? v / s.bgW : v / 100; });
  fromField(yIn, (v) => { const s = src(); t.y = s ? v / s.bgH : v / 100; });
  fromField(sIn, (v) => { if (v > 0) t.scale = v / 100; });
  fromField(aIn, (v) => { t.angle = v; });
  centerBtn.onclick = () => { t.x = 0.5; t.y = 0.5; commit(); };
  resetBtn.onclick = () => { t = { ...DEFAULT }; commit(); };

  // ── Pointer ────────────────────────────────────────────────────────────────
  const evPos = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const { cw } = view();
    const f = cw / r.width;
    return [(e.clientX - r.left) * f, (e.clientY - r.top) * f];
  };

  function hitTest(cx: number, cy: number): string {
    if (!src()) return "";
    const [rx, ry] = rotateHandle();
    if (Math.hypot(cx - rx, cy - ry) <= HANDLE_HIT) return "rotate";
    const cs = corners().map(([x, y]) => toCanvas(x, y));
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(cx - cs[i][0], cy - cs[i][1]) <= HANDLE_HIT) return `c${i}`;
    }
    const [lx, ly] = toLocal(...toBg(cx, cy));
    const p = placed();
    return Math.abs(lx) <= p.w / 2 && Math.abs(ly) <= p.h / 2 ? "move" : "";
  }

  /** Snap the foreground's centre or its (rotated) bounding edges to the background's
   *  centre lines and edges. Returns the shift to apply, in background px. */
  function snap(e: PointerEvent): [number, number] {
    guides = {};
    const s = src()!;
    if (e.altKey) return [0, 0];
    const tol = SNAP_PX / view().k;
    const cs = corners();
    const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    const p = placed();
    const best = (own: number[], targets: number[]) => {
      let d = Infinity, at: number | undefined;
      for (const o of own) for (const g of targets) {
        if (Math.abs(g - o) < Math.abs(d) && Math.abs(g - o) <= tol) { d = g - o; at = g; }
      }
      return { d: at === undefined ? 0 : d, at };
    };
    const bx = best([p.cx, Math.min(...xs), Math.max(...xs)], [s.bgW / 2, 0, s.bgW]);
    const by = best([p.cy, Math.min(...ys), Math.max(...ys)], [s.bgH / 2, 0, s.bgH]);
    guides = { x: bx.at, y: by.at };
    return [bx.d, by.d];
  }

  let drag: null | { mode: string; last: [number, number]; free: [number, number];
                      startAngle: number; dist: number; ang0: number } = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const [cx, cy] = evPos(e);
    const mode = hitTest(cx, cy);
    if (!mode) return;
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const p = placed();
    const [ccx, ccy] = toCanvas(p.cx, p.cy);
    drag = { mode, last: [cx, cy], free: [t.x, t.y], startAngle: t.angle,
             dist: Math.max(1, Math.hypot(cx - ccx, cy - ccy)),
             ang0: Math.atan2(cy - ccy, cx - ccx) };
  });

  canvas.addEventListener("pointermove", (e) => {
    const [cx, cy] = evPos(e);
    if (!drag) {
      const h = hitTest(cx, cy);
      if (h !== hover) { hover = h; scheduleDraw(); }
      canvas.style.cursor = h === "move" ? "move" : h === "rotate" ? "grab"
        : h ? "nwse-resize" : "default";
      return;
    }
    e.stopPropagation();
    const s = src()!;
    const gain = e.shiftKey && drag.mode !== "rotate" ? FINE_GAIN : 1;
    const dx = (cx - drag.last[0]) * gain, dy = (cy - drag.last[1]) * gain;
    drag.last = [cx, cy];
    const k = view().k;
    if (drag.mode === "move") {
      // Move the unsnapped position, then snap a copy: a snap must never eat the drag.
      drag.free = [drag.free[0] + dx / k / s.bgW, drag.free[1] + dy / k / s.bgH];
      t.x = drag.free[0]; t.y = drag.free[1];
      const [sx, sy] = snap(e);
      t.x += sx / s.bgW; t.y += sy / s.bgH;
    } else if (drag.mode === "rotate") {
      const p = placed();
      const [ccx, ccy] = toCanvas(p.cx, p.cy);
      const delta = (Math.atan2(cy - ccy, cx - ccx) - drag.ang0) * 180 / Math.PI;
      let a = drag.startAngle + delta;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      t.angle = ((a + 540) % 360) - 180;
    } else {
      // Corners scale uniformly about the centre by how far the pointer moved toward or away
      // from it - incrementally, so toggling Shift mid-drag never jumps.
      const p = placed();
      const [ccx, ccy] = toCanvas(p.cx, p.cy);
      const dist = Math.max(1, Math.hypot(cx - ccx, cy - ccy));
      t.scale = Math.max(0.01, t.scale * Math.pow(dist / drag.dist, gain));
      drag.dist = dist;
    }
    tW.value = serialiseT(t);
    syncFields();
    scheduleDraw();
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    guides = {};
    canvas.releasePointerCapture?.(e.pointerId);
    commit();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", (e) => {
    if (hitTest(...evPos(e)) === "rotate") { t.angle = 0; commit(); }
  });

  // ── Transport ──────────────────────────────────────────────────────────────
  function refreshTransport() {
    const s = src();
    const n = s ? Math.max(s.bg.length, s.fg.length) : 1;
    transport.style.display = n > 1 && showing() ? "flex" : "none";
    scrub.max = String(Math.max(0, n - 1));
    if (frame >= n) frame = 0;
    scrub.value = String(frame);
  }
  function applyPreview() {
    const on = showing();
    toggleIcon.className = on ? "pi pi-chevron-up" : "pi pi-chevron-down";
    toggleText.textContent = on ? "Hide preview" : "Show preview";
    canvas.style.display = on ? "block" : "none";
    if (!on && playing) playBtn.click();
    refreshTransport();
    mounted?.resizeToContent?.();
    if (on) scheduleDraw();
  }
  toggleBtn.onclick = () => {
    node.properties.nkdMergePreview = !showing();
    applyPreview();
  };

  scrub.addEventListener("input", () => { frame = parseInt(scrub.value, 10) || 0; scheduleDraw(); });
  playBtn.onclick = () => {
    if (playing) { clearInterval(playing); playing = 0; playBtn.textContent = "▶"; return; }
    playBtn.textContent = "❚❚";
    playing = window.setInterval(() => {
      const n = parseInt(scrub.max, 10) + 1;
      frame = (frame + 1) % n;
      scrub.value = String(frame);
      draw();
    }, 125);
  };

  // ── Mount ──────────────────────────────────────────────────────────────────
  const mounted = mountDomWidget(node, {
    name: "nkd_merge_editor", type: "NKD_MERGE", root,
    minWidth: 120,
    minWidthOf: barMinWidth,
    estimate: () => TOGGLE_H + BAR_H + (showing() ? Math.round(CANVAS_W * aspect()) : 0)
      + (transport.style.display === "flex" ? TRANSPORT_H : 0),
    getValue: () => tW.value,
    setValue: (v: string) => { tW.value = v; t = parseT(v); syncFields(); if (src()) fitMargin(); scheduleDraw(); },
    onResize: () => scheduleDraw(),
  });

  live.set(node, () => {
    refreshTransport();
    syncFields();
    fitMargin();
    mounted.resizeToContent?.();
    scheduleDraw();
  });

  for (const name of ["fit", "opacity"]) {
    const w = findW(node, name);
    if (!w || w._nkdMergeCb) continue;
    const orig = w.callback;
    w.callback = function (this: any, ...args: any[]) {
      const r = orig?.apply(this, args);
      if (src()) fitMargin();
      scheduleDraw();
      return r;
    };
    w._nkdMergeCb = true;
  }

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any) {
    origConfigure?.apply(this, arguments);
    t = parseT(tW.value);
    syncFields();
    if (src()) fitMargin();
    applyPreview();
    void fetchSource(String(node.id));
  };
  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    if (playing) clearInterval(playing);
    live.delete(node);
    origRemoved?.apply(this, args);
  };

  syncFields();
  requestAnimationFrame(() => { applyPreview(); draw(); void fetchSource(String(node.id)); });
}
