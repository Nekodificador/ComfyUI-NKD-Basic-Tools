/**
 * 😺NKD Paint — brush canvas on the node, over an optional base image.
 *
 * The hidden `layer` STRING widget holds the FILENAME of an RGBA PNG uploaded to
 * `input/nkd_paint/` through ComfyUI's own `/upload/image`; the name is the SHA-1 of the
 * PNG, so the execution cache keys on content and identical layers dedupe. Nothing
 * pixel-sized ever sits in the workflow JSON (a base64 layer re-serialises on every graph
 * change and lags the whole UI — the Impact Pack lesson).
 *
 * Painting is stroke-buffered: dabs go into `strokeCv` at full opacity and are composited
 * over the layer with the brush opacity only on release, so a stroke never builds up on
 * itself. The eraser is the same path with `destination-out`.
 *
 * Backdrop arrives two ways, same as the spline editors: the upstream Load Image file
 * (instant, `resolveSource`) or the frame the node pushes on execute (`nkd-paint-source`,
 * fed in by main.ts through `paintSource`) for VAE-decoded sources.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { resolveSource, viewUrl, type MediaRef } from "./mediaProbe";
import { findW, hideWidget, mountDomWidget, setWidgetVisible } from "./domHost";
import { attachFineRange } from "./fine_drag";

const NODE_NAME = "NKDPaint";
const EXT_NAME = "NKD.BasicTools.Paint";

console.log("[NKD Paint] rev 1");

const CANVAS_W = 240;      // startup guess for the height estimate only
const MAX_SIDE = 2048;     // layer resolution cap; Python resizes to the base
const UNDO_BUDGET = 256 * 1024 * 1024;  // bytes of ImageData kept for undo, all steps
const ZOOM_MIN = 0.25, ZOOM_MAX = 16;
const SUBFOLDER = "nkd_paint";

type Tool = "brush" | "eraser";
type Base = { el: CanvasImageSource; w: number; h: number; fullW: number; fullH: number };

// Frames pushed by execute(), keyed by node id, and the live widgets that want them.
const frames = new Map<string, Base>();
const live = new Map<string, (b: Base) => void>();

/** Called by main.ts when an `nkd-paint-source` frame arrives. */
export function paintSource(nodeId: string, canvas: HTMLCanvasElement,
                            fullW?: number, fullH?: number): void {
  const b: Base = { el: canvas, w: canvas.width, h: canvas.height,
                    fullW: fullW || canvas.width, fullH: fullH || canvas.height };
  frames.set(nodeId, b);
  live.get(nodeId)?.(b);
}

export function registerPaint(): void {
  comfyApp.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdPaintWrapped) return;
      nodeType.prototype.__nkdPaintWrapped = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setupPaintWidget(this);
        return r;
      };
    },
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

function capSize(w: number, h: number): [number, number] {
  const m = Math.max(w, h);
  if (m > MAX_SIDE) { const k = MAX_SIDE / m; w = Math.round(w * k); h = Math.round(h * k); }
  return [Math.max(1, w | 0), Math.max(1, h | 0)];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [255, 255, 255];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("");

let checkerPattern: CanvasPattern | null = null;
function checker(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (checkerPattern) return checkerPattern;
  const c = mkCanvas(16, 16);
  const x = c.getContext("2d")!;
  x.fillStyle = "#2a2d36"; x.fillRect(0, 0, 16, 16);
  x.fillStyle = "#383b45"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
  checkerPattern = ctx.createPattern(c, "repeat")!;
  return checkerPattern;
}

async function sha1Name(blob: Blob): Promise<string> {
  // crypto.subtle only exists on secure origins (localhost counts, a LAN IP does not):
  // fall back to a unique name — no dedupe, still no collision.
  if (!crypto.subtle) return `nkd_paint_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.png`;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", await blob.arrayBuffer()));
  return "nkd_paint_" + Array.from(d.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("") + ".png";
}

const BTN_CSS = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;border-radius:4px;" +
  "font:11px sans-serif;padding:2px 7px;cursor:pointer;flex:0 0 auto;height:22px;" +
  "display:inline-flex;align-items:center;gap:4px;";
const ON_CSS = "border-color:#4ab4ff;color:#4ab4ff;";

// ── widget ────────────────────────────────────────────────────────────────────

function setupPaintWidget(node: any): void {
  const layerW = findW(node, "layer");
  if (!layerW) return;
  hideWidget(layerW);
  const widthW = findW(node, "width"), heightW = findW(node, "height");
  const cnW = findW(node, "controlnet"), bgW = findW(node, "bg_color");

  // View-only state lives in properties (not execute inputs), same rule as Crop's aspect.
  const P = node.properties;
  P.nkdPaintTool = P.nkdPaintTool ?? "brush";
  P.nkdPaintColor = P.nkdPaintColor ?? "#ffffff";
  P.nkdPaintSize = P.nkdPaintSize ?? 24;
  P.nkdPaintOpacity = P.nkdPaintOpacity ?? 1;
  P.nkdPaintHardness = P.nkdPaintHardness ?? 0.8;
  P.nkdPaintBase = P.nkdPaintBase ?? 1;
  const tool = (): Tool => P.nkdPaintTool;
  const controlnet = () => !!cnW?.value;
  const brushColor = () => (controlnet() ? "#ffffff" : String(P.nkdPaintColor));

  let layerCv = mkCanvas(1024, 1024);
  let strokeCv = mkCanvas(1024, 1024);
  let compCv = mkCanvas(1024, 1024);
  let hasStrokes = false;
  let base: Base | null = null;
  let lastRef: MediaRef | null = null;

  // View: display px = layer px * s + offset; s = fit * zoom, pan in display px.
  let zoom = 1, panX = 0, panY = 0;
  const undo: ImageData[] = [], redo: ImageData[] = [];

  // ── DOM ──
  const root = document.createElement("div");
  root.className = "nkd-paint-wrap";
  root.style.cssText = "display:flex;flex-direction:column;background:#111318;" +
    "border:1px solid #2a2d36;border-radius:6px;overflow:hidden;width:100%;";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:4px 8px;" +
    "background:#1a1c22;border-bottom:1px solid #2a2d36;font:11px sans-serif;color:#c8d0e0;";
  const row1 = document.createElement("div"), row2 = document.createElement("div");
  for (const r of [row1, row2]) r.style.cssText = "display:flex;align-items:center;gap:6px;";
  bar.append(row1, row2);

  function btn(icon: string, title: string, label?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.style.cssText = BTN_CSS; b.title = title;
    b.innerHTML = `<i class="pi ${icon}" style="font-size:11px;color:inherit"></i>${label ? `<span>${label}</span>` : ""}`;
    return b;
  }
  function range(label: string, min: number, max: number, step: number, get: () => number,
                 set: (v: number) => void, width = 54): HTMLElement {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;opacity:0.85;";
    const span = document.createElement("span"); span.textContent = label;
    const inp = document.createElement("input");
    inp.type = "range"; inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(get()); inp.dataset.default = String(get());
    inp.style.cssText = `width:${width}px;height:12px;margin:0;accent-color:#4ab4ff;`;
    inp.addEventListener("input", () => { set(Number(inp.value)); scheduleDraw(); });
    inp.addEventListener("pointerdown", (e) => e.stopPropagation());
    wrap.append(span, inp);
    (wrap as any)._inp = inp;
    return wrap;
  }

  const brushBtn = btn("pi-pencil", "Brush (B)");
  const eraserBtn = btn("pi-eraser", "Eraser (E)");
  const colorIn = document.createElement("input");
  colorIn.type = "color"; colorIn.value = P.nkdPaintColor; colorIn.title = "Brush colour (Alt+click picks from the canvas, X swaps black/white)";
  colorIn.style.cssText = "width:22px;height:22px;padding:0;border:1px solid #3a3d46;border-radius:4px;background:none;cursor:pointer;flex:0 0 auto;";
  colorIn.addEventListener("input", () => { P.nkdPaintColor = colorIn.value; });
  colorIn.addEventListener("pointerdown", (e) => e.stopPropagation());
  const swatch = (hex: string) => {
    const s = document.createElement("button");
    s.style.cssText = `width:14px;height:14px;border-radius:3px;border:1px solid #3a3d46;background:${hex};cursor:pointer;padding:0;flex:0 0 auto;`;
    s.title = hex; s.addEventListener("click", () => setColor(hex));
    return s;
  };
  const whiteSw = swatch("#ffffff"), blackSw = swatch("#000000");
  const undoBtn = btn("pi-undo", "Undo (Ctrl+Z)");
  const redoBtn = btn("pi-refresh", "Redo (Ctrl+Shift+Z)");
  const clearBtn = btn("pi-trash", "Clear the layer", "Clear");
  clearBtn.style.marginLeft = "auto";
  row1.append(brushBtn, eraserBtn, colorIn, whiteSw, blackSw, undoBtn, redoBtn, clearBtn);

  const sizeR = range("Size", 1, 400, 1, () => P.nkdPaintSize, (v) => { P.nkdPaintSize = v; });
  const opR = range("Opacity", 0.05, 1, 0.01, () => P.nkdPaintOpacity, (v) => { P.nkdPaintOpacity = v; });
  const hardR = range("Hard", 0, 1, 0.01, () => P.nkdPaintHardness, (v) => { P.nkdPaintHardness = v; });
  const baseR = range("Base", 0, 1, 0.01, () => P.nkdPaintBase, (v) => { P.nkdPaintBase = v; });
  row2.append(sizeR, opR, hardR, baseR);
  const sizeInp: HTMLInputElement = (sizeR as any)._inp;
  const hardInp: HTMLInputElement = (hardR as any)._inp;

  const barMinWidth = () => {
    const rowW = (r: HTMLElement) => {
      const kids = Array.from(r.children) as HTMLElement[];
      return kids.reduce((s, k) => s + k.offsetWidth, 0) + 16 + 6 * Math.max(0, kids.length - 1);
    };
    return Math.max(rowW(row1), rowW(row2));
  };

  const cv = document.createElement("canvas");
  cv.style.cssText = "display:block;width:100%;cursor:none;touch-action:none;aspect-ratio:1/1;";
  cv.tabIndex = -1;
  root.append(bar, cv);
  const ctx = cv.getContext("2d")!;

  function setColor(hex: string) {
    P.nkdPaintColor = hex; colorIn.value = hex;
  }
  function syncToolbar() {
    brushBtn.style.cssText = BTN_CSS + (tool() === "brush" ? ON_CSS : "");
    eraserBtn.style.cssText = BTN_CSS + (tool() === "eraser" ? ON_CSS : "");
    const cn = controlnet();
    for (const el of [colorIn, whiteSw, blackSw]) {
      el.style.opacity = cn ? "0.3" : "1"; el.style.pointerEvents = cn ? "none" : "auto";
    }
    if (cn) colorIn.value = "#ffffff"; else colorIn.value = P.nkdPaintColor;
    undoBtn.style.opacity = undo.length ? "1" : "0.3";
    redoBtn.style.opacity = redo.length ? "1" : "0.3";
    baseR.style.display = base ? "" : "none";
  }
  brushBtn.addEventListener("click", () => { P.nkdPaintTool = "brush"; syncToolbar(); });
  eraserBtn.addEventListener("click", () => { P.nkdPaintTool = "eraser"; syncToolbar(); });
  undoBtn.addEventListener("click", () => doUndo());
  redoBtn.addEventListener("click", () => doRedo());
  clearBtn.addEventListener("click", () => {
    if (!hasStrokes) return;
    snapshot();
    layerCv.getContext("2d")!.clearRect(0, 0, layerCv.width, layerCv.height);
    hasStrokes = false;
    setLayerValue("");
    scheduleDraw();
  });
  const detachFine = attachFineRange(bar);

  // ── layer sizing ──
  function targetSize(): [number, number] {
    if (base) return capSize(base.fullW, base.fullH);
    return capSize(Number(widthW?.value) || 1024, Number(heightW?.value) || 1024);
  }
  function ensureLayerSize(): void {
    const [w, h] = targetSize();
    if (layerCv.width === w && layerCv.height === h) return;
    const old = layerCv;
    layerCv = mkCanvas(w, h);
    if (hasStrokes) layerCv.getContext("2d")!.drawImage(old, 0, 0, w, h);
    strokeCv = mkCanvas(w, h);
    compCv = mkCanvas(w, h);
    undo.length = 0; redo.length = 0;
    cv.style.aspectRatio = `${w}/${h}`;
    zoom = 1; panX = panY = 0;
    mounted?.resizeToContent();
    scheduleDraw();
  }

  // ── view maths ──
  function view() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const fit = Math.min(W / layerCv.width, H / layerCv.height);
    const s = fit * zoom;
    return { W, H, s, ox: (W - layerCv.width * s) / 2 + panX, oy: (H - layerCv.height * s) / 2 + panY };
  }
  function eventDisp(e: PointerEvent | WheelEvent): [number, number] {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * (cv.clientWidth / r.width), (e.clientY - r.top) * (cv.clientHeight / r.height)];
  }
  function dispToLayer(px: number, py: number): [number, number] {
    const v = view();
    return [(px - v.ox) / v.s, (py - v.oy) / v.s];
  }

  // ── drawing ──
  let raf = 0;
  const scheduleDraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  let hover: [number, number] | null = null;   // display px of the pointer, for the cursor ring
  // Alt held = eyedropper: swap the ring for a pipette cursor so the gesture reads before the
  // click. Tracked from both the keyboard and the pointer's own modifier state, since Alt can
  // go down while the pointer is elsewhere.
  let altHeld = false;
  const PIPETTE = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z" fill="none" stroke="black" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M13 8l3 3 4-4-3-3z" fill="black" stroke="white" stroke-width="1"/></svg>') + '") 2 22, crosshair';
  function setAlt(on: boolean) {
    if (altHeld === on) return;
    altHeld = on;
    cv.style.cursor = on ? PIPETTE : "none";
    scheduleDraw();
  }
  let sizePreview: number | null = null;       // brush size while Alt+right-dragging
  let hardPreview: number | null = null;       // hardness while Alt+right-dragging

  /** layer ⊕ current stroke, with the brush opacity — the same op commit() bakes in. */
  function composite(target: CanvasRenderingContext2D, withStroke: boolean) {
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
    target.clearRect(0, 0, layerCv.width, layerCv.height);
    target.drawImage(layerCv, 0, 0);
    if (!withStroke) return;
    target.globalAlpha = P.nkdPaintOpacity;
    target.globalCompositeOperation = tool() === "eraser" ? "destination-out" : "source-over";
    target.drawImage(strokeCv, 0, 0);
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
  }

  function draw() {
    const { W, H, s, ox, oy } = view();
    if (W < 1 || H < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111318"; ctx.fillRect(0, 0, W, H);
    const lw = layerCv.width * s, lh = layerCv.height * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, lw, lh); ctx.clip();
    ctx.fillStyle = checker(ctx); ctx.fillRect(ox, oy, lw, lh);
    ctx.imageSmoothingEnabled = s < 3;
    if (base) {
      ctx.globalAlpha = P.nkdPaintBase;
      ctx.drawImage(base.el, ox, oy, lw, lh);
      ctx.globalAlpha = 1;
    } else if (bgW?.value) {
      ctx.fillStyle = String(bgW.value); ctx.fillRect(ox, oy, lw, lh);
    }
    if (stroking) { composite(compCv.getContext("2d")!, true); ctx.drawImage(compCv, ox, oy, lw, lh); }
    else ctx.drawImage(layerCv, ox, oy, lw, lh);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, lw - 1, lh - 1);
    if (hover && !panning && (!altHeld || sizeDrag)) {
      const r = Math.max(1.5, ((sizePreview ?? P.nkdPaintSize) * s) / 2);
      ctx.beginPath(); ctx.arc(hover[0], hover[1], r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1; ctx.stroke();
      if (hardPreview != null) {   // inner ring = where the dab stops being solid
        ctx.beginPath(); ctx.arc(hover[0], hover[1], Math.max(0.5, r * hardPreview), 0, Math.PI * 2);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  // ── brush engine ──
  let stroking = false, panning = false, picking = false;
  let last: [number, number] | null = null;
  let carry = 0;
  let sizeDrag: { x0: number; y0: number; size0: number; hard0: number } | null = null;
  let panDrag: { x0: number; y0: number; px: number; py: number } | null = null;
  let spaceHeld = false;

  /**
   * One stamp. Two things keep a soft brush soft:
   *   - the falloff is an S-curve, not a straight ramp, so the fringe fades out instead of
   *     ending in a visible rim;
   *   - the stamp's peak alpha drops with softness ("flow"). Stamps overlap ~12× along a
   *     stroke, and 1 − (1 − a)^12 saturates anything: with a = 1 a hardness-0 brush came out
   *     nearly as hard as hardness-1 (Neko: "la dureza baja no es lo suficientemente
   *     difusa"). At a = 0.4 the centre still saturates through the overlap while the fringe
   *     keeps its ramp (measured: hardness 0 at a = 0.3 peaked at 224/255, 0.4 saturates). Hard brushes keep a = 1 so a single tap is a solid disc.
   */
  function dab(x: number, y: number, r: number) {
    const sctx = strokeCv.getContext("2d")!;
    r = Math.max(0.5, r);
    const hard = Math.min(0.99, P.nkdPaintHardness);
    const [cr, cg, cb] = hexToRgb(tool() === "eraser" ? "#000000" : brushColor());
    const flow = hard >= 0.99 ? 1 : 0.4 + 0.6 * hard;
    const g = sctx.createRadialGradient(x, y, r * hard, x, y, r);
    const STOPS = 8;
    for (let k = 0; k <= STOPS; k++) {
      const u = k / STOPS;
      const fall = 1 - u * u * (3 - 2 * u);           // smoothstep, 1 → 0
      g.addColorStop(u, `rgba(${cr},${cg},${cb},${(flow * fall).toFixed(4)})`);
    }
    sctx.fillStyle = g;
    sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill();
  }
  function radiusFor(e: PointerEvent): number {
    let size = P.nkdPaintSize;
    if (e.pointerType === "pen" && e.pressure > 0) size *= 0.25 + 0.75 * e.pressure;
    return size / 2;
  }
  function strokeTo(x: number, y: number, r: number) {
    if (!last) { dab(x, y, r); last = [x, y]; carry = 0; return; }
    const dx = x - last[0], dy = y - last[1];
    const d = Math.hypot(dx, dy);
    // 8 % of the diameter. 15 % scalloped visibly on a big hard brush (Neko: "va dando
    // saltos"); below ~5 % the stamps cost more than they show.
    const spacing = Math.max(0.75, r * 0.16);
    let t = spacing - carry;
    while (t <= d) { dab(last[0] + dx * (t / d), last[1] + dy * (t / d), r); t += spacing; }
    carry = d - (t - spacing);
    last = [x, y];
  }

  function snapshot() {
    const lctx = layerCv.getContext("2d")!;
    undo.push(lctx.getImageData(0, 0, layerCv.width, layerCv.height));
    redo.length = 0;
    const per = layerCv.width * layerCv.height * 4;
    const max = Math.max(3, Math.min(20, Math.floor(UNDO_BUDGET / per)));
    while (undo.length > max) undo.shift();
    syncToolbar();
  }
  function restore(from: ImageData[], to: ImageData[]) {
    const img = from.pop(); if (!img) return;
    const lctx = layerCv.getContext("2d")!;
    to.push(lctx.getImageData(0, 0, layerCv.width, layerCv.height));
    lctx.putImageData(img, 0, 0);
    hasStrokes = true;
    scheduleSave(); syncToolbar(); scheduleDraw();
  }
  const doUndo = () => restore(undo, redo);
  const doRedo = () => restore(redo, undo);

  function commit() {
    snapshot();
    composite(compCv.getContext("2d")!, true);
    const lctx = layerCv.getContext("2d")!;
    lctx.clearRect(0, 0, layerCv.width, layerCv.height);
    lctx.drawImage(compCv, 0, 0);
    strokeCv.getContext("2d")!.clearRect(0, 0, strokeCv.width, strokeCv.height);
    hasStrokes = true;
    scheduleSave();
  }

  function pick(px: number, py: number) {
    const [lx, ly] = dispToLayer(px, py);
    if (lx < 0 || ly < 0 || lx >= layerCv.width || ly >= layerCv.height) return;
    const c = mkCanvas(1, 1), x = c.getContext("2d")!;
    if (base) x.drawImage(base.el, lx * base.w / layerCv.width, ly * base.h / layerCv.height, 1, 1, 0, 0, 1, 1);
    else if (bgW?.value) { x.fillStyle = String(bgW.value); x.fillRect(0, 0, 1, 1); }
    x.drawImage(layerCv, lx | 0, ly | 0, 1, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return;
    setColor(toHex(d[0], d[1], d[2]));
  }

  // ── pointer ──
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("pointerenter", () => { hover = null; hovering = true; });
  cv.addEventListener("pointerleave", () => { hovering = false; hover = null; scheduleDraw(); });
  cv.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic ids */ }
    cv.focus({ preventScroll: true });
    const [px, py] = eventDisp(e);
    if (e.button === 1 || spaceHeld) {
      panning = true; panDrag = { x0: px, y0: py, px: panX, py: panY }; return;
    }
    if (e.altKey && e.button === 2) {
      sizeDrag = { x0: px, y0: py, size0: P.nkdPaintSize, hard0: P.nkdPaintHardness };
      sizePreview = P.nkdPaintSize; hardPreview = P.nkdPaintHardness; return;
    }
    if (e.altKey && e.button === 0) { picking = true; pick(px, py); return; }
    if (e.button !== 0) return;
    stroking = true; last = null;
    const [lx, ly] = dispToLayer(px, py);
    strokeTo(lx, ly, radiusFor(e));
    scheduleDraw();
  });
  cv.addEventListener("pointermove", (e) => {
    e.stopPropagation();
    const [px, py] = eventDisp(e);
    hover = [px, py];
    setAlt(e.altKey);
    if (panning && panDrag) {
      panX = panDrag.px + (px - panDrag.x0); panY = panDrag.py + (py - panDrag.y0);
    } else if (sizeDrag) {
      // One layer px of diameter per layer px of horizontal travel — coarse on a small node,
      // exact once zoomed in, which is when you care.
      sizePreview = Math.max(1, Math.min(400, Math.round(sizeDrag.size0 + (px - sizeDrag.x0) / view().s)));
      // Vertical = hardness, Photoshop's other axis: down hardens, up softens, full range in ~150 px.
      hardPreview = Math.max(0, Math.min(1, sizeDrag.hard0 + (py - sizeDrag.y0) / 150));
      // The sliders follow the drag live; the values are committed on release (below).
      sizeInp.value = String(sizePreview); hardInp.value = hardPreview.toFixed(2);
    } else if (picking) {
      pick(px, py);
    } else if (stroking) {
      const [lx, ly] = dispToLayer(px, py);
      strokeTo(lx, ly, radiusFor(e));
    }
    scheduleDraw();
  });
  const endPointer = (e: PointerEvent) => {
    e.stopPropagation();
    if (stroking) { stroking = false; last = null; commit(); }
    if (sizeDrag) {
      if (sizePreview != null) { P.nkdPaintSize = sizePreview; sizeInp.value = String(sizePreview); }
      if (hardPreview != null) { P.nkdPaintHardness = hardPreview; hardInp.value = String(hardPreview); }
      sizeDrag = null; sizePreview = null; hardPreview = null;
    }
    panning = false; panDrag = null; picking = false;
    scheduleDraw();
  };
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);

  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const [px, py] = eventDisp(e);
    const before = view();
    const [lx, ly] = [(px - before.ox) / before.s, (py - before.oy) / before.s];
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = view();  // recomputed with the new zoom, current pan
    // keep the layer point under the cursor where it is
    const ox = px - lx * after.s, oy = py - ly * after.s;
    panX = ox - (after.W - layerCv.width * after.s) / 2;
    panY = oy - (after.H - layerCv.height * after.s) / 2;
    scheduleDraw();
  }, { passive: false });

  // ── keyboard (while the pointer is over the widget or the canvas has focus) ──
  let hovering = false;
  const wantsKeys = () => {
    if (!hovering && document.activeElement !== cv) return false;
    const a = document.activeElement as HTMLElement | null;
    return !(a && a !== cv && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!wantsKeys()) return;
    const k = e.key;
    if (k === "Alt") { setAlt(true); return; }
    if (k === " ") { spaceHeld = true; e.preventDefault(); e.stopPropagation(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) {
      if (e.shiftKey) doRedo(); else doUndo();
      e.preventDefault(); e.stopPropagation(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (k === "y" || k === "Y")) { doRedo(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = true;
    switch (k) {
      case "b": case "B": P.nkdPaintTool = "brush"; break;
      case "e": case "E": P.nkdPaintTool = "eraser"; break;
      case "x": case "X": setColor(P.nkdPaintColor.toLowerCase() === "#ffffff" ? "#000000" : "#ffffff"); break;
      case "[": P.nkdPaintSize = Math.max(1, Math.round(P.nkdPaintSize * 0.9) || 1); break;
      case "]": P.nkdPaintSize = Math.min(400, Math.max(P.nkdPaintSize + 1, Math.round(P.nkdPaintSize * 1.1))); break;
      case "0": zoom = 1; panX = panY = 0; break;
      default: handled = false;
    }
    if (!handled) return;
    sizeInp.value = String(P.nkdPaintSize);
    syncToolbar(); scheduleDraw();
    e.preventDefault(); e.stopPropagation();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") spaceHeld = false;
    if (e.key === "Alt") setAlt(false);
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", () => { spaceHeld = false; setAlt(false); });

  // ── persistence ──
  function setLayerValue(v: string) {
    if (layerW.value === v) return;
    layerW.value = v;
    layerW.callback?.(v);
    node.graph?.setDirtyCanvas?.(true, true);
  }
  let saveTimer = 0, saving = false, saveAgain = false;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = window.setTimeout(saveLayer, 300); }
  async function saveLayer() {
    if (saving) { saveAgain = true; return; }
    saving = true;
    try {
      const blob: Blob | null = await new Promise((r) => layerCv.toBlob(r, "image/png"));
      if (!blob) return;
      const name = await sha1Name(blob);
      const fd = new FormData();
      fd.append("image", blob, name);
      fd.append("subfolder", SUBFOLDER);
      fd.append("overwrite", "true");
      const res = await api.fetchApi("/upload/image", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      const d = await res.json();
      setLayerValue(`${d.subfolder ? d.subfolder + "/" : ""}${d.name}`);
    } catch (err) {
      console.warn("[NKD Paint] layer upload failed", err);
      comfyApp.extensionManager?.toast?.add?.({ severity: "warn", summary: "NKD Paint",
        detail: "Could not upload the painted layer.", life: 5000 });
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; scheduleSave(); }
    }
  }
  function loadLayer(v: string) {
    if (!v) {
      layerCv.getContext("2d")!.clearRect(0, 0, layerCv.width, layerCv.height);
      hasStrokes = false; scheduleDraw(); return;
    }
    const m = /^(.*?)\s*\[(\w+)\]$/.exec(v);
    const clean = m ? m[1] : v;
    const cut = clean.lastIndexOf("/");
    const ref: MediaRef = { filename: cut >= 0 ? clean.slice(cut + 1) : clean,
                            subfolder: cut >= 0 ? clean.slice(0, cut) : "", type: m ? m[2] : "input" };
    const img = new Image();
    img.onload = () => {
      // No base yet and the file knows its own size: adopt it, so a reload doesn't resample.
      if (!base && (layerCv.width !== img.naturalWidth || layerCv.height !== img.naturalHeight)
          && !imageLinked()) {
        const [w, h] = capSize(img.naturalWidth, img.naturalHeight);
        layerCv = mkCanvas(w, h); strokeCv = mkCanvas(w, h); compCv = mkCanvas(w, h);
        cv.style.aspectRatio = `${w}/${h}`;
        mounted?.resizeToContent();
      }
      const lctx = layerCv.getContext("2d")!;
      lctx.clearRect(0, 0, layerCv.width, layerCv.height);
      lctx.drawImage(img, 0, 0, layerCv.width, layerCv.height);
      hasStrokes = true;
      scheduleDraw();
    };
    img.src = viewUrl(ref);
  }

  // ── base image ──
  const imageLinked = () => node.inputs?.find((i: any) => i.name === "image")?.link != null;
  function setBase(b: Base | null) {
    base = b;
    ensureLayerSize();
    syncToolbar();
    scheduleDraw();
  }
  /**
   * Which backdrop is the truth depends on what sits upstream:
   *   - a Load Image wired DIRECTLY into `image`: its file, instantly, and it tracks edits.
   *   - anything in between (Crop, a resize, a VAE Decode): the file two hops up is NOT what
   *     this node receives — Neko saw the original 1024² behind a 1486² outpaint. So the frame
   *     pushed on execute wins, and the far file is only the stand-in until the first run.
   */
  const directRef = () => resolveSource(node, "image", 0);
  function loadFile(ref: MediaRef) {
    if (lastRef && ref.filename === lastRef.filename && ref.subfolder === lastRef.subfolder
        && ref.type === lastRef.type) return;
    lastRef = ref;
    const img = new Image();
    img.onload = () => setBase({ el: img, w: img.naturalWidth, h: img.naturalHeight,
                                 fullW: img.naturalWidth, fullH: img.naturalHeight });
    img.src = viewUrl(ref);
  }
  function refreshSource() {
    if (!imageLinked()) {
      if (base) { lastRef = null; setBase(null); }
      return;
    }
    const direct = directRef();
    if (direct) { loadFile(direct); return; }
    const f = frames.get(String(node.id));
    if (f) { lastRef = null; if (base !== f) setBase(f); return; }
    const far = resolveSource(node, "image");
    if (far) loadFile(far);
  }
  live.set(String(node.id), (b) => { if (imageLinked() && !directRef()) { lastRef = null; setBase(b); } });

  function syncDims() {
    const linked = imageLinked();
    setWidgetVisible(node, "width", !linked);
    setWidgetVisible(node, "height", !linked);
    if (Array.isArray(node.widgets)) node.widgets = [...node.widgets];
    node.setSize(node.computeSize());
    node.setDirtyCanvas(true, true);
  }
  function wrapCallback(w: any, handler: () => void) {
    if (!w || w._nkdPaintCb) return;
    const orig = w.callback;
    w.callback = function (this: any, ...args: any[]) { const r = orig?.apply(this, args); handler(); return r; };
    w._nkdPaintCb = true;
  }
  wrapCallback(widthW, ensureLayerSize);
  wrapCallback(heightW, ensureLayerSize);
  wrapCallback(cnW, () => { syncToolbar(); scheduleDraw(); });
  wrapCallback(bgW, scheduleDraw);

  // ── mount ──
  const mounted = mountDomWidget(node, {
    name: "nkd_paint_editor", type: "NKD_PAINT", root,
    minWidth: 120, minWidthOf: barMinWidth,
    estimate: () => (bar.offsetHeight || 60) + Math.round(CANVAS_W * layerCv.height / layerCv.width),
    getValue: () => layerW.value,
    setValue: (v: string) => { layerW.value = v; loadLayer(v); },
    onResize: scheduleDraw,
  });

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any) {
    origConfigure?.apply(this, arguments);
    colorIn.value = P.nkdPaintColor;
    sizeInp.value = String(P.nkdPaintSize);
    syncDims(); refreshSource();
    loadLayer(layerW.value);
    syncToolbar(); scheduleDraw();
  };
  const origConnChange = node.onConnectionsChange;
  node.onConnectionsChange = function (this: any, ...args: any[]) {
    origConnChange?.apply(this, args);
    syncDims(); refreshSource();
  };
  const refreshPoll = window.setInterval(refreshSource, 500);

  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    clearInterval(refreshPoll);
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    live.delete(String(node.id));
    detachFine();
    mounted.release();
    origRemoved?.apply(this, args);
  };

  // Dev handle: the layer is otherwise unreachable from the console.
  node.__nkdPaint = { layer: () => layerCv, hasStrokes: () => hasStrokes, base: () => base, draw };

  syncToolbar();
  requestAnimationFrame(() => { syncDims(); refreshSource(); ensureLayerSize(); draw(); });
}
