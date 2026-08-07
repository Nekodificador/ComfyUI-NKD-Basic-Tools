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
import { flatten, bezierSegments, insertionIndex, MIN_W, MAX_W, type Pt, type SplinePoint, type SplineType } from "./splineEval";
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

export type Pin = { x: number; y: number; blur: number };

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
} as const;

// Matches the NKD Sigmas Curve editor.
const HIT = 10;
const PT_R = { idle: 4.5, hover: 6, active: 7 } as const;
const HANDLE_HIT = 7;
const UNDO_DEPTH = 30;
const MIN_PTS = { shape: 3, path: 2 } as const;

type Drag =
  | null
  | { kind: "pt"; s: number; i: number; dx: number; dy: number }
  | { kind: "handle"; s: number; i: number; side: 0 | 2 }
  | { kind: "pin"; i: number; dx: number; dy: number }
  | { kind: "scrub"; apply: (y: number, fine: boolean) => void }
  | { kind: "pan"; x: number; y: number };

export type EditorOptions = {
  mode: EditorMode;
  /** Called on every edit; `commit` is false while a drag is still in flight. */
  onEdit: (json: string, commit: boolean) => void;
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
  private hover: { s: number; i: number; handle: 0 | 2 | -1 } | null = null;

  /** Defaults the toolbar writes and new shapes inherit. */
  newType: SplineType = "bezier";
  newOp: "add" | "sub" = "add";
  showFill = true;
  view: ViewMode = "result";
  /** Backend-rendered result for the blur modes; null until one arrives. */
  preview: CanvasImageSource | null = null;
  /** The node's own settings, so the pin gizmos can show real pixels and the
   *  live shader can match what the graph will do. */
  maxBlur = 48;
  falloff = 2;
  /** GPU guide for pin mode. Drives the canvas between backend results. */
  private live: FieldPreview | null = null;
  /** Offscreen matte for shape mode, rebuilt on every edit — cheap and exact. */
  private matte: HTMLCanvasElement | null = null;

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
    if (this.mode === "shape") this.buildMatte();
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

  deleteActive(): void {
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

  clearAll(): void {
    this.snapshot();
    this.shapes = [];
    this.pins = [];
    this.active = -1;
    this.selPt = -1;
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
          x: round(p.x), y: round(p.y), blur: round(p.blur),
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
        const base: any = {
          type: s.type,
          closed,
          pts: s.pts.map((p) => ({
            x: round(p.x), y: round(p.y),
            ...(p.h ? { h: p.h.map(round) } : {}),
            ...(p.corner ? { corner: true } : {}),
            })),
          poly: flatten(s.pts, s.type, closed).map((q) => [round(q[0]), round(q[1])]),
        };
        if (this.mode === "shape") {
          base.op = s.op;
          base.feather = Math.round(s.feather);
        } else {
          base.speed = round(s.speed);
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
    if (this.mode === "pin") {
      const raw = Array.isArray(data?.pins) ? data.pins : [];
      this.pins = raw.map((p: any) => ({
        x: clamp01(num(p?.x, 0.5)), y: clamp01(num(p?.y, 0.5)), blur: clamp01(num(p?.blur, 0.5)),
      }));
    } else {
      const raw = Array.isArray(data?.shapes) ? data.shapes
        : Array.isArray(data?.paths) ? data.paths : [];
      this.shapes = raw.map((s: any) => ({
        type: s?.type === "bspline" || s?.type === "xspline" ? "bspline" : "bezier",
        op: s?.op === "sub" ? "sub" : "add",
        closed: s?.closed ?? this.mode === "shape",
        feather: Math.max(0, Math.round(num(s?.feather, 0))),
        speed: Math.max(0, num(s?.speed, 1)),
        pts: (Array.isArray(s?.pts) ? s.pts : []).map((p: any) => ({
          x: num(p?.x, 0), y: num(p?.y, 0),
          h: Array.isArray(p?.h) && p.h.length === 4 ? p.h.map((v: any) => num(v, 0)) : null,
          corner: !!p?.corner,
          w: Math.max(MIN_W, Math.min(MAX_W, num(p?.w, MIN_W))),
        })),
      })).filter((s: Shape) => s.pts.length > 0);
    }
    this.draw();
    this.onState?.();
  }

  private emit(commit: boolean): void {
    if (this.mode === "shape" && this.view !== "source") this.buildMatte();
    // Whatever the backend last sent is now out of date, so drop it and let the
    // live shader carry the view until the next result lands.
    if (this.mode === "pin" && this.live) this.preview = null;
    this.onEdit(this.serialise(), commit);
    this.draw();
    if (commit) this.onState?.();
  }

  /** Rebuild whatever this mode uses as a backdrop and repaint. */
  refreshView(): void {
    if (this.mode === "shape") this.buildMatte();
    this.draw();
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
      this.active = hit.s;
      this.selPt = hit.i;
      this.snapshot();
      const p = this.shapes[hit.s].pts[hit.i];
      const [nx, ny] = this.toNorm(px, py);
      this.drag = { kind: "pt", s: hit.s, i: hit.i, dx: p.x - nx, dy: p.y - ny };
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

    // Empty canvas: extend the shape being drawn, or start a new one.
    this.snapshot();
    if (this.active < 0 || this.shapes[this.active].closed) {
      // A closed shape is finished. Clicking away from it starts the next one
      // rather than bolting a point onto an outline that is already done —
      // which is what selecting a closed shape to nudge a point used to cause.
      if (this.active >= 0) this.finishShape();
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
        if (e.shiftKey) {
          this.snapshot();
          this.pins.splice(i, 1);
          this.selPt = -1;
          this.commit();
          return;
        }
        this.selPt = i;
        this.snapshot();
        const [nx, ny] = this.toNorm(px, py);
        this.drag = { kind: "pin", i, dx: this.pins[i].x - nx, dy: this.pins[i].y - ny };
        this.emit(true);
        return;
      }
      if (hitRing(px, py, cx, cy)) {
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
    this.snapshot();
    const [nx, ny] = this.toNorm(px, py);
    // Sharp by default: a new pin is normally there to hold something in focus,
    // and starting at zero means dropping one never disturbs what you have.
    this.pins.push({ x: clamp01(nx), y: clamp01(ny), blur: 0 });
    this.selPt = this.pins.length - 1;
    this.drag = { kind: "pin", i: this.selPt, dx: 0, dy: 0 };
    this.emit(true);
  }

  private onMove = (e: PointerEvent) => {
    const [px, py] = this.eventPos(e);
    const d = this.drag;

    if (!d) {
      const hit = this.mode === "pin" ? null : this.pick(px, py);
      const changed = JSON.stringify(hit) !== JSON.stringify(this.hover);
      this.hover = hit;
      this.canvas.style.cursor = hit ? "pointer" : "crosshair";
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

    const [nx, ny] = this.toNorm(px, py);
    if (d.kind === "pin") {
      const p = this.pins[d.i];
      p.x = clamp01(nx + d.dx);
      p.y = clamp01(ny + d.dy);
      this.emit(false);
      return;
    }
    const s = this.shapes[d.s];
    if (!s) return;
    if (d.kind === "pt") {
      const p = s.pts[d.i];
      p.x = clamp01(nx + d.dx);
      p.y = clamp01(ny + d.dy);
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

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    const wasEdit = this.drag.kind !== "pan";
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (wasEdit) this.commit();
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
  private buildMatte(): void {
    if (this.mode !== "shape") return;
    const w = Math.min(1024, Math.max(16, Math.round(this.imgW)));
    const h = Math.max(16, Math.round((w * this.imgH) / this.imgW));

    if (!this.matte) this.matte = document.createElement("canvas");
    const acc = this.matte;
    if (acc.width !== w || acc.height !== h) { acc.width = w; acc.height = h; }
    const a = acc.getContext("2d")!;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "source-over";
    a.fillStyle = "#000";
    a.fillRect(0, 0, w, h);

    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext("2d")!;
    const scale = w / Math.max(1, this.imgW);

    for (const s of this.shapes) {
      // The shape still being drawn is not a region yet, so it stays out of the
      // matte until it closes.
      if (s.pts.length < 3 || !s.closed) continue;
      const poly = flatten(s.pts, s.type, s.closed, this.drawTol);
      if (poly.length < 3) continue;
      const sub = s.op === "sub";

      t.setTransform(1, 0, 0, 1, 0, 0);
      t.filter = "none";
      t.globalCompositeOperation = "source-over";
      t.fillStyle = sub ? "#fff" : "#000";      // sub composites 1 - coverage
      t.fillRect(0, 0, w, h);
      if (s.feather > 0) t.filter = `blur(${(s.feather * scale).toFixed(2)}px)`;
      t.fillStyle = sub ? "#000" : "#fff";
      t.beginPath();
      t.moveTo(poly[0][0] * w, poly[0][1] * h);
      for (let i = 1; i < poly.length; i++) t.lineTo(poly[i][0] * w, poly[i][1] * h);
      t.closePath();
      t.fill();

      a.globalCompositeOperation = sub ? "darken" : "lighten";
      a.drawImage(tmp, 0, 0);
    }
    a.globalCompositeOperation = "source-over";
  }

  /* ── Drawing ───────────────────────────────────────────────────────────── */

  private drawBackdrop(): void {
    const ctx = this.ctx;
    const box = [this.panX, this.panY, this.viewW, this.viewH] as const;

    if (this.mode === "shape") {
      if (this.view === "matte" && this.matte) {
        ctx.drawImage(this.matte, ...box);       // the mask itself, opaque
        return;
      }
      if (this.image) ctx.drawImage(this.image, ...box);
      if (this.view === "source" || !this.matte) return;
      // Dim everything outside the mask. `multiply` under a partial alpha gives
      // base·(1-α) + base·matte·α, i.e. the image scaled by 0.45..1 — one draw,
      // and unlike re-drawing the image on top it leaves the inside untouched.
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.matte, ...box);
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

    if (this.mode === "pin") return this.drawPins();

    this.shapes.forEach((s, si) => this.drawShape(s, si));
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

      drawRing(ctx, x, y, p.blur, C.add, i === this.selPt, `${Math.round(radius)} px`);
    });
  }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
