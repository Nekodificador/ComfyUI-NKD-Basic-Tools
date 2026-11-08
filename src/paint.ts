/**
 * 😺NKD Paint — brush canvas on the node, over an optional base image.
 *
 * The hidden `layer` STRING widget holds the FILENAME of an RGBA PNG uploaded to
 * `input/nkd_paint/` through ComfyUI's own `/upload/image`; the name is the SHA-1 of the
 * PNG, so the execution cache keys on content and identical layers dedupe. Nothing
 * pixel-sized ever sits in the workflow JSON (a base64 layer re-serialises on every graph
 * change and lags the whole UI — the Impact Pack lesson).
 *
 * The brush itself (strokes, softness, lasso fill, undo) is `brush.ts`, shared with the
 * Popup Preview of NKD Preview Tools; this file is the node: the view, the input and the
 * persistence.
 *
 * 😺NKD Mask Painter runs the same widget with `MaskOpts` (maskPainter.ts): the brush is
 * always white, the layer's alpha is the mask, Alt erases instead of picking a colour, and
 * the canvas shows the mask (tinted, dimming the outside, alone, or hidden) instead of
 * colour strokes.
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
import { openNkdModal } from "./nkd_modal";
import { BrushLayer, adjustBrush, mkCanvas, radiusFor, stepSize, SIZE_MAX } from "./brush";

const NODE_NAME = "NKDPaint";
const EXT_NAME = "NKD.BasicTools.Paint";

console.log("[NKD Paint] rev 2");

const CANVAS_W = 240;      // startup guess for the height estimate only
const MAX_SIDE = 2048;     // layer resolution cap; Python resizes to the base
const ZOOM_MIN = 0.25, ZOOM_MAX = 16;
const LASSO_SNAP = 8;      // display px: a click this close to the first point closes the lasso

type Tool = "brush" | "eraser";
type Base = { el: CanvasImageSource; w: number; h: number; fullW: number; fullH: number };
type MaskView = "overlay" | "dim" | "mask";
const MASK_VIEWS: MaskView[] = ["overlay", "dim", "mask"];
const VIEW_LABEL: Record<MaskView, string> = { overlay: "Overlay", dim: "Dim", mask: "Mask" };
const MASK_TINT = "#4ab4ff";

export interface PaintOpts {
  widget: string;        // the hidden STRING widget holding the layer's file name
  input: string;         // the IMAGE input the backdrop comes from
  subfolder: string;     // under input/
  prefix: string;        // file name prefix
  title: string;         // full-screen view
  mask: boolean;
  onClear?: () => void;
}
const PAINT_OPTS: PaintOpts = { widget: "layer", input: "image", subfolder: "nkd_paint",
                                prefix: "nkd_paint_", title: "😺 Painter Node", mask: false };

/** What the Mask Painter needs from the widget beyond what the user does on it. */
export interface PaintHandle {
  L: BrushLayer;
  row1: HTMLElement;
  /** A mask the node baked itself: show it and take its name, without re-uploading. */
  adopt: (value: string) => void;
  /** The upstream mask (alpha) the editor combines with the layer for display. */
  setUpstream: (c: HTMLCanvasElement | null) => void;
  upstream: () => HTMLCanvasElement | null;
  redraw: () => void;
}

// Frames pushed by execute(), keyed by node id, and the live widgets that want them.
const frames = new Map<string, Base>();
const live = new Map<string, (b: Base) => void>();

/**
 * Alt on the canvas belongs to the brush (Alt + right drag: size and hardness; Mask Painter:
 * Alt erases), but NodeWrangler takes every Alt + right press over the graph in a window
 * capture listener and kills it before it reaches us. Its listener goes in at setup(), after
 * every extension module is imported, so this one, added at import, runs first: it hands Alt
 * presses on a paint canvas to that canvas directly and stops the event there.
 */
window.addEventListener("pointerdown", (e) => {
  const down = (e.target as any)?._nkdAltDown;
  if (!down || !e.altKey) return;
  e.stopImmediatePropagation();
  down(e);
}, true);

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
        setupPaintWidget(this, PAINT_OPTS);
        return r;
      };
    },
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function capSize(w: number, h: number): [number, number] {
  const m = Math.max(w, h);
  if (m > MAX_SIDE) { const k = MAX_SIDE / m; w = Math.round(w * k); h = Math.round(h * k); }
  return [Math.max(1, w | 0), Math.max(1, h | 0)];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("");

let checkerPattern: CanvasPattern | null = null;
export function checker(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (checkerPattern) return checkerPattern;
  const c = mkCanvas(16, 16);
  const x = c.getContext("2d")!;
  x.fillStyle = "#2a2d36"; x.fillRect(0, 0, 16, 16);
  x.fillStyle = "#383b45"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
  checkerPattern = ctx.createPattern(c, "repeat")!;
  return checkerPattern;
}

/** A greyscale mask image (white = masked) as a white canvas with the mask in alpha. */
export function greyToAlpha(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = mkCanvas(w, h), x = c.getContext("2d")!;
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i + 3] = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

async function sha1Name(blob: Blob, prefix: string): Promise<string> {
  // crypto.subtle only exists on secure origins (localhost counts, a LAN IP does not):
  // fall back to a unique name — no dedupe, still no collision.
  if (!crypto.subtle) return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.png`;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", await blob.arrayBuffer()));
  return prefix + Array.from(d.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("") + ".png";
}

const BTN_CSS = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;border-radius:4px;" +
  "font:11px sans-serif;padding:2px 7px;cursor:pointer;flex:0 0 auto;height:22px;" +
  "display:inline-flex;align-items:center;gap:4px;";
const ON_CSS = "border-color:#4ab4ff;color:#4ab4ff;";

// ── widget ────────────────────────────────────────────────────────────────────

export function setupPaintWidget(node: any, o: PaintOpts): PaintHandle | undefined {
  const layerW = findW(node, o.widget);
  if (!layerW) return;
  hideWidget(layerW);
  const widthW = findW(node, "width"), heightW = findW(node, "height");
  const cnW = findW(node, "controlnet"), bgW = findW(node, "bg_color");
  const modeW = findW(node, "mask_input_mode");

  // View-only state lives in properties (not execute inputs), same rule as Crop's aspect.
  const P = node.properties;
  P.nkdPaintTool = P.nkdPaintTool ?? "brush";
  P.nkdPaintColor = P.nkdPaintColor ?? "#ffffff";
  P.nkdPaintSize = P.nkdPaintSize ?? 24;
  P.nkdPaintOpacity = P.nkdPaintOpacity ?? 1;
  P.nkdPaintHardness = P.nkdPaintHardness ?? 0.8;
  P.nkdPaintBase = P.nkdPaintBase ?? 1;
  P.nkdPaintLasso = P.nkdPaintLasso ?? false;
  if (o.mask && !MASK_VIEWS.includes(P.nkdMaskView)) P.nkdMaskView = "overlay";
  // Shift + view: the image with no mask on it, to judge an edge. Never saved, so a reload
  // can't open on a canvas that looks empty.
  let maskHidden = false;
  const tool = (): Tool => P.nkdPaintTool;
  const controlnet = () => !!cnW?.value;
  const brushColor = () => (o.mask || controlnet() ? "#ffffff" : String(P.nkdPaintColor));
  // Mask Painter: Alt erases for the stroke or lasso it was held for.
  let eraseNow = false;

  const L = new BrushLayer(1024, 1024, () => ({
    size: P.nkdPaintSize, opacity: P.nkdPaintOpacity, hardness: P.nkdPaintHardness,
    tool: eraseNow ? "eraser" : tool(), color: brushColor(),
  }), () => { scheduleSave(); syncToolbar(); scheduleDraw(); });
  let base: Base | null = null;
  let lastRef: MediaRef | null = null;
  let upstream: HTMLCanvasElement | null = null;

  // View: display px = layer px * s + offset; s = fit * zoom, pan in display px.
  let zoom = 1, panX = 0, panY = 0;

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
    b.innerHTML = `${icon ? `<i class="pi ${icon}" style="font-size:11px;color:inherit"></i>` : ""}${label ? `<span>${label}</span>` : ""}`;
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
  const eraserBtn = btn("pi-eraser", "Eraser (E). The right button erases with any tool");
  const lassoBtn = btn("", o.mask
    ? "Lasso fill (L): drag to draw a shape, or click corners and close on the first point, double-click or Enter. Alt, the right button or the eraser takes it away."
    : "Lasso fill (L): drag to draw a shape, or click corners and close on the first point, double-click or Enter. With the eraser or the right button it erases.",
    "Lasso");
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
  const expandBtn = btn("pi-window-maximize", "Full-screen view");
  row1.append(brushBtn, eraserBtn, lassoBtn);
  if (!o.mask) row1.append(colorIn, whiteSw, blackSw);
  row1.append(undoBtn, redoBtn, clearBtn, expandBtn);

  const sizeR = range("Size", 1, SIZE_MAX, 1, () => P.nkdPaintSize, (v) => { P.nkdPaintSize = v; });
  const opR = range("Opacity", 0.05, 1, 0.01, () => P.nkdPaintOpacity, (v) => { P.nkdPaintOpacity = v; });
  const hardR = range("Hard", 0, 1, 0.01, () => P.nkdPaintHardness, (v) => { P.nkdPaintHardness = v; });
  const baseR = range("Base", 0, 1, 0.01, () => P.nkdPaintBase, (v) => { P.nkdPaintBase = v; });
  const viewBtn = btn("pi-eye", "View (V): mask over the image, outside dimmed, mask alone. Shift+click or Shift+V hides the mask", "Overlay");
  row2.append(sizeR, opR, hardR, o.mask ? viewBtn : baseR);
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
  // Redraw whenever the canvas box changes: the modal lays out after it opens.
  const cvObserver = new ResizeObserver(() => scheduleDraw());
  cvObserver.observe(cv);

  function setColor(hex: string) {
    P.nkdPaintColor = hex; colorIn.value = hex;
  }
  function syncToolbar() {
    brushBtn.style.cssText = BTN_CSS + (tool() === "brush" ? ON_CSS : "");
    eraserBtn.style.cssText = BTN_CSS + (tool() === "eraser" ? ON_CSS : "");
    lassoBtn.style.cssText = BTN_CSS + (P.nkdPaintLasso ? ON_CSS : "");
    const cn = controlnet();
    for (const el of [colorIn, whiteSw, blackSw]) {
      el.style.opacity = cn ? "0.3" : "1"; el.style.pointerEvents = cn ? "none" : "auto";
    }
    if (cn) colorIn.value = "#ffffff"; else colorIn.value = P.nkdPaintColor;
    undoBtn.style.opacity = L.canUndo ? "1" : "0.3";
    redoBtn.style.opacity = L.canRedo ? "1" : "0.3";
    baseR.style.display = base ? "" : "none";
    if (o.mask) {
      viewBtn.lastElementChild!.textContent = maskHidden ? "Hidden" : VIEW_LABEL[P.nkdMaskView as MaskView];
      viewBtn.style.cssText = BTN_CSS + (maskHidden ? "border-color:#e0a040;color:#e0a040;" : "");
    }
    cv.style.cursor = altHeld && !o.mask ? PIPETTE : P.nkdPaintLasso ? "crosshair" : "none";
  }
  function cycleView(shift: boolean) {
    if (shift || maskHidden) { maskHidden = shift && !maskHidden; return; }
    const i = MASK_VIEWS.indexOf(P.nkdMaskView);
    P.nkdMaskView = MASK_VIEWS[(i + 1) % MASK_VIEWS.length];
  }
  brushBtn.addEventListener("click", () => { P.nkdPaintTool = "brush"; syncToolbar(); });
  eraserBtn.addEventListener("click", () => { P.nkdPaintTool = "eraser"; syncToolbar(); });
  lassoBtn.addEventListener("click", () => { P.nkdPaintLasso = !P.nkdPaintLasso; lasso = null; syncToolbar(); scheduleDraw(); });
  viewBtn.addEventListener("click", (e) => { cycleView(e.shiftKey); syncToolbar(); scheduleDraw(); });
  undoBtn.addEventListener("click", () => L.undo());
  redoBtn.addEventListener("click", () => L.redo());
  clearBtn.addEventListener("click", () => {
    if (!L.clear()) return;
    setLayerValue("");
    syncToolbar(); scheduleDraw();
    o.onClear?.();
  });
  expandBtn.addEventListener("click", () => expand());
  const detachFine = attachFineRange(bar);

  // ── full-screen: the same bar and canvas, moved into the modal and back ──
  function expand() {
    const keepH = root.offsetHeight;
    root.style.height = `${keepH}px`;   // the node keeps its size while the content is away
    const holder = document.createElement("div");
    holder.style.cssText = "display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-width:0;min-height:0;";
    const m = openNkdModal({
      title: o.title,
      hint: "wheel: zoom · Space or middle drag: pan · 0: fit · [ ]: size · Alt+right drag: size and hardness" +
            (o.mask ? " · Alt: erase · V: view" : ""),
      onClose: () => {
        root.append(bar, cv);
        cv.style.flex = ""; cv.style.minHeight = ""; cv.style.aspectRatio = `${L.width}/${L.height}`;
        root.style.height = "";
        zoom = 1; panX = panY = 0;
        mounted.resizeToContent(); scheduleDraw();
      },
    });
    cv.style.aspectRatio = "auto"; cv.style.flex = "1"; cv.style.minHeight = "0";
    holder.append(bar, cv);
    m.body.appendChild(holder);
    m.addPrimary("Done");
    zoom = 1; panX = panY = 0;
    requestAnimationFrame(draw);
  }

  // ── layer sizing ──
  function targetSize(): [number, number] {
    if (base) return capSize(base.fullW, base.fullH);
    return capSize(Number(widthW?.value) || 1024, Number(heightW?.value) || 1024);
  }
  function ensureLayerSize(): void {
    const [w, h] = targetSize();
    if (L.width === w && L.height === h) return;
    L.resize(w, h);
    if (cv.parentElement === root) cv.style.aspectRatio = `${w}/${h}`;
    zoom = 1; panX = panY = 0;
    mounted?.resizeToContent();
    scheduleDraw();
  }

  // ── view maths ──
  function view() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const fit = Math.min(W / L.width, H / L.height);
    const s = fit * zoom;
    return { W, H, s, ox: (W - L.width * s) / 2 + panX, oy: (H - L.height * s) / 2 + panY };
  }
  function eventDisp(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * (cv.clientWidth / r.width), (e.clientY - r.top) * (cv.clientHeight / r.height)];
  }
  function dispToLayer(px: number, py: number): [number, number] {
    const v = view();
    return [(px - v.ox) / v.s, (py - v.oy) / v.s];
  }

  // ── mask display ──
  // The mask as the node will output it: the layer, combined with the upstream mask the
  // same way execute() does for Add / Subtract / Intersect.
  const mc = mkCanvas(1, 1), dc = mkCanvas(1, 1);
  const COMBINE: Record<string, GlobalCompositeOperation> =
    { Add: "source-over", Subtract: "destination-out", Intersect: "destination-in" };
  function maskComposite(): HTMLCanvasElement {
    for (const c of [mc, dc]) if (c.width !== L.width || c.height !== L.height) { c.width = L.width; c.height = L.height; }
    const x = mc.getContext("2d")!;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, L.width, L.height);
    x.drawImage(L.current(), 0, 0);
    const op = COMBINE[String(modeW?.value)];
    if (upstream && op) {
      x.globalCompositeOperation = op;
      x.drawImage(upstream, 0, 0, L.width, L.height);
      x.globalCompositeOperation = "source-over";
    }
    return mc;
  }
  function tint(c: HTMLCanvasElement, color: string) {
    const x = c.getContext("2d")!;
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "source-over";
  }
  function drawMask(ox: number, oy: number, lw: number, lh: number) {
    const mode: MaskView = P.nkdMaskView;
    if (maskHidden) { if (base) ctx.drawImage(base.el, ox, oy, lw, lh); return; }
    const m = maskComposite();
    if (mode === "mask") {
      ctx.fillStyle = "#000"; ctx.fillRect(ox, oy, lw, lh);
      tint(m, "#ffffff"); ctx.drawImage(m, ox, oy, lw, lh);
      return;
    }
    if (base) ctx.drawImage(base.el, ox, oy, lw, lh);
    if (mode === "overlay") {
      tint(m, MASK_TINT);
      ctx.globalAlpha = 0.55; ctx.drawImage(m, ox, oy, lw, lh); ctx.globalAlpha = 1;
    } else if (mode === "dim") {
      const x = dc.getContext("2d")!;
      x.globalCompositeOperation = "source-over";
      x.clearRect(0, 0, dc.width, dc.height);
      x.fillStyle = "rgba(0,0,0,0.75)"; x.fillRect(0, 0, dc.width, dc.height);
      x.globalCompositeOperation = "destination-out"; x.drawImage(m, 0, 0);
      x.globalCompositeOperation = "source-over";
      ctx.drawImage(dc, ox, oy, lw, lh);
    }
  }

  // ── drawing ──
  let raf = 0;
  const scheduleDraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  let hover: [number, number] | null = null;   // display px of the pointer, for the cursor ring
  // Alt held = eyedropper (Paint only): swap the ring for a pipette cursor so the gesture
  // reads before the click. Tracked from both the keyboard and the pointer's own modifier
  // state, since Alt can go down while the pointer is elsewhere.
  let altHeld = false;
  const PIPETTE = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z" fill="none" stroke="black" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M13 8l3 3 4-4-3-3z" fill="black" stroke="white" stroke-width="1"/></svg>') + '") 2 22, crosshair';
  function setAlt(on: boolean) {
    if (altHeld === on) return;
    altHeld = on;
    syncToolbar();
    scheduleDraw();
  }
  let sizePreview: number | null = null;       // brush size while Alt+right-dragging
  let hardPreview: number | null = null;       // hardness while Alt+right-dragging

  function draw() {
    const { W, H, s, ox, oy } = view();
    if (W < 1 || H < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111318"; ctx.fillRect(0, 0, W, H);
    const lw = L.width * s, lh = L.height * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, lw, lh); ctx.clip();
    ctx.fillStyle = checker(ctx); ctx.fillRect(ox, oy, lw, lh);
    ctx.imageSmoothingEnabled = s < 3;
    if (o.mask) {
      drawMask(ox, oy, lw, lh);
    } else {
      if (base) {
        ctx.globalAlpha = P.nkdPaintBase;
        ctx.drawImage(base.el, ox, oy, lw, lh);
        ctx.globalAlpha = 1;
      } else if (bgW?.value) {
        ctx.fillStyle = String(bgW.value); ctx.fillRect(ox, oy, lw, lh);
      }
      ctx.drawImage(L.current(), ox, oy, lw, lh);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, lw - 1, lh - 1);
    if (lasso) drawLasso(s, ox, oy);
    else if (hover && !panning && !P.nkdPaintLasso && (o.mask || !altHeld || sizeDrag)) {
      const r = Math.max(1.5, ((sizePreview ?? P.nkdPaintSize) * s) / 2);
      ctx.beginPath(); ctx.arc(hover[0], hover[1], r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1; ctx.stroke();
      const hard = hardPreview ?? P.nkdPaintHardness;
      if (hard < 0.99) {   // inner ring = where the dab stops being solid, always shown
        ctx.beginPath(); ctx.arc(hover[0], hover[1], Math.max(0.5, r * hard), 0, Math.PI * 2);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  // ── lasso ──
  // A press on empty starts it. Dragging adds a freehand run, a press without moving drops a
  // corner. A lasso started by a drag closes when that drag ends (freehand); otherwise it
  // closes on the first point, a double-click or Enter. Esc drops it.
  let lasso: Array<[number, number]> | null = null;
  let lassoDrag: { startedHere: boolean; moved: boolean; last: [number, number] } | null = null;
  let lassoErase = false;

  function drawLasso(s: number, ox: number, oy: number) {
    if (!lasso) return;
    const pts = lasso.map(([x, y]) => [x * s + ox, y * s + oy] as [number, number]);
    if (hover && !lassoDrag) pts.push(hover);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = lassoErase || eraserOn() ? "rgba(255,80,80,0.18)" : "rgba(74,180,255,0.18)";
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
  }
  const eraserOn = () => tool() === "eraser";
  function closeLasso(alt: boolean) {
    if (!lasso) return;
    const pts = lasso; lasso = null; lassoDrag = null;
    eraseNow = lassoErase || (o.mask && alt);
    L.fill(pts, P.nkdPaintSize / 2);
    eraseNow = false; lassoErase = false;
    scheduleDraw();
  }
  function nearFirst(px: number, py: number): boolean {
    if (!lasso || lasso.length < 3) return false;
    const v = view();
    return Math.hypot(lasso[0][0] * v.s + v.ox - px, lasso[0][1] * v.s + v.oy - py) <= LASSO_SNAP;
  }

  // ── input state (the brush itself is brush.ts) ──
  let panning = false, picking = false;
  let sizeDrag: { x0: number; y0: number; size0: number; hard0: number } | null = null;
  let panDrag: { x0: number; y0: number; px: number; py: number } | null = null;
  let spaceHeld = false;

  function pick(px: number, py: number) {
    const [lx, ly] = dispToLayer(px, py);
    if (lx < 0 || ly < 0 || lx >= L.width || ly >= L.height) return;
    const c = mkCanvas(1, 1), x = c.getContext("2d")!;
    if (base) x.drawImage(base.el, lx * base.w / L.width, ly * base.h / L.height, 1, 1, 0, 0, 1, 1);
    else if (bgW?.value) { x.fillStyle = String(bgW.value); x.fillRect(0, 0, 1, 1); }
    x.drawImage(L.layer, lx | 0, ly | 0, 1, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return;
    setColor(toHex(d[0], d[1], d[2]));
  }

  // ── pointer ──
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("pointerenter", () => { hover = null; hovering = true; });
  cv.addEventListener("pointerleave", () => { hovering = false; hover = null; scheduleDraw(); });
  const onDown = (e: PointerEvent) => {
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
    if (!o.mask && e.altKey && e.button === 0) { picking = true; pick(px, py); return; }
    if (e.button !== 0 && e.button !== 2) return;
    // Right button erases, like the native mask editor; in Mask Painter Alt does too.
    const erase = e.button === 2 || (o.mask && e.altKey);
    const pt = dispToLayer(px, py);
    if (P.nkdPaintLasso) {
      if (nearFirst(px, py)) { closeLasso(erase); return; }
      const startedHere = !lasso;
      if (startedHere) { lasso = [pt]; lassoErase = erase; }
      else lasso!.push(pt);
      lassoDrag = { startedHere, moved: false, last: [px, py] };
      scheduleDraw(); return;
    }
    eraseNow = erase;
    L.begin(pt[0], pt[1], radiusFor(P.nkdPaintSize, e));
    scheduleDraw();
  };
  cv.addEventListener("pointerdown", onDown);
  (cv as any)._nkdAltDown = onDown;
  cv.addEventListener("pointermove", (e) => {
    e.stopPropagation();
    const [px, py] = eventDisp(e);
    hover = [px, py];
    setAlt(e.altKey);
    if (panning && panDrag) {
      panX = panDrag.px + (px - panDrag.x0); panY = panDrag.py + (py - panDrag.y0);
    } else if (sizeDrag) {
      const a = adjustBrush(sizeDrag.size0, sizeDrag.hard0, px - sizeDrag.x0, py - sizeDrag.y0, view().s);
      sizePreview = a.size; hardPreview = a.hardness;
      // The sliders follow the drag live; the values are committed on release (below).
      sizeInp.value = String(sizePreview); hardInp.value = hardPreview.toFixed(2);
    } else if (picking) {
      pick(px, py);
    } else if (lasso && lassoDrag) {
      if (Math.hypot(px - lassoDrag.last[0], py - lassoDrag.last[1]) >= 2) {
        lasso.push(dispToLayer(px, py)); lassoDrag.last = [px, py]; lassoDrag.moved = true;
      }
    } else if (L.stroking) {
      const [lx, ly] = dispToLayer(px, py);
      L.to(lx, ly, radiusFor(P.nkdPaintSize, e));
    }
    scheduleDraw();
  });
  const endPointer = (e: PointerEvent) => {
    e.stopPropagation();
    L.end();
    eraseNow = false;
    if (lasso && lassoDrag) {
      const freehand = lassoDrag.startedHere && lassoDrag.moved;
      lassoDrag = null;
      if (freehand) closeLasso(e.button === 2 || e.altKey);
    }
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
  // The second click of the double-click already dropped a corner; closing drops nothing more.
  cv.addEventListener("dblclick", (e) => { e.stopPropagation(); if (lasso) closeLasso(e.altKey); });

  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const [px, py] = eventDisp(e);
    const before = view();
    const [lx, ly] = [(px - before.ox) / before.s, (py - before.oy) / before.s];
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = view();  // recomputed with the new zoom, current pan
    // keep the layer point under the cursor where it is
    const ox = px - lx * after.s, oy = py - ly * after.s;
    panX = ox - (after.W - L.width * after.s) / 2;
    panY = oy - (after.H - L.height * after.s) / 2;
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
    if (lasso && (k === "Escape" || k === "Enter")) {
      if (k === "Enter") closeLasso(altHeld); else { lasso = null; lassoDrag = null; scheduleDraw(); }
      e.preventDefault(); e.stopImmediatePropagation(); return;   // Esc must not close the modal
    }
    if (k === " ") { spaceHeld = true; e.preventDefault(); e.stopPropagation(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) {
      if (e.shiftKey) L.redo(); else L.undo();
      e.preventDefault(); e.stopPropagation(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (k === "y" || k === "Y")) { L.redo(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = true;
    switch (k) {
      case "b": case "B": P.nkdPaintTool = "brush"; break;
      case "e": case "E": P.nkdPaintTool = "eraser"; break;
      case "l": case "L": P.nkdPaintLasso = !P.nkdPaintLasso; lasso = null; break;
      case "v": case "V": if (o.mask) cycleView(e.shiftKey); else handled = false; break;
      case "x": case "X": if (!o.mask) setColor(P.nkdPaintColor.toLowerCase() === "#ffffff" ? "#000000" : "#ffffff"); else handled = false; break;
      case "[": P.nkdPaintSize = stepSize(P.nkdPaintSize, -1); break;
      case "]": P.nkdPaintSize = stepSize(P.nkdPaintSize, 1); break;
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
  const onBlur = () => { spaceHeld = false; setAlt(false); };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);

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
      const blob: Blob | null = await new Promise((r) => L.layer.toBlob(r, "image/png"));
      if (!blob) return;
      const name = await sha1Name(blob, o.prefix);
      const fd = new FormData();
      fd.append("image", blob, name);
      fd.append("subfolder", o.subfolder);
      fd.append("overwrite", "true");
      const res = await api.fetchApi("/upload/image", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      const d = await res.json();
      setLayerValue(`${d.subfolder ? d.subfolder + "/" : ""}${d.name}`);
    } catch (err) {
      console.warn("[NKD Paint] layer upload failed", err);
      comfyApp.extensionManager?.toast?.add?.({ severity: "warn", summary: o.title.replace("😺 ", "NKD "),
        detail: "Could not upload the painted layer.", life: 5000 });
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; scheduleSave(); }
    }
  }
  function loadLayer(v: string) {
    if (!v) {
      L.layer.getContext("2d")!.clearRect(0, 0, L.width, L.height);
      L.hasStrokes = false; scheduleDraw(); return;
    }
    // A Mask Painter workflow from before the on-node editor: its mask is the old backup
    // (white = masked). Shown here; the node migrates it to a layer file on its next run.
    const legacy = o.mask && v.startsWith("$");
    const m = /^(.*?)\s*\[(\w+)\]$/.exec(v);
    const clean = legacy ? `${o.subfolder}/${String(node.id).replace(/:/g, "_")}_mask.png` : m ? m[1] : v;
    const cut = clean.lastIndexOf("/");
    const ref: MediaRef = { filename: cut >= 0 ? clean.slice(cut + 1) : clean,
                            subfolder: cut >= 0 ? clean.slice(0, cut) : "", type: m && !legacy ? m[2] : "input" };
    const img = new Image();
    img.onload = () => {
      // No base yet and the file knows its own size: adopt it, so a reload doesn't resample.
      if (!base && (L.width !== img.naturalWidth || L.height !== img.naturalHeight)
          && !imageLinked()) {
        const [w, h] = capSize(img.naturalWidth, img.naturalHeight);
        L.resize(w, h, false);
        cv.style.aspectRatio = `${w}/${h}`;
        mounted?.resizeToContent();
      }
      L.load(legacy ? greyToAlpha(img, img.naturalWidth, img.naturalHeight) : img);
      scheduleDraw();
    };
    img.src = viewUrl(ref);
  }

  // ── base image ──
  const imageLinked = () => node.inputs?.find((i: any) => i.name === o.input)?.link != null;
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
  const directRef = () => resolveSource(node, o.input, 0);
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
    const far = resolveSource(node, o.input);
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
  wrapCallback(modeW, scheduleDraw);

  // ── mount ──
  const mounted = mountDomWidget(node, {
    name: "nkd_paint_editor", type: "NKD_PAINT", root,
    minWidth: 120, minWidthOf: barMinWidth,
    estimate: () => (bar.offsetHeight || 60) + Math.round(CANVAS_W * L.height / L.width),
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
    if (o.mask && node.inputs?.find((i: any) => i.name === "mask")?.link == null && upstream) {
      upstream = null; scheduleDraw();
    }
  };
  const refreshPoll = window.setInterval(refreshSource, 500);

  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    clearInterval(refreshPoll);
    cvObserver.disconnect();
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    live.delete(String(node.id));
    detachFine();
    mounted.release();
    origRemoved?.apply(this, args);
  };

  // Dev handle: the layer is otherwise unreachable from the console.
  node.__nkdPaint = { layer: () => L.layer, hasStrokes: () => L.hasStrokes, base: () => base, draw };

  syncToolbar();
  requestAnimationFrame(() => { syncDims(); refreshSource(); ensureLayerSize(); draw(); });

  return {
    L, row1,
    adopt: (v: string) => { clearTimeout(saveTimer); setLayerValue(v); loadLayer(v); },
    setUpstream: (c) => { upstream = c; scheduleDraw(); },
    upstream: () => upstream,
    redraw: scheduleDraw,
  };
}
