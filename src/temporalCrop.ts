/**
 * 😺NKD Temporal Crop - a small timeline to mark the moments to redraw.
 *
 * The clip itself only exists after the node has run (the backend sends a contact sheet of
 * its frames and the soundtrack's peaks), so the first run with nothing marked is a cheap
 * pass-through that fills the timeline; the spans drawn here are written back to the hidden
 * `spans` widget as plain text ("30-45, 90-110"), the same thing a user could type.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { findW, hideWidget, mountDomWidget } from "./domHost";
import { viewUrl } from "./mediaProbe";

const NODE_NAME = "NKDTemporalCrop";
const EXT_NAME = "NKD.BasicTools.TemporalCrop";

const PREVIEW_H = 150;
const GAP = 6;
const STRIP_H = 56;
const WAVE_H = 30;
const CANVAS_H = PREVIEW_H + GAP + STRIP_H + WAVE_H;
const EDGE_PX = 6;
/** Past this the slowed clip leaves the range video models are trained on. */
const LONG_SECONDS = 15;

const C = {
  bg: "#111318", band: "#1a1c22", wave: "rgba(200,208,224,0.55)",
  span: "rgba(74,180,255,0.22)", spanEdge: "#4ab4ff", ctx: "rgba(74,180,255,0.07)",
  hover: "#ffd166", active: "#ff6b6b", text: "#c8d0e0", dim: "rgba(255,255,255,0.45)",
  warn: "#ffb066",
} as const;

type Span = [number, number];   // inclusive frames

interface Preview {
  filename: string; subfolder: string; type: string;
  tiles: number; cols: number; tile_w: number; tile_h: number;
  frames: number; fps: number; token: number; peaks: number[]; slowed: number;
}

export function parseSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of (text || "").matchAll(/(\d+)\s*-\s*(\d+)/g)) {
    const a = Number(m[1]), b = Number(m[2]);
    out.push([Math.min(a, b), Math.max(a, b)]);
  }
  return normalize(out);
}

export const formatSpans = (spans: Span[]): string => spans.map(([a, b]) => `${a}-${b}`).join(", ");

/** Sorted, overlapping or touching spans merged. */
export function normalize(spans: Span[]): Span[] {
  const s = spans.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as Span).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const sp of s) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1] + 1) last[1] = Math.max(last[1], sp[1]);
    else out.push([sp[0], sp[1]]);
  }
  return out;
}

/** Rough length of the slowed clip, same rule as the backend: every drawing gets a token,
 *  context frames play at normal speed. Ignores the few alignment frames, hence the "≈". */
export function estimateSlowed(spans: Span[], frames: number, every: number, context: number, token: number): number {
  const segs: Span[] = normalize(spans.map(([a, b]) => [Math.max(0, a - context), Math.min(frames - 1, b + context)]));
  let total = 0;
  for (const [s0, s1] of segs) {
    let hot = 0;
    for (const [a, b] of spans) hot += Math.max(0, Math.min(b, s1) - Math.max(a, s0) + 1);
    total += (s1 - s0 + 1 - hot) + Math.ceil(hot / every) * token;
  }
  return total;
}

class TimelineView {
  root = document.createElement("div");
  canvas = document.createElement("canvas");
  info = document.createElement("div");
  spans: Span[] = [];
  preview: Preview | null = null;
  sheet: HTMLImageElement | null = null;
  hover = -1;
  private drag: { mode: "create" | "a" | "b" | "move"; index: number; anchor: number; offset: number } | null = null;
  private ro: ResizeObserver;

  constructor(private settings: () => { every: number; context: number }, private commit: (s: Span[]) => void) {
    this.root.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";
    this.canvas.style.cssText = `width:100%;height:${CANVAS_H}px;display:block;border-radius:4px;cursor:crosshair;`;
    this.info.style.cssText = `font:11px sans-serif;color:${C.dim};padding:0 2px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    this.root.append(this.canvas, this.info);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointerleave", () => { if (!this.drag) { this.hover = -1; this.draw(); } });
    this.canvas.addEventListener("contextmenu", this.onContext);
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
  }

  release(): void { this.ro.disconnect(); }

  setPreview(p: Preview): void {
    this.preview = p;
    const img = new Image();
    img.onload = () => { this.sheet = img; this.draw(); };
    img.src = viewUrl(p);
    this.draw();
  }

  private get width(): number { return this.canvas.offsetWidth || 1; }

  /** Pointer -> canvas px, undoing LiteGraph's zoom (getBoundingClientRect includes it). */
  private local(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.offsetWidth / (r.width || 1);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  private frameAt(x: number): number {
    const n = this.preview?.frames ?? 1;
    return Math.max(0, Math.min(n - 1, Math.floor((x / this.width) * n)));
  }

  private xOf(frame: number): number { return (frame / (this.preview?.frames ?? 1)) * this.width; }

  private hit(x: number): { index: number; part: "a" | "b" | "move" } | null {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const [a, b] = this.spans[i];
      const xa = this.xOf(a), xb = this.xOf(b + 1);
      if (Math.abs(x - xa) <= EDGE_PX) return { index: i, part: "a" };
      if (Math.abs(x - xb) <= EDGE_PX) return { index: i, part: "b" };
      if (x > xa && x < xb) return { index: i, part: "move" };
    }
    return null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.preview || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const { x, y } = this.local(e);
    if (y < PREVIEW_H) return;
    const f = this.frameAt(x);
    const h = this.hit(x);
    if (h) {
      this.drag = { mode: h.part, index: h.index, anchor: f, offset: f - this.spans[h.index][0] };
    } else {
      this.spans.push([f, f]);
      this.drag = { mode: "create", index: this.spans.length - 1, anchor: f, offset: 0 };
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.draw();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.preview) return;
    e.stopPropagation();
    const { x, y } = this.local(e);
    const f = this.frameAt(x);
    this.hover = f;
    const d = this.drag;
    if (d) {
      const sp = this.spans[d.index];
      const last = this.preview.frames - 1;
      if (d.mode === "create") { sp[0] = Math.min(d.anchor, f); sp[1] = Math.max(d.anchor, f); }
      else if (d.mode === "a") { sp[0] = Math.min(f, sp[1]); }
      else if (d.mode === "b") { sp[1] = Math.max(f, sp[0]); }
      else {
        const len = sp[1] - sp[0];
        sp[0] = Math.max(0, Math.min(last - len, f - d.offset));
        sp[1] = sp[0] + len;
      }
    } else {
      const h = y >= PREVIEW_H ? this.hit(x) : null;
      this.canvas.style.cursor = !h ? "crosshair" : h.part === "move" ? "grab" : "ew-resize";
    }
    this.draw();
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drag) return;
    e.stopPropagation();
    this.drag = null;
    this.spans = normalize(this.spans);
    this.commit(this.spans);
    this.draw();
  };

  private onContext = (e: MouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    const { x, y } = this.local(e);
    const h = y >= PREVIEW_H ? this.hit(x) : null;
    if (!h) return;
    this.spans.splice(h.index, 1);
    this.commit(this.spans);
    this.draw();
  };

  /** One frame of the contact sheet into a box, cropped to keep its aspect. */
  private tile(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number, w: number, h: number): void {
    const p = this.preview, img = this.sheet;
    if (!p || !img) return;
    const t = Math.max(0, Math.min(p.tiles - 1, Math.round((frame / Math.max(1, p.frames - 1)) * (p.tiles - 1))));
    const sx = (t % p.cols) * p.tile_w, sy = Math.floor(t / p.cols) * p.tile_h;
    const want = (w / h) * p.tile_h;
    const sw = Math.min(p.tile_w, want);
    ctx.drawImage(img, sx + (p.tile_w - sw) / 2, sy, sw, p.tile_h, x, y, w, h);
  }

  draw(): void {
    const W = this.width;
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(W * dpr)) this.canvas.width = Math.round(W * dpr);
    if (this.canvas.height !== Math.round(CANVAS_H * dpr)) this.canvas.height = Math.round(CANVAS_H * dpr);
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, CANVAS_H);
    const p = this.preview;
    this.updateInfo();
    if (!p) {
      ctx.fillStyle = C.dim;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Run once to see the clip here", W / 2, CANVAS_H / 2);
      ctx.textAlign = "left";
      return;
    }
    const y0 = PREVIEW_H + GAP, y1 = y0 + STRIP_H;

    // big frame: the hovered one, else the start of the first span
    const shown = this.hover >= 0 ? this.hover : this.spans[0]?.[0] ?? 0;
    const ph = PREVIEW_H, pw = Math.min(W, ph * (p.tile_w / p.tile_h));
    this.tile(ctx, shown, (W - pw) / 2, 0, pw, ph);
    ctx.fillStyle = C.text;
    ctx.font = "11px sans-serif";
    ctx.fillText(`frame ${shown} · ${(shown / p.fps).toFixed(2)} s`, 6, 14);

    // strip of thumbnails
    ctx.fillStyle = C.band;
    ctx.fillRect(0, y0, W, STRIP_H + WAVE_H);
    const thumbW = STRIP_H * (p.tile_w / p.tile_h);
    const count = Math.max(1, Math.floor(W / thumbW));
    for (let k = 0; k < count; k++) {
      const x = (k * W) / count, w = W / count;
      this.tile(ctx, Math.floor(((k + 0.5) / count) * p.frames), x, y0, w - 1, STRIP_H);
    }

    // soundtrack
    if (p.peaks.length) {
      ctx.fillStyle = C.wave;
      const mid = y1 + WAVE_H / 2;
      const bw = W / p.peaks.length;
      p.peaks.forEach((v, i) => {
        const h = Math.max(1, v * (WAVE_H - 4));
        ctx.fillRect(i * bw, mid - h / 2, Math.max(1, bw - 0.5), h);
      });
    }

    // spans, with the context frames around them
    const { context } = this.settings();
    for (const [a, b] of this.spans) {
      const xa = this.xOf(a), xb = this.xOf(b + 1);
      ctx.fillStyle = C.ctx;
      ctx.fillRect(this.xOf(Math.max(0, a - context)), y0, this.xOf(Math.min(p.frames, b + 1 + context)) - this.xOf(Math.max(0, a - context)), STRIP_H + WAVE_H);
      ctx.fillStyle = C.span;
      ctx.fillRect(xa, y0, xb - xa, STRIP_H + WAVE_H);
      ctx.fillStyle = this.drag ? C.active : C.spanEdge;
      ctx.fillRect(xa, y0, 2, STRIP_H + WAVE_H);
      ctx.fillRect(xb - 2, y0, 2, STRIP_H + WAVE_H);
      ctx.fillStyle = C.text;
      ctx.fillText(`${a}–${b}`, xa + 4, y0 + 12);
    }

    if (this.hover >= 0) {
      ctx.fillStyle = C.hover;
      ctx.fillRect(this.xOf(this.hover), y0, 1, STRIP_H + WAVE_H);
    }
  }

  private updateInfo(): void {
    const p = this.preview;
    if (!p) { this.info.textContent = "Drag on the strip to mark a moment · drag its edges to adjust · right click to remove"; return; }
    if (!this.spans.length) {
      this.info.style.color = C.dim;
      this.info.textContent = `${p.frames} frames · drag on the strip to mark the moments to redraw`;
      return;
    }
    const { every, context } = this.settings();
    const slowed = estimateSlowed(this.spans, p.frames, every, context, p.token);
    const secs = slowed / p.fps;
    this.info.style.color = secs > LONG_SECONDS ? C.warn : C.dim;
    this.info.textContent = `${this.spans.length} moment${this.spans.length > 1 ? "s" : ""} · ` +
      `slowed clip ≈ ${slowed} frames (${secs.toFixed(1)} s)` +
      (secs > LONG_SECONDS ? " · long: mark less, or use Drawings 2" : "") +
      " · right click a moment to remove it";
  }
}

export function registerTemporalCrop(): void {
  comfyApp.registerExtension({
    name: EXT_NAME,
    onNodeOutputsUpdated(outputs: Record<string, any>) {
      for (const [id, out] of Object.entries(outputs)) {
        const p = out?.nkd_tcrop?.[0];
        if (p && !id.includes(":")) comfyApp.rootGraph?.getNodeById(id)?.__nkdTimeline?.setPreview(p);
      }
    },
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdTemporalWrapped) return;
      nodeType.prototype.__nkdTemporalWrapped = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setup(this);
        return r;
      };
      const origExecuted = nodeType.prototype.onExecuted;
      nodeType.prototype.onExecuted = function (this: any, output: any) {
        origExecuted?.apply(this, arguments);
        const p = output?.nkd_tcrop?.[0];
        if (p) this.__nkdTimeline?.setPreview(p);
      };
    },
  });
}

function setup(node: any): void {
  const spansW = findW(node, "spans");
  if (!spansW) return;
  hideWidget(spansW);
  const num = (name: string, d: number) => Number(findW(node, name)?.value ?? d) || d;
  const view = new TimelineView(
    () => ({ every: num("every", 1), context: num("context", 12) }),
    (spans) => {
      spansW.value = formatSpans(spans);
      comfyApp.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.();
    },
  );
  node.__nkdTimeline = view;
  for (const name of ["every", "context"]) {
    const w = findW(node, name);
    if (!w) continue;
    const cb = w.callback;
    w.callback = function (this: any) { const r = cb?.apply(this, arguments); view.draw(); return r; };
  }

  const mounted = mountDomWidget(node, {
    name: "timeline", type: "NKD_TEMPORAL_TIMELINE", root: view.root, minWidth: 360,
    estimate: () => CANVAS_H + 22,
    onResize: () => view.draw(),
  });
  const load = () => { view.spans = parseSpans(String(spansW.value ?? "")); view.draw(); };
  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any) { const r = origConfigure?.apply(this, arguments); load(); return r; };
  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any) {
    view.release();
    mounted.release();
    return origRemoved?.apply(this, arguments);
  };
  load();
  requestAnimationFrame(() => mounted.resizeToContent());
}
