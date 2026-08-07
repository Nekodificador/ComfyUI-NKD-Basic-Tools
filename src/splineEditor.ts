/**
 * 😺NKD spline editor — draw over an image, on a canvas.
 *
 * One editor for three nodes, because they are the same gesture with different
 * output: closed shapes for Vector Mask, open strokes for Path Blur, bare points
 * for Field Blur.
 *
 * It serializes the control points *and* the flattened polyline. The points are
 * what stays editable; the polyline is what Python reads. See `splineEval` for
 * why the curve maths does not cross the language boundary.
 *
 * Vanilla DOM and canvas, no Vue: this mounts into the shared `nkd_modal` shell,
 * which is itself framework-agnostic so hand-written extensions can use it too.
 */
import { flatten, flattenP, flattenFeathered, sampleAttr, rampOffsets, bezierSegments, insertionIndex, MIN_W, MAX_W, type Pt, type SplinePoint, type SplineType } from "./splineEval";
import { drawRing, hitDot, hitRing, startScrub } from "./arcGizmo";
import { FieldPreview } from "./fieldPreview";

export type EditorMode = "shape" | "path" | "pin";

export type Shape = {
  type: SplineType;
  op: "add" | "sub";
  closed: boolean;
  feather: number;
  speed: number;
  pts: SplinePoint[];
};

/** `r` is the pin's reach, normalized. `DEFAULT_INFLUENCE` is the neutral value
 *  — a field of pins all at the default behaves exactly as it did before pins
 *  had a reach at all. */
export type Pin = { x: number; y: number; blur: number; r: number };
export const DEFAULT_INFLUENCE = 0.25;

const C = {
  bg: "#0b0d12",
  add: "#4ab4ff",
  sub: "#ff6b6b",
  path: "#4ab4ff",
  idle: "rgba(255,255,255,0.45)",
  pt: "#4ab4ff",
  ptHover: "#ffd166",
  ptActive: "#ff6b6b",
  handle: "rgba(255,209,102,0.85)",
  ptStroke: "rgba(0,0,0,0.65)",
  hull: "rgba(255,255,255,0.28)",
  // The Fusion convention: the softness guide is a second, green, dashed
  // outline, so it never reads as another shape you might have drawn.
  soft: "#7bd94f",
  softDim: "rgba(123,217,79,0.45)",
  marquee: "#4ab4ff",
} as const;

// Matches the NKD Sigmas Curve editor.
const HIT = 10;
const PT_R = { idle: 4.5, hover: 6, active: 7 } as const;
const HANDLE_HIT = 7;
/** Smaller than a control point: a clone dragged close to its own point must not
 *  make that point impossible to grab. */
const CLONE_HIT = 8;
const UNDO_DEPTH = 30;
const MIN_PTS = { shape: 3, path: 2 } as const;
/** A marquee smaller than this was a click: it clears rather than selects. */
const MARQUEE_MIN = 4;
/** One ring per pixel of feather, so no two levels of the gradient ever share a
 *  pixel and there is nothing to band. Capped where a very soft edge stops
 *  paying for more. */
const RAMP_PX_PER_RING = 1;
const RAMP_RINGS = { min: 2, max: 64 } as const;
/** Ceiling on the screen-space matte, so a fullscreen editor on a HiDPI display
 *  does not quietly turn every fill into an 8 Mpx one. */
const MATTE_MAX_PX = 3.5e6;
/** Ring ceiling while a drag is in flight: responsiveness now, quality on the
 *  frame after the mouse comes up. */
const DRAG_RINGS = 8;

/** How many rings a feather that wide needs. Shared with `blur_core.ramp_rings`
 *  so the preview bands where the render bands, or it is not a preview. */
export const rampRings = (maxPx: number): number =>
  Math.max(RAMP_RINGS.min,
           Math.min(RAMP_RINGS.max, Math.round(maxPx / RAMP_PX_PER_RING)));

type Drag =
  | null
  /** `group` is the box selection as [shape, point] pairs; every one of them
   *  takes the same delta as the grabbed point. */
  | { kind: "pt"; s: number; i: number; dx: number; dy: number;
      group?: Array<[number, number]> }
  | { kind: "handle"; s: number; i: number; side: 0 | 2 }
  | { kind: "pin"; i: number; dx: number; dy: number;
      group?: Array<[number, number]> }
  | { kind: "scrub"; apply: (y: number, fine: boolean) => void }
  /** Ctrl-drag: the point's own softness / speed / reach, from the cursor
   *  distance. Applies to the whole selection when the point is in one. */
  | { kind: "radius"; s: number; i: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "pan"; x: number; y: number };

export type EditorOptions = {
  mode: EditorMode;
  /** Called when an edit settles — the end of a drag, not during one. */
  onEdit: (json: string) => void;
  /** Called whenever the selection or shape list changes, so the bar can redraw. */
  onState?: () => void;
};

/** How the backdrop is shown while editing. */
export type ViewMode = "source" | "result" | "matte" | "field";

export class SplineEditor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;

  private mode: EditorMode;
  private onEdit: EditorOptions["onEdit"];
  private onState?: () => void;

  private image: CanvasImageSource | null = null;
  private imgW = 1;
  private imgH = 1;

  shapes: Shape[] = [];
  pins: Pin[] = [];
  /** Index of the shape being drawn into / edited. -1 for none. */
  active = -1;
  private selPt = -1;
  /** Box selection, as "shape,point" keys ("pin,i" in pin mode). Moves, deletes
   *  and Ctrl-drags apply to the whole set. Same model as the Color Warp grid. */
  private sel = new Set<string>();
  private hover: { s: number; i: number; handle: 0 | 2 | -1 } | null = null;
  private hoverClone: { s: number; i: number } | null = null;

  /** Defaults the toolbar writes and new shapes inherit. */
  newType: SplineType = "bezier";
  newOp: "add" | "sub" = "add";
  showFill = true;
  /** Draw the vectors at all. Off leaves the backdrop — the matte, the blurred
   *  result — with nothing on top of it, which is the only way to judge an edge
   *  that has a control point sitting on it. Editing still works while hidden. */
  showCurves = true;
  view: ViewMode = "result";
  /** Backend-rendered result for the blur modes; null until one arrives. */
  preview: CanvasImageSource | null = null;
  /** The node's own settings, so the pin gizmos can show real pixels and the
   *  live shader can match what the graph will do. */
  maxBlur = 48;
  falloff = 2;
  /** Path Blur's Strength, so a per-point speed can be drawn as the distance
   *  that pixel will actually travel rather than as a bare multiplier. */
  strength = 24;
  /** GPU guide for pin mode. Drives the canvas between backend results. */
  private live: FieldPreview | null = null;
  /** Offscreen matte for shape mode, at screen resolution. `matteKey` is what it
   *  was built from, so it is rebuilt only when that actually changes. */
  private matte: HTMLCanvasElement | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private matteKey = "";

  /** Bumped whenever any geometry changes, which is what invalidates the cached
   *  flattening below. Every mutation goes through `emit`, so one counter there
   *  covers all of them. */
  private geomRev = 0;
  private geomCache = new WeakMap<Shape, {
    rev: number; tol: number; poly: Pt[]; us: number[]; off: Pt[] | null;
  }>();

  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private fit = 1;

  private drag: Drag = null;
  private undo: string[] = [];

  constructor(opts: EditorOptions) {
    this.mode = opts.mode;
    // Roto is B-spline work: fewer points, no handles, and it cannot overshoot.
    if (opts.mode === "shape") this.newType = "bspline";
    this.onEdit = opts.onEdit;
    this.onState = opts.onState;

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:crosshair";
    this.ctx = this.canvas.getContext("2d")!;

    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("dblclick", this.onDblClick);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey, true);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  destroy(): void {
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey, true);
    this.destroyLive();
  }

  /* ── View ──────────────────────────────────────────────────────────────── */

  setImage(img: CanvasImageSource | null, w: number, h: number): void {
    this.image = img;
    this.imgW = Math.max(1, w);
    this.imgH = Math.max(1, h);
    this.preview = null;                       // the old result is not this frame
    // A new backdrop can be a different size, and the feather offsets are in
    // image pixels — so the cached flattening is stale, not just the matte.
    this.geomRev++;
    this.matteKey = "";
    if (this.mode === "pin" && img) {
      if (!this.live) this.live = new FieldPreview();
      this.live.setImage(img, this.imgW, this.imgH);
    }
    this.fitView();
  }

  destroyLive(): void {
    this.live?.destroy();
    this.live = null;
  }

  get aspect(): number {
    return this.imgW / this.imgH;
  }

  /** The backdrop as a base64 PNG, for the backend preview to work on when it
   *  has no cached frame of its own. Null if there is nothing to send. */
  sourceFrame(maxSide = 640): string | null {
    if (!this.image) return null;
    const scale = Math.min(1, maxSide / Math.max(this.imgW, this.imgH));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(this.imgW * scale));
    c.height = Math.max(1, Math.round(this.imgH * scale));
    try {
      c.getContext("2d")!.drawImage(this.image, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    } catch {
      return null;                           // tainted canvas, cross-origin image
    }
  }

  fitView(): void {
    const { width: cw, height: ch } = this.logicalSize();
    this.fit = Math.min(cw / this.imgW, ch / this.imgH) * 0.96;
    this.zoom = 1;
    this.panX = (cw - this.imgW * this.fit) / 2;
    this.panY = (ch - this.imgH * this.fit) / 2;
    this.draw();
  }

  private logicalSize() {
    const r = this.canvas.getBoundingClientRect();
    return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  private resize(): void {
    const { width, height } = this.logicalSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // resizing resets the ctx
      if (this.fit === 1) this.fitView();
    }
    this.draw();
  }

  private get viewW() { return this.imgW * this.fit * this.zoom; }
  private get viewH() { return this.imgH * this.fit * this.zoom; }

  /** Flattening tolerance for *drawing*: a third of a screen pixel at the
   *  current zoom. Serialization uses the fixed fine tolerance instead — the
   *  mask must not get coarser just because the editor happened to be zoomed
   *  out when it was saved. */
  private get drawTol(): number {
    return Math.max(1e-7, 0.33 / Math.max(1, this.viewW));
  }

  private toScreen(nx: number, ny: number): [number, number] {
    return [this.panX + nx * this.viewW, this.panY + ny * this.viewH];
  }

  private toNorm(sx: number, sy: number): [number, number] {
    return [(sx - this.panX) / this.viewW, (sy - this.panY) / this.viewH];
  }

  private eventPos(e: PointerEvent | MouseEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /* ── Model ─────────────────────────────────────────────────────────────── */

  private snapshot(): void {
    this.undo.push(this.serialise());
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
  }

  private newShape(): Shape {
    return {
      type: this.newType,
      op: this.newOp,
      // Born open even in mask mode: a shape closes when you click its first
      // point or double-click empty space, so what you see while drawing is the
      // stroke you have actually laid down.
      closed: false,
      feather: 0,
      speed: 1,
      pts: [],
    };
  }

  /**
   * The handle offsets a point actually has — its own, or the automatic
   * Catmull-Rom tangent the curve is being drawn with.
   *
   * Without this the handles are invisible until they exist, and they only come
   * to exist by dragging one: you cannot grab what is not drawn. Resolving the
   * implicit tangent means the handles are always there to see and to grab, and
   * touching one just freezes the value that was already in effect.
   */
  private handlesOf(s: Shape, i: number): number[] | null {
    const p = s.pts[i];
    if (p.corner) return null;               // retracted by definition
    if (p.h) return p.h;
    if (s.pts.length < 2) return null;
    const segs = bezierSegments(s.pts, s.closed);
    const n = s.pts.length;
    const outSeg = segs[i];
    const inSeg = segs[(i - 1 + n) % n];
    const ox = outSeg ? outSeg[1][0] - p.x : 0;
    const oy = outSeg ? outSeg[1][1] - p.y : 0;
    const ix = inSeg && (s.closed || i > 0) ? inSeg[2][0] - p.x : -ox;
    const iy = inSeg && (s.closed || i > 0) ? inSeg[2][1] - p.y : -oy;
    return [ix, iy, ox, oy];
  }

  /** Freeze the implicit tangent so it can be edited. */
  private ensureHandles(s: Shape, i: number): void {
    const p = s.pts[i];
    if (!p.h) p.h = this.handlesOf(s, i) ?? [0, 0, 0, 0];
  }

  private static key(s: number, i: number): string { return `${s},${i}`; }

  /** The points a gesture on (s, i) acts on: the box selection if it is part of
   *  one, otherwise just itself. */
  private targets(s: number, i: number): Array<[number, number]> {
    if (!this.sel.has(SplineEditor.key(s, i))) return [[s, i]];
    return [...this.sel].map((k) => k.split(",").map(Number) as [number, number]);
  }

  /** Distance from a point to the cursor, in image pixels. Normalized units are
   *  anisotropic on a non-square frame; a feather radius must not be. */
  private distPx(nx: number, ny: number, px: number, py: number): number {
    return Math.hypot((nx - px) * this.imgW, (ny - py) * this.imgH);
  }

  deleteActive(): void {
    // A box selection is the more specific thing to mean, so it wins over "the
    // shape/pin that happens to be selected".
    if (this.sel.size) {
      this.snapshot();
      const byShape = new Map<number, number[]>();
      for (const k of this.sel) {
        const [s, i] = k.split(",").map(Number);
        (byShape.get(s) ?? byShape.set(s, []).get(s)!).push(i);
      }
      for (const [s, idx] of byShape) {
        idx.sort((a, b) => b - a);                       // splice from the back
        const list = this.mode === "pin" ? this.pins : this.shapes[s]?.pts;
        if (!list) continue;
        for (const i of idx) list.splice(i, 1);
      }
      if (this.mode !== "pin") {
        this.shapes = this.shapes.filter((s) => s.pts.length > 0);
        this.active = Math.min(this.active, this.shapes.length - 1);
      }
      this.sel.clear();
      this.selPt = -1;
      this.commit();
      return;
    }
    if (this.mode === "pin") {
      if (this.selPt < 0) return;
      this.snapshot();
      this.pins.splice(this.selPt, 1);
      this.selPt = -1;
    } else {
      if (this.active < 0) return;
      this.snapshot();
      this.shapes.splice(this.active, 1);
      this.active = Math.min(this.active, this.shapes.length - 1);
      this.selPt = -1;
    }
    this.commit();
  }

  /** Take every feather clone away, so all the edges go back to hard. Scoped to
   *  the box selection when there is one — otherwise the whole drawing. */
  clearFeather(): void {
    if (this.mode !== "shape") return;
    this.snapshot();
    if (this.sel.size) {
      for (const k of this.sel) {
        const [si, i] = k.split(",").map(Number);
        const p = this.shapes[si]?.pts[i];
        if (p) p.fo = null;
      }
    } else {
      for (const s of this.shapes) for (const p of s.pts) p.fo = null;
    }
    this.commit();
  }

  /** How many points currently carry a feather clone, for the status bar. */
  get featherCount(): number {
    if (this.mode !== "shape") return 0;
    let n = 0;
    for (const s of this.shapes) for (const p of s.pts) if (p.fo) n++;
    return n;
  }

  clearAll(): void {
    this.snapshot();
    this.shapes = [];
    this.pins = [];
    this.active = -1;
    this.selPt = -1;
    this.sel.clear();
    this.commit();
  }

  /** Finish the shape being drawn, so the next click starts a new one. */
  finishShape(): void {
    if (this.active < 0) return;
    const s = this.shapes[this.active];
    const need = this.mode === "shape" ? MIN_PTS.shape : MIN_PTS.path;
    if (s.pts.length < need) {
      this.shapes.splice(this.active, 1);
    } else if (this.mode === "shape") {
      s.closed = true;                       // a finished mask shape is a region
    }
    this.active = -1;
    this.selPt = -1;
    this.commit();
  }

  setActiveProp<K extends keyof Shape>(key: K, value: Shape[K]): void {
    if (this.active < 0) return;
    this.snapshot();
    this.shapes[this.active][key] = value;
    this.commit();
  }

  get activeShape(): Shape | null {
    return this.active >= 0 ? this.shapes[this.active] ?? null : null;
  }

  /* ── Serialization ─────────────────────────────────────────────────────── */

  serialise(): string {
    const aspect = Number(this.aspect.toFixed(6));
    if (this.mode === "pin") {
      return JSON.stringify({
        v: 1, t: 0, aspect,
        pins: this.pins.map((p) => ({
          x: round(p.x), y: round(p.y), blur: round(p.blur), r: round(p.r),
        })),
      });
    }
    const key = this.mode === "shape" ? "shapes" : "paths";
    const items = this.shapes
      .filter((s) => s.pts.length >= (this.mode === "shape" ? MIN_PTS.shape : MIN_PTS.path))
      .map((s) => {
        // A mask shape is always a closed region by the time it is rendered —
        // Python fills the polygon either way — so serialize it closed even if
        // the user saved mid-draw, or the flattened polyline would not match the
        // curve that gets filled.
        const closed = this.mode === "shape" ? true : s.closed;
        const { poly, us } = flattenP(s.pts, s.type, closed);
        const base: any = {
          type: s.type,
          closed,
          pts: s.pts.map((p) => ({
            x: round(p.x), y: round(p.y),
            ...(p.h ? { h: p.h.map(round) } : {}),
            ...(p.corner ? { corner: true } : {}),
            ...(p.fo ? { fo: [round2(p.fo[0]), round2(p.fo[1])] } : {}),
            ...(p.sp != null && p.sp !== 1 ? { sp: round2(p.sp) } : {}),
            })),
          poly: poly.map((q) => [round(q[0]), round(q[1])]),
        };
        // Per-point values ride along the polyline, resolved at every vertex,
        // because that polyline is all Python ever sees. Emitted only when one
        // is actually set, so an untouched shape serializes exactly as before.
        if (this.mode === "shape") {
          base.op = s.op;
          base.feather = round2(s.feather);   // continuous: see mask_core.blur
          if (s.pts.some((p) => p.fo)) {
            // Image pixels, not normalized: the render happens at a resolution
            // this editor may never have seen, and a feather is a distance on
            // the output, not a fraction of whatever backdrop was on screen.
            const fx = sampleAttr(s.pts, s.type, closed, us, (p) => p.fo?.[0] ?? 0);
            const fy = sampleAttr(s.pts, s.type, closed, us, (p) => p.fo?.[1] ?? 0);
            base.fo = fx.map((v, i) => [round2(v), round2(fy[i])]);
          }
        } else {
          base.speed = round(s.speed);
          if (s.pts.some((p) => (p.sp ?? 1) !== 1)) {
            base.sv = sampleAttr(s.pts, s.type, closed, us, (p) => Math.max(0, p.sp ?? 1))
              .map((v) => round2(Math.max(0, v)));
          }
        }
        return base;
      });
    return JSON.stringify({ v: 1, t: 0, aspect, [key]: items });
  }

  deserialise(json: string): void {
    let data: any;
    try {
      data = JSON.parse(json || "{}");
    } catch {
      return;
    }
    this.active = -1;
    this.selPt = -1;
    this.sel.clear();
    if (this.mode === "pin") {
      const raw = Array.isArray(data?.pins) ? data.pins : [];
      this.pins = raw.map((p: any) => ({
        x: clamp01(num(p?.x, 0.5)), y: clamp01(num(p?.y, 0.5)), blur: clamp01(num(p?.blur, 0.5)),
        // Absent in pins saved before reach existed — the default is what they
        // were rendered with, so old workflows come back identical.
        r: Math.max(0.01, num(p?.r, DEFAULT_INFLUENCE)),
      }));
    } else {
      const raw = Array.isArray(data?.shapes) ? data.shapes
        : Array.isArray(data?.paths) ? data.paths : [];
      this.shapes = raw.map((s: any) => ({
        type: s?.type === "bspline" || s?.type === "xspline" ? "bspline" : "bezier",
        op: s?.op === "sub" ? "sub" : "add",
        closed: s?.closed ?? this.mode === "shape",
        feather: Math.max(0, num(s?.feather, 0)),
        speed: Math.max(0, num(s?.speed, 1)),
        pts: (Array.isArray(s?.pts) ? s.pts : []).map((p: any) => ({
          x: num(p?.x, 0), y: num(p?.y, 0),
          h: Array.isArray(p?.h) && p.h.length === 4 ? p.h.map((v: any) => num(v, 0)) : null,
          corner: !!p?.corner,
          w: Math.max(MIN_W, Math.min(MAX_W, num(p?.w, MIN_W))),
          fo: Array.isArray(p?.fo) && p.fo.length === 2
            ? [num(p.fo[0], 0), num(p.fo[1], 0)] as [number, number]
            : null,
          sp: Math.max(0, num(p?.sp, 1)),
        })),
      })).filter((s: Shape) => s.pts.length > 0);
    }
    this.geomRev++;                            // undo comes through here too
    this.matteKey = "";
    this.draw();
    this.onState?.();
  }

  private emit(commit: boolean): void {
    this.geomRev++;
    // Whatever the backend last sent is now out of date, so drop it and let the
    // live shader carry the view until the next result lands.
    if (this.mode === "pin" && this.live) this.preview = null;
    // Only on commit. Serializing means flattening every curve at the *fine*
    // tolerance — thousands of points a shape, deliberately finer than anything
    // on screen — and then resolving every per-point value along all of them.
    // It is by far the most expensive thing in here, and nothing reads the
    // result until the drag ends: the node widget is written on commit, the
    // backend preview is asked on commit, and what you look at in between is
    // drawn from the editor's own state at screen tolerance.
    if (commit) this.onEdit(this.serialise());
    this.draw();
    if (commit) this.onState?.();
  }

  /** Rebuild whatever this mode uses as a backdrop and repaint. */
  refreshView(): void {
    this.matteKey = "";
    this.draw();
  }

  /**
   * The flattened outline and feather offsets of a shape, memoized.
   *
   * The matte builder and the on-canvas guides both want exactly this, and a
   * drag redraws both every frame. Keyed on the edit counter and the tolerance,
   * so a hover or a selection change reuses it and a zoom does not.
   */
  private shapeGeom(s: Shape) {
    const tol = this.drawTol;
    const hit = this.geomCache.get(s);
    if (hit && hit.rev === this.geomRev && hit.tol === tol) return hit;

    let entry;
    if (this.mode === "shape" && s.pts.some((p) => p.fo)) {
      // Flattened against the offset curve as well, so the soft edge is drawn
      // to the same standard as the hard one it belongs to.
      const got = flattenFeathered(s.pts, s.type, s.closed, tol,
        (p) => (p.fo?.[0] ?? 0) / this.imgW, (p) => (p.fo?.[1] ?? 0) / this.imgH);
      entry = { rev: this.geomRev, tol, ...got };
    } else {
      const { poly, us } = flattenP(s.pts, s.type, s.closed, tol);
      entry = { rev: this.geomRev, tol, poly, us, off: null as Pt[] | null };
    }
    this.geomCache.set(s, entry);
    return entry;
  }

  /**
   * The backend result no longer matches the settings, so drop it.
   *
   * Needed for anything that changes the render WITHOUT touching the geometry —
   * the sliders. Without it the stale result keeps holding the backdrop and the
   * live shader never gets a look in, so the view only caught up when you
   * happened to nudge a pin.
   */
  invalidatePreview(): void {
    this.preview = null;
    this.draw();
  }

  private commit(): void { this.emit(true); }

  /* ── Input ─────────────────────────────────────────────────────────────── */

  private pick(px: number, py: number) {
    // Handles of the selected point win over points: they sit on top and are
    // the smaller target.
    if (this.mode !== "pin" && this.active >= 0 && this.selPt >= 0) {
      const s = this.shapes[this.active];
      const p = s?.pts[this.selPt];
      const h = p && s.type === "bezier" ? this.handlesOf(s, this.selPt) : null;
      if (h) {
        for (const side of [0, 2] as const) {
          const [hx, hy] = this.toScreen(p!.x + h[side], p!.y + h[side + 1]);
          if (Math.hypot(px - hx, py - hy) <= HANDLE_HIT) {
            return { s: this.active, i: this.selPt, handle: side };
          }
        }
      }
    }
    // Then points, active shape first so overlapping shapes stay workable.
    const order = this.shapes.map((_, i) => i).sort((a, b) =>
      (b === this.active ? 1 : 0) - (a === this.active ? 1 : 0));
    for (const si of order) {
      const s = this.shapes[si];
      for (let i = 0; i < s.pts.length; i++) {
        const [sx, sy] = this.toScreen(s.pts[i].x, s.pts[i].y);
        if (Math.hypot(px - sx, py - sy) <= HIT) return { s: si, i, handle: -1 as const };
      }
    }
    return null;
  }

  /** Which finished shape's curve is under the cursor, and where a point goes. */
  private pickCurve(px: number, py: number): { s: number; at: number; x: number; y: number } | null {
    const [nx, ny] = this.toNorm(px, py);
    const aspect = this.viewW / Math.max(1, this.viewH);
    const tol = HIT / Math.max(1, this.viewH);          // screen px → the same units

    for (let si = this.shapes.length - 1; si >= 0; si--) {
      const s = this.shapes[si];
      if (s.pts.length < 2) continue;
      // Includes the shape being drawn: refining as you go is how the Sigmas
      // Curve editor works, and there is no reason to make you finish first.
      // Appending still wins near the open end, below.
      const got = insertionIndex(s.pts, s.type, s.closed, [nx, ny], tol, aspect);
      if (!got) continue;
      // Past the last point of the stroke you are still drawing: that is the
      // append you meant, not an insertion.
      if (si === this.active && !s.closed && got.at >= s.pts.length) continue;
      return { s: si, at: got.at, x: got.point[0], y: got.point[1] };
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    const [px, py] = this.eventPos(e);
    this.canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.altKey) {
      this.drag = { kind: "pan", x: px - this.panX, y: py - this.panY };
      return;
    }
    if (e.button !== 0) return;

    if (this.mode === "pin") return this.downPin(e, px, py);

    const hit = this.pick(px, py);

    // Ctrl on a point pulls a feather clone out of it — the Fusion gesture,
    // where the softness has a handle on the image rather than a panel
    // somewhere else. For a motion stroke there is nothing to place, so the
    // same press sets that point's own speed instead.
    if (hit && hit.handle < 0 && (e.ctrlKey || e.metaKey)) {
      this.active = hit.s;
      this.selPt = hit.i;
      this.snapshot();
      this.drag = { kind: "radius", s: hit.s, i: hit.i };
      this.emit(true);
      return;
    }

    // An existing clone is grabbed with no modifier at all: once it is on the
    // canvas it is simply another point, so it moves like one and shift-clicks
    // away like one — and the edge under it goes back to hard.
    if (!hit) {
      const clone = this.pickClone(px, py);
      if (clone) {
        this.active = clone.s;
        this.snapshot();
        if (e.shiftKey) {
          this.shapes[clone.s].pts[clone.i].fo = null;
          this.commit();
          return;
        }
        this.drag = { kind: "radius", s: clone.s, i: clone.i };
        this.emit(true);
        return;
      }
    }

    // Shift-drag on empty canvas is the marquee. Shift on a *point* still
    // deletes it (below), so the two never compete for the same press.
    if (!hit && e.shiftKey) {
      this.drag = { kind: "marquee", x0: px, y0: py, x1: px, y1: py };
      this.draw();
      return;
    }

    // Clicking the first point closes the shape being drawn — the pen-tool
    // gesture. Has to come before the generic point handling, which would
    // otherwise just select and drag it.
    if (hit && hit.handle < 0 && hit.i === 0 && hit.s === this.active) {
      const s = this.shapes[hit.s];
      if (this.mode === "shape" && !s.closed && s.pts.length >= MIN_PTS.shape) {
        this.snapshot();
        s.closed = true;
        this.finishShape();
        return;
      }
    }

    if (hit && hit.handle >= 0) {
      this.snapshot();
      this.drag = { kind: "handle", s: hit.s, i: hit.i, side: hit.handle as 0 | 2 };
      return;
    }
    if (hit) {
      if (e.shiftKey) {                                   // shift+click deletes
        this.snapshot();
        const s = this.shapes[hit.s];
        s.pts.splice(hit.i, 1);
        if (s.pts.length === 0) {
          this.shapes.splice(hit.s, 1);
          this.active = -1;
        }
        this.selPt = -1;
        this.commit();
        return;
      }
      const inSel = this.sel.has(SplineEditor.key(hit.s, hit.i));
      if (!inSel && this.sel.size) this.sel.clear();     // plain grab drops it
      this.active = hit.s;
      this.selPt = hit.i;
      this.snapshot();
      const p = this.shapes[hit.s].pts[hit.i];
      const [nx, ny] = this.toNorm(px, py);
      this.drag = {
        kind: "pt", s: hit.s, i: hit.i, dx: p.x - nx, dy: p.y - ny,
        group: inSel ? this.targets(hit.s, hit.i) : undefined,
      };
      this.emit(true);
      return;
    }

    // On the curve of a finished shape: insert a point there.
    const ins = this.pickCurve(px, py);
    if (ins) {
      this.snapshot();
      const s = this.shapes[ins.s];
      s.pts.splice(ins.at, 0, {
        x: ins.x, y: ins.y, h: null, corner: false,
      });
      this.active = ins.s;
      this.selPt = ins.at;
      // Offsets from the cursor, not zero: the point is placed where it least
      // disturbs the curve, which is not under the cursor, and it must not snap
      // there the moment the mouse twitches.
      const [cnx, cny] = this.toNorm(px, py);
      this.drag = { kind: "pt", s: ins.s, i: ins.at, dx: ins.x - cnx, dy: ins.y - cny };
      this.emit(true);
      return;
    }

    // Empty canvas, with a finished shape selected: let go of it and stop there.
    //
    // Starting the next shape on the same click is one gesture too eager — you
    // close an outline, click away to see it without the selection, and you have
    // silently begun a second shape with a stray point in it. Deselecting first
    // means the click that starts a new shape is always a click onto an empty
    // canvas with nothing selected, which is what it looks like.
    if (this.active >= 0 && this.shapes[this.active]?.closed) {
      this.sel.clear();
      this.active = -1;
      this.selPt = -1;
      this.draw();
      this.onState?.();
      return;
    }

    // Empty canvas: extend the shape being drawn, or start a new one.
    this.sel.clear();
    this.snapshot();
    if (this.active < 0) {
      this.shapes.push(this.newShape());
      this.active = this.shapes.length - 1;
    }
    const [nx, ny] = this.toNorm(px, py);
    const s = this.shapes[this.active];
    s.pts.push({ x: clamp01(nx), y: clamp01(ny), h: null, corner: false });
    this.selPt = s.pts.length - 1;
    this.drag = { kind: "pt", s: this.active, i: this.selPt, dx: 0, dy: 0 };
    this.emit(true);
  };

  private downPin(e: PointerEvent, px: number, py: number): void {
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const [cx, cy] = this.toScreen(this.pins[i].x, this.pins[i].y);
      if (hitDot(px, py, cx, cy)) {
        if (e.ctrlKey || e.metaKey) {
          this.selPt = i;
          this.snapshot();
          this.drag = { kind: "radius", s: 0, i };
          this.emit(true);
          return;
        }
        if (e.shiftKey) {
          this.snapshot();
          this.pins.splice(i, 1);
          this.selPt = -1;
          this.sel.clear();
          this.commit();
          return;
        }
        const inSel = this.sel.has(SplineEditor.key(0, i));
        if (!inSel && this.sel.size) this.sel.clear();
        this.selPt = i;
        this.snapshot();
        const [nx, ny] = this.toNorm(px, py);
        this.drag = {
          kind: "pin", i, dx: this.pins[i].x - nx, dy: this.pins[i].y - ny,
          group: inSel ? this.targets(0, i) : undefined,
        };
        this.emit(true);
        return;
      }
      if (hitRing(px, py, cx, cy) && !e.shiftKey) {
        this.selPt = i;
        this.snapshot();
        const pin = this.pins[i];
        this.drag = {
          kind: "scrub",
          apply: startScrub(py, () => pin.blur, (v) => { pin.blur = v; }),
        };
        this.emit(true);
        return;
      }
    }
    if (e.shiftKey) {                                    // marquee, as in shape mode
      this.drag = { kind: "marquee", x0: px, y0: py, x1: px, y1: py };
      this.draw();
      return;
    }
    this.sel.clear();
    this.snapshot();
    const [nx, ny] = this.toNorm(px, py);
    // Sharp by default: a new pin is normally there to hold something in focus,
    // and starting at zero means dropping one never disturbs what you have.
    this.pins.push({ x: clamp01(nx), y: clamp01(ny), blur: 0, r: DEFAULT_INFLUENCE });
    this.selPt = this.pins.length - 1;
    this.drag = { kind: "pin", i: this.selPt, dx: 0, dy: 0 };
    this.emit(true);
  }

  private onMove = (e: PointerEvent) => {
    const [px, py] = this.eventPos(e);
    const d = this.drag;

    if (!d) {
      const hit = this.mode === "pin" ? null : this.pick(px, py);
      const clone = hit ? null : this.pickClone(px, py);
      const changed = JSON.stringify(hit) !== JSON.stringify(this.hover)
        || JSON.stringify(clone) !== JSON.stringify(this.hoverClone);
      this.hover = hit;
      this.hoverClone = clone;
      this.canvas.style.cursor = hit || clone ? "pointer" : "crosshair";
      if (changed) this.draw();
      return;
    }

    if (d.kind === "pan") {
      this.panX = px - d.x;
      this.panY = py - d.y;
      this.draw();
      return;
    }
    if (d.kind === "scrub") {
      d.apply(py, e.shiftKey);
      this.emit(false);
      return;
    }
    if (d.kind === "marquee") {
      d.x1 = px;
      d.y1 = py;
      this.draw();
      return;
    }

    const [nx, ny] = this.toNorm(px, py);
    if (d.kind === "radius") return this.dragRadius(d.s, d.i, nx, ny);
    if (d.kind === "pin") {
      const p = this.pins[d.i];
      const nxc = clamp01(nx + d.dx);
      const nyc = clamp01(ny + d.dy);
      if (d.group) {
        const dx = nxc - p.x, dy = nyc - p.y;
        for (const [, j] of d.group) {
          if (j === d.i) continue;
          this.pins[j].x = clamp01(this.pins[j].x + dx);
          this.pins[j].y = clamp01(this.pins[j].y + dy);
        }
      }
      p.x = nxc;
      p.y = nyc;
      this.emit(false);
      return;
    }
    const s = this.shapes[d.s];
    if (!s) return;
    if (d.kind === "pt") {
      const p = s.pts[d.i];
      const nxc = clamp01(nx + d.dx);
      const nyc = clamp01(ny + d.dy);
      if (d.group) {
        const dx = nxc - p.x, dy = nyc - p.y;
        for (const [gs, gi] of d.group) {
          if (gs === d.s && gi === d.i) continue;
          const q = this.shapes[gs]?.pts[gi];
          if (!q) continue;
          q.x = clamp01(q.x + dx);
          q.y = clamp01(q.y + dy);
        }
      }
      p.x = nxc;
      p.y = nyc;
    } else {
      const p = s.pts[d.i];
      this.ensureHandles(s, d.i);
      const hx = nx - p.x;
      const hy = ny - p.y;
      p.h![d.side] = hx;
      p.h![d.side + 1] = hy;
      if (!e.altKey) {                       // mirror, unless Alt breaks the pair
        const other = d.side === 0 ? 2 : 0;
        p.h![other] = -hx;
        p.h![other + 1] = -hy;
      }
    }
    this.emit(false);
  };

  /**
   * The Ctrl-drag, and the drag of a feather clone once it exists.
   *
   * For a mask the cursor *is* the answer: the clone goes where it is put, so
   * the soft edge reaches exactly there. A box selection moves every clone by
   * the same offset rather than stacking them all on the cursor — the whole
   * point of selecting several is to keep their relationship.
   *
   * The other two modes have nothing to place — a stroke's direction comes from
   * the flow and a pin's reach is a radius — so there the drag is a distance.
   */
  private dragRadius(s: number, i: number, nx: number, ny: number): void {
    if (this.mode === "pin") {
      const p = this.pins[i];
      const d = Math.hypot(nx - p.x, ny - p.y);
      for (const [, j] of this.targets(0, i)) {
        this.pins[j].r = Math.max(0.01, Math.min(4, d));
      }
      this.emit(false);
      return;
    }
    const p = this.shapes[s]?.pts[i];
    if (!p) return;

    if (this.mode === "shape") {
      const want: [number, number] = [(nx - p.x) * this.imgW, (ny - p.y) * this.imgH];
      const was = p.fo ?? [0, 0];
      const dx = want[0] - was[0], dy = want[1] - was[1];
      for (const [ts, ti] of this.targets(s, i)) {
        const q = this.shapes[ts]?.pts[ti];
        if (!q) continue;
        if (ts === s && ti === i) q.fo = want;
        else q.fo = [(q.fo?.[0] ?? 0) + dx, (q.fo?.[1] ?? 0) + dy];
      }
      this.emit(false);
      return;
    }

    // Speed is what the drag distance would BE at the node's Strength, so the
    // ghost point lands under the cursor and reads as the travel it causes.
    const px = this.distPx(nx, ny, p.x, p.y);
    for (const [ts, ti] of this.targets(s, i)) {
      const q = this.shapes[ts]?.pts[ti];
      if (q) q.sp = Math.min(8, px / Math.max(1, this.strength));
    }
    this.emit(false);
  }

  /** Select every point inside the marquee. A click-sized rect just clears. */
  private finishMarquee(d: { x0: number; y0: number; x1: number; y1: number }): void {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    this.sel.clear();
    if (x1 - x0 < MARQUEE_MIN && y1 - y0 < MARQUEE_MIN) return;
    const inside = (nx: number, ny: number) => {
      const [x, y] = this.toScreen(nx, ny);
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    };
    if (this.mode === "pin") {
      this.pins.forEach((p, i) => { if (inside(p.x, p.y)) this.sel.add(SplineEditor.key(0, i)); });
    } else {
      this.shapes.forEach((s, si) => s.pts.forEach((p, i) => {
        if (inside(p.x, p.y)) this.sel.add(SplineEditor.key(si, i));
      }));
    }
  }

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (d.kind === "marquee") {
      this.finishMarquee(d);
      this.draw();
      this.onState?.();
      return;
    }
    if (d.kind !== "pan") this.commit();
  };

  private onDblClick = (e: MouseEvent) => {
    if (this.mode === "pin") return;
    const [px, py] = this.eventPos(e);
    const hit = this.pick(px, py);

    // Double-click on empty space finishes the shape — closing it, in mask mode.
    // Both of this event's clicks already added a point, so the duplicate the
    // second one left behind has to go before the shape is sealed.
    //
    // If the shape was already closed, those two clicks started a fresh one
    // instead (see onDown). It has a point or two and no outline, so finishing
    // discards it and the double-click reads as "I am done here" — deselect,
    // add nothing.
    if (!hit && this.active >= 0) {
      const s = this.shapes[this.active];
      const n = s.pts.length;
      if (n >= 2) {
        const [ax, ay] = this.toScreen(s.pts[n - 1].x, s.pts[n - 1].y);
        const [bx, by] = this.toScreen(s.pts[n - 2].x, s.pts[n - 2].y);
        if (Math.hypot(ax - bx, ay - by) < HIT) s.pts.pop();
      }
      if (this.mode === "shape" && s.pts.length >= MIN_PTS.shape) s.closed = true;
      this.finishShape();
      return;
    }

    if (!hit || hit.handle >= 0) return;
    // Photoshop's convert-point tool: a corner retracts both handles, and
    // converting back restores the automatic tangent.
    this.snapshot();
    const p = this.shapes[hit.s].pts[hit.i];
    p.corner = !p.corner;
    if (p.corner) p.h = null;
    this.commit();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [px, py] = this.eventPos(e);

    const [nx, ny] = this.toNorm(px, py);
    this.zoom = Math.max(0.2, Math.min(24, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    // Keep the point under the cursor put.
    this.panX = px - nx * this.viewW;
    this.panY = py - ny * this.viewH;
    this.draw();
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.canvas.isConnected) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      const prev = this.undo.pop();
      if (prev != null) {
        e.preventDefault();
        e.stopPropagation();
        const keep = this.undo;
        this.deserialise(prev);
        this.undo = keep;
        this.emit(true);
      }
      return;
    }
    // Esc drops the box selection before the modal gets a chance to read it as
    // "close" — the same precedence the Color Warp grid uses.
    if (e.key === "Escape" && this.sel.size) {
      e.preventDefault();
      e.stopPropagation();
      this.sel.clear();
      this.draw();
      this.onState?.();
      return;
    }
    if (e.key === "Enter") { e.stopPropagation(); this.finishShape(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.stopPropagation(); this.deleteActive(); return; }
    if (e.key === "f" || e.key === "F") { this.fitView(); }
  };

  /* ── Matte ─────────────────────────────────────────────────────────────── */

  /**
   * Composite the shapes into a real matte, offscreen, at image resolution.
   *
   * Deliberately mirrors `blur_core.rasterize` rather than approximating it:
   * `add` is `lighten` (a max) and `sub` draws the *inverted* coverage with
   * `darken` (a min against 1 - coverage). Per-shape feather is a canvas blur
   * filter applied before compositing, same order as the backend — which is what
   * makes a soft cut-out look right instead of merely dark.
   *
   * Cheap enough to redo on every mouse move, which is why this one preview is
   * genuinely live while the blurs need a round trip.
   */
  /**
   * Rebuild the matte only when something it depends on actually moved.
   *
   * It is drawn in *screen* space, so panning and zooming change it as much as
   * editing does — but a hover, a selection or a cursor change do not, and those
   * are most of the redraws.
   */
  private ensureMatte(): void {
    // The drag flag is in the key because it changes the ring count: letting go
    // has to repaint at full quality even when nothing else moved.
    const key = `${this.geomRev}|${this.panX}|${this.panY}|${this.viewW}|${this.viewH}` +
                `|${this.canvas.width}|${this.canvas.height}|${this.drag ? 1 : 0}`;
    if (key === this.matteKey) return;
    this.matteKey = key;
    this.buildMatte();
  }

  /**
   * Composite the shapes into a matte at *screen* resolution.
   *
   * Image resolution is the obvious choice and it is the wrong one twice over. A
   * fixed 1024 stretched to a zoomed-in view is visibly blocky — a hard edge
   * survives that upscale looking merely sharp, but a feather gradient turns to
   * stair-steps, which is exactly when it starts to matter. And in the other
   * direction it is wasted work: a 6000 px plate zoomed out to fit is drawn into
   * a fraction of that many pixels either way.
   *
   * One matte pixel per screen pixel is crisp at every zoom AND bounded by the
   * window, so the cost no longer follows the plate size at all.
   */
  private buildMatte(): void {
    if (this.mode !== "shape") return;
    const { width: lw, height: lh } = this.logicalSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // One matte pixel per device pixel, unless that gets silly on a big HiDPI
    // window — the mask is a smooth thing, so scaling it up slightly is fine
    // where scaling up a fixed 1024 by the zoom was not.
    const q = Math.max(1, Math.min(dpr, Math.sqrt(MATTE_MAX_PX / Math.max(1, lw * lh))));
    const w = Math.max(16, Math.round(lw * q));
    const h = Math.max(16, Math.round(lh * q));

    if (!this.matte) this.matte = document.createElement("canvas");
    const acc = this.matte;
    if (acc.width !== w || acc.height !== h) { acc.width = w; acc.height = h; }
    const a = acc.getContext("2d")!;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "source-over";
    a.fillStyle = "#000";
    a.fillRect(0, 0, w, h);

    if (!this.scratch) this.scratch = document.createElement("canvas");
    const tmp = this.scratch;                  // reused: a fresh canvas per drag
    if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
    const t = tmp.getContext("2d")!;
    // Normalized → matte pixels, through the same pan/zoom the overlay uses.
    const sx = this.viewW * q, sy = this.viewH * q;
    const ox = this.panX * q, oy = this.panY * q;
    const scale = sx / Math.max(1, this.imgW);   // image px → matte px

    for (const s of this.shapes) {
      // The shape still being drawn is not a region yet, so it stays out of the
      // matte until it closes.
      if (s.pts.length < 3 || !s.closed) continue;
      const { poly, off } = this.shapeGeom(s);
      if (poly.length < 3) continue;
      const sub = s.op === "sub";
      const rings = this.featherRings(s, poly, off);

      t.setTransform(1, 0, 0, 1, 0, 0);
      t.filter = "none";
      t.globalCompositeOperation = "source-over";
      t.fillStyle = "#000";
      t.fillRect(0, 0, w, h);
      // Paint the gradient as ANNULI, not as nested discs.
      //
      // Filling every ring whole is what `blur_core` does, and there it is free
      // — one buffer, and the polygon scan is the cost. On a canvas the cost is
      // the area covered, so k nested fills paint the shape's whole interior k
      // times over and a 60 px feather on a big shape drops the frame rate by
      // the ring count. The band between two neighbouring rings carries the same
      // information: fill it alone, with an even-odd path, and the total area
      // painted is the shape once plus the band once — independent of k, which
      // is why the ring count can be chosen for how it looks.
      const k = rings.length;
      const outward = polyArea(rings[k - 1]) >= polyArea(rings[0]);
      const seq = outward ? rings.slice().reverse() : rings;   // largest first
      const trace = (ring: Pt[]) => {
        t.moveTo(ox + ring[0][0] * sx, oy + ring[0][1] * sy);
        for (let i = 1; i < ring.length; i++) {
          t.lineTo(ox + ring[i][0] * sx, oy + ring[i][1] * sy);
        }
        t.closePath();
      };
      // Additive, and that is not an optimization — it is what makes the bands
      // join. Two neighbouring annuli share an antialiased edge, so with plain
      // source-over each covers its own fraction of the seam pixel and the black
      // underneath shows through the rest: a dark ring at every single level.
      // Adding instead gives α·level + (1-α)·nextLevel there, which is the value
      // that belongs at the seam. The regions are disjoint everywhere else, so
      // nothing else double-counts.
      t.globalCompositeOperation = "lighter";
      // Solid core: inside the smallest ring, every ring contains you.
      t.fillStyle = "#fff";
      t.beginPath();
      trace(seq[k - 1]);
      t.fill();
      for (let i = 0; i < k - 1; i++) {
        const level = Math.round((255 * (i + 1)) / k);
        t.fillStyle = `rgb(${level},${level},${level})`;
        t.beginPath();
        trace(seq[i]);
        trace(seq[i + 1]);
        t.fill("evenodd");                     // just the band between the two
      }
      t.globalCompositeOperation = "source-over";
      if (sub) {                                // invert, for 1 - coverage
        t.globalCompositeOperation = "difference";
        t.fillStyle = "#fff";
        t.fillRect(0, 0, w, h);
      }

      // The shape-wide feather goes on at composite time now: with overlapping
      // rings, blurring each one is not blurring the gradient they make.
      a.filter = s.feather > 0 ? `blur(${(s.feather * scale).toFixed(2)}px)` : "none";
      a.globalCompositeOperation = sub ? "darken" : "lighten";
      a.drawImage(tmp, 0, 0);
      a.filter = "none";
    }
    a.globalCompositeOperation = "source-over";
  }

  /**
   * The nested outlines whose average IS the per-point feather gradient.
   *
   * A pixel inside j of them has coverage j/K, and `rampOffsets` places them so
   * that works out to a smoothstep across the band rather than a straight ramp.
   * No distance transform, and nothing that has to be written twice —
   * `blur_core._shape_rings` builds the identical list.
   *
   * With no per-point feather this is one ring, the outline itself, and the fill
   * below is what it was before feathering existed.
   */
  private featherRings(s: Shape, poly: Pt[], off: Pt[] | null): Pt[][] {
    if (!off) return [poly];
    // reduce, not Math.max(...): a dense outline is thousands of vertices and
    // spreading that many arguments overflows the call stack.
    let reach = 0;
    for (let i = 0; i < poly.length; i++) {
      const d = Math.hypot(off[i][0] * this.imgW, off[i][1] * this.imgH);
      if (d > reach) reach = d;
    }

    // Rings are counted in SCREEN pixels here, not image pixels as the render
    // counts them. Each one is a separate canvas fill, and a fill costs about
    // the same whatever it covers — the path has to be scan-converted across
    // the shape either way — so the ring count, not the ring size, is what sets
    // the frame rate. One ring per screen pixel of band is already the smoothest
    // a display can show; asking for the render's count on a plate shown at half
    // size is paying double for a difference that cannot be resolved.
    //
    // The profile is identical either way: `rampOffsets` places whatever number
    // it is given along the same smoothstep, so the preview and the render
    // differ in quantization only.
    let k = rampRings(reach * (this.viewW / Math.max(1, this.imgW)));
    // Mid-drag, coarser still. What is on screen is moving, the banding that
    // buys back is not what you are looking at, and the full stack lands on the
    // frame after the mouse comes up.
    if (this.drag) k = Math.min(k, DRAG_RINGS);
    return rampOffsets(k).map((t) =>
      poly.map((p, i) => [p[0] + off[i][0] * t, p[1] + off[i][1] * t] as Pt));
  }



  /* ── Drawing ───────────────────────────────────────────────────────────── */

  private drawBackdrop(): void {
    const ctx = this.ctx;
    const box = [this.panX, this.panY, this.viewW, this.viewH] as const;

    if (this.mode === "shape") {
      if (this.view !== "source") this.ensureMatte();
      const { width: lw, height: lh } = this.logicalSize();
      // The matte is in screen space, so it goes down 1:1 — but it covers the
      // whole canvas, and only the part over the image is the mask. Clipping
      // keeps the surround as backdrop instead of dragging it dark.
      const put = () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(...box);
        ctx.clip();
        ctx.drawImage(this.matte!, 0, 0, lw, lh);
        ctx.restore();
      };
      if (this.view === "matte" && this.matte) {
        put();                                   // the mask itself, opaque
        return;
      }
      if (this.image) ctx.drawImage(this.image, ...box);
      if (this.view === "source" || !this.matte) return;
      // Dim everything outside the mask. `multiply` under a partial alpha gives
      // base·(1-α) + base·matte·α, i.e. the image scaled by 0.45..1 — one draw,
      // and unlike re-drawing the image on top it leaves the inside untouched.
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.55;
      put();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    if (this.view === "source") {
      if (this.image) ctx.drawImage(this.image, ...box);
      return;
    }

    // Pin mode steers on the GPU and confirms on the backend: the shader repaints
    // every mouse move, and whenever an exact result has arrived it wins. Any
    // edit drops that result, so the shader takes back over instantly.
    if (this.mode === "pin" && this.live && (!this.preview || this.view === "field")) {
      const scale = this.live.canvas.width / Math.max(1, this.imgW);
      if (this.live.render(this.pins, this.maxBlur * scale, this.falloff,
                           this.view === "field")) {
        ctx.drawImage(this.live.canvas, ...box);
        return;
      }
    }

    const src = this.preview ?? this.image;
    if (src) ctx.drawImage(src, ...box);
  }

  draw(): void {
    const ctx = this.ctx;
    const { width, height } = this.logicalSize();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.imageSmoothingEnabled = this.zoom < 4;
    this.drawBackdrop();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.panX, this.panY, this.viewW, this.viewH);

    if (!this.showCurves) return;
    if (this.mode === "pin") this.drawPins();
    else this.shapes.forEach((s, si) => this.drawShape(s, si));

    if (this.drag?.kind === "marquee") {
      const d = this.drag;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
      ctx.save();
      ctx.fillStyle = "rgba(74,180,255,0.10)";
      ctx.fillRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.strokeStyle = C.marquee;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.restore();
    }
  }

  /**
   * The softness guide: a second outline offset by each point's own feather,
   * dashed, with a tether to the point it belongs to.
   *
   * Fusion's convention, and it is the right one — the value being edited is a
   * distance on the image, so showing it as a distance on the image beats any
   * number in a panel. A point with no feather has no clone to draw.
   */
  private drawFeather(s: Shape, si: number): void {
    if (this.mode !== "shape" || !s.closed || s.pts.length < 3) return;
    const ctx = this.ctx;
    const { poly, off } = this.shapeGeom(s);
    if (poly.length < 3 || !off) return;

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
    ctx.fillStyle = si === this.active ? C.soft : C.softDim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const [x0, y0] = this.toScreen(poly[0][0] + off[0][0], poly[0][1] + off[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < poly.length; i++) {
      const [x, y] = this.toScreen(poly[i][0] + off[i][0], poly[i][1] + off[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Each clone, exactly where it was put — it is a position now, not a
    // distance, so there is nothing to look up. Drag one to move it; shift-click
    // it to take it away and let the edge snap back to hard.
    s.pts.forEach((p, i) => {
      if (!p.fo) return;
      const [cx, cy] = this.toScreen(p.x, p.y);
      const [gx, gy] = this.clonePos(p);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      const hot = this.hoverClone?.s === si && this.hoverClone?.i === i;
      ctx.beginPath();
      ctx.arc(gx, gy, hot ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ptStroke;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
      ctx.lineWidth = 1.2;
    });
    ctx.restore();
  }

  /** A feather clone's position on screen. */
  private clonePos(p: SplinePoint): [number, number] {
    const fo = p.fo ?? [0, 0];
    return this.toScreen(p.x + fo[0] / this.imgW, p.y + fo[1] / this.imgH);
  }

  /** Which feather clone is under the cursor. They are grabbed directly, with no
   *  modifier — once one exists it is just another point on the canvas. */
  private pickClone(px: number, py: number): { s: number; i: number } | null {
    if (this.mode !== "shape") return null;
    const order = this.shapes.map((_, i) => i).sort((a, b) =>
      (b === this.active ? 1 : 0) - (a === this.active ? 1 : 0));
    for (const si of order) {
      const s = this.shapes[si];
      if (!s.closed) continue;
      for (let i = 0; i < s.pts.length; i++) {
        if (!s.pts[i].fo) continue;
        const [gx, gy] = this.clonePos(s.pts[i]);
        if (Math.hypot(px - gx, py - gy) <= CLONE_HIT) return { s: si, i };
      }
    }
    return null;
  }

  /** A stroke point's own speed, drawn as the distance that pixel will travel. */
  private drawSpeedGhost(s: Shape, si: number): void {
    if (this.mode !== "path" || s.pts.length < 2) return;
    const ctx = this.ctx;
    const poly = flatten(s.pts, s.type, s.closed, this.drawTol);
    if (poly.length < 2) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
    ctx.fillStyle = si === this.active ? C.soft : C.softDim;
    ctx.lineWidth = 1.2;
    s.pts.forEach((p) => {
      const sp = p.sp ?? 1;
      if (sp === 1) return;
      // Along the curve, because that is the direction the pixel actually moves.
      let best = 0, bd = Infinity;
      poly.forEach((q, j) => {
        const d = Math.hypot(q[0] - p.x, q[1] - p.y);
        if (d < bd) { bd = d; best = j; }
      });
      const nxt = poly[Math.min(poly.length - 1, best + 1)];
      const prv = poly[Math.max(0, best - 1)];
      let tx = (nxt[0] - prv[0]) * this.imgW, ty = (nxt[1] - prv[1]) * this.imgH;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const travel = sp * this.strength;                       // image pixels
      const [cx, cy] = this.toScreen(p.x, p.y);
      const [gx, gy] = this.toScreen(p.x + (tx * travel) / this.imgW,
                                     p.y + (ty * travel) / this.imgH);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  private tracePath(ctx: CanvasRenderingContext2D, s: Shape): void {
    ctx.beginPath();
    if (s.type === "bezier") {
      const segs = bezierSegments(s.pts, s.closed);
      if (!segs.length) return;
      const [x0, y0] = this.toScreen(segs[0][0][0], segs[0][0][1]);
      ctx.moveTo(x0, y0);
      for (const [, c1, c2, p3] of segs) {
        const a = this.toScreen(c1[0], c1[1]);
        const b = this.toScreen(c2[0], c2[1]);
        const c = this.toScreen(p3[0], p3[1]);
        ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      }
    } else {
      const poly: Pt[] = flatten(s.pts, s.type, s.closed, this.drawTol);
      if (!poly.length) return;
      const [x0, y0] = this.toScreen(poly[0][0], poly[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < poly.length; i++) {
        const [x, y] = this.toScreen(poly[i][0], poly[i][1]);
        ctx.lineTo(x, y);
      }
    }
    if (s.closed) ctx.closePath();
  }

  private drawShape(s: Shape, si: number): void {
    const ctx = this.ctx;
    const isActive = si === this.active;
    const color = this.mode === "shape" ? (s.op === "sub" ? C.sub : C.add) : C.path;

    if (s.pts.length >= 2) {
      this.tracePath(ctx, s);
      if (s.closed && this.showFill && s.pts.length >= 3) {
        ctx.fillStyle = s.op === "sub" ? "rgba(255,107,107,0.20)" : "rgba(74,180,255,0.20)";
        ctx.fill();
      }
      ctx.strokeStyle = isActive ? color : C.idle;
      ctx.lineWidth = isActive ? 2 : 1.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      if (!s.closed) this.drawArrow(s, color);
    }

    this.drawFeather(s, si);
    this.drawSpeedGhost(s, si);

    // The control polygon, dashed — the NKD Sigmas Curve convention.
    // A B-spline's points do not sit on its curve, and on a slack shape they can
    // be a long way off it; without this they read as unrelated dots floating
    // over the image and there is no way to see which point steers what.
    if (s.type === "bspline" && s.pts.length >= 2) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = isActive ? C.hull : "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const [x0, y0] = this.toScreen(s.pts[0].x, s.pts[0].y);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < s.pts.length; i++) {
        const [x, y] = this.toScreen(s.pts[i].x, s.pts[i].y);
        ctx.lineTo(x, y);
      }
      if (s.closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Handles of the selected point only — all of them at once is unreadable.
    // Drawn from the *effective* tangent, so they are visible (and grabbable)
    // before the point has ever been given explicit handles.
    if (isActive && this.selPt >= 0 && s.type === "bezier") {
      const p = s.pts[this.selPt];
      const h = p ? this.handlesOf(s, this.selPt) : null;
      if (p && h) {
        const [cx, cy] = this.toScreen(p.x, p.y);
        ctx.strokeStyle = C.handle;
        ctx.fillStyle = C.handle;
        ctx.lineWidth = 1;
        for (const side of [0, 2] as const) {
          const [hx, hy] = this.toScreen(p.x + h[side], p.y + h[side + 1]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    s.pts.forEach((p, i) => {
      const [x, y] = this.toScreen(p.x, p.y);
      const hovered = this.hover?.s === si && this.hover?.i === i && this.hover.handle < 0;
      const selected = isActive && i === this.selPt;
      const r = selected ? PT_R.active : hovered ? PT_R.hover : PT_R.idle;

      // The Sigmas Curve point: a drop shadow to lift it off whatever is behind,
      // then a dark ring. Over photography that shadow is what keeps a point
      // readable on a light background, which a flat dot is not.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      if (p.corner) {
        ctx.rect(x - r, y - r, r * 2, r * 2);          // corners read as squares
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = selected ? C.ptActive : hovered ? C.ptHover : isActive ? C.pt : C.idle;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = C.ptStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (this.sel.has(SplineEditor.key(si, i))) {   // box-selected: a bright ring
        ctx.strokeStyle = C.marquee;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  /** Direction marker on an open stroke — which way the blur travels. */
  private drawArrow(s: Shape, color: string): void {
    const poly = flatten(s.pts, s.type, s.closed);
    if (poly.length < 2) return;
    const a = this.toScreen(poly[poly.length - 2][0], poly[poly.length - 2][1]);
    const b = this.toScreen(poly[poly.length - 1][0], poly[poly.length - 1][1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b[0], b[1]);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-11, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawPins(): void {
    const ctx = this.ctx;
    const px = this.viewW / Math.max(1, this.imgW);      // image px → screen px

    this.pins.forEach((p, i) => {
      const [x, y] = this.toScreen(p.x, p.y);
      const radius = p.blur * this.maxBlur;

      // The blur radius at true scale. Without it "0.62" means nothing until you
      // run the graph — this is how big the blur actually is on this image.
      const rs = radius * px;
      if (rs > 2) {
        ctx.save();
        ctx.strokeStyle = i === this.selPt ? "rgba(74,180,255,0.55)" : "rgba(74,180,255,0.22)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, rs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Reach: how far this pin's value carries before the others take over.
      // An ellipse, not a circle, because the weighting is solved in normalized
      // coordinates — on a wide frame it really does reach further sideways.
      if (p.r !== DEFAULT_INFLUENCE) {
        ctx.save();
        ctx.strokeStyle = i === this.selPt ? C.soft : C.softDim;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, p.r * this.viewW, p.r * this.viewH, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      drawRing(ctx, x, y, p.blur, C.add, i === this.selPt, `${Math.round(radius)} px`);

      if (this.sel.has(SplineEditor.key(0, i))) {
        ctx.save();
        ctx.strokeStyle = C.marquee;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  /** How many points the marquee is currently holding, for the status bar. */
  get selectionSize(): number { return this.sel.size; }
}

/** Unsigned shoelace — only used to tell the two ends of a ring stack apart. */
const polyArea = (poly: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
