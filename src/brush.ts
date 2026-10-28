/**
 * The NKD brush engine: a raster layer you paint into with a soft round brush, with undo.
 *
 * Shared by 😺NKD Paint (this pack) and the Popup Preview's paint mode (NKD Preview Tools,
 * which keeps a VERBATIM copy of this file - the packs never import each other). If you
 * change it here, copy it there, or the two brushes drift apart.
 *
 * No node, widget or ComfyUI imports: the owner keeps the view (zoom, pan, cursor) and the
 * input; this only knows layer pixels.
 *
 * Painting is stroke-buffered: the stroke goes into `stroke` at full opacity and is
 * composited over `layer` with the brush opacity only on release, so a stroke never builds
 * up on itself. The eraser is the same path with `destination-out`.
 *
 * Strokes are OPAQUE PATHS, and softness is a blur applied when the stroke is composited.
 * The stamp engine before this (radial-gradient dabs every few px) left a lattice: every
 * dab adds partial alpha, the sum is quantised to 8 bits, and where strokes cross the
 * residue lines up into a grid you can see through a flat colour (Neko: "patrón de puntos
 * rarísimo"). A path has no dabs, so nothing to line up; round caps and joins keep it
 * continuous at any speed; and a blur of the finished shape is exactly the soft edge a
 * radial falloff was approximating, without the accumulation problem.
 *
 * Hardness splits the radius into a solid core and a blurred fringe. A blurred disc has
 * alpha 0.5 at the core's edge and fades to ~0.05 at 1.65σ past it, so the numbers come
 * from Photoshop's soft round brush: at hardness 0 the 50 % point sits at half the radius
 * and the fringe ends at the radius (core = r/2, σ = 0.3 r); at hardness 1 the core is the
 * whole brush and there is no blur.
 */

export type BrushTool = "brush" | "eraser";
export interface BrushParams {
  size: number;       // diameter, layer px
  opacity: number;    // 0..1, applied to the whole stroke on release
  hardness: number;   // 0 soft airbrush .. 1 solid edge
  tool: BrushTool;
  color: string;      // #rrggbb; ignored by the eraser
}

export const SIZE_MAX = 400;

export const coreRadius = (r: number, hardness: number) => r * (0.5 + 0.5 * hardness);
export const fringeBlur = (r: number, hardness: number) => r * (1 - hardness) * 0.3;

/** Brush radius for this pointer event: a pen's pressure scales the size. */
export function radiusFor(size: number, e: PointerEvent): number {
  if (e.pointerType === "pen" && e.pressure > 0) size *= 0.25 + 0.75 * e.pressure;
  return size / 2;
}

/** `[` / `]`: ten percent a press, never stuck at 1. */
export function stepSize(size: number, dir: -1 | 1): number {
  return dir < 0 ? Math.max(1, Math.round(size * 0.9) || 1)
                 : Math.min(SIZE_MAX, Math.max(size + 1, Math.round(size * 1.1)));
}

/** Alt + right drag, Photoshop's gesture. `dx`/`dy` in display px, `scale` = display px per
 *  layer px. Horizontal: one layer px of diameter per layer px of travel (coarse on a small
 *  view, exact zoomed in, which is when you care). Vertical: down hardens, full range ~150 px. */
export function adjustBrush(size0: number, hard0: number, dx: number, dy: number, scale: number) {
  return {
    size: Math.max(1, Math.min(SIZE_MAX, Math.round(size0 + dx / scale))),
    hardness: Math.max(0, Math.min(1, hard0 + dy / 150)),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [255, 255, 255];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** `doc` matters: a layer for a Picture-in-Picture or popup window must be made by THAT
 *  window's document, not the graph's. */
export function mkCanvas(w: number, h: number, doc: Document = document): HTMLCanvasElement {
  const c = doc.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

export class BrushLayer {
  layer: HTMLCanvasElement;
  stroke: HTMLCanvasElement;
  comp: HTMLCanvasElement;
  hasStrokes = false;
  stroking = false;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private last: [number, number] | null = null;
  private strokeR = 0;   // brush radius of the stroke in progress, for the blur at composite time

  /** `onChange` runs after a committed stroke, undo or redo: the owner saves and redraws. */
  constructor(w: number, h: number, private params: () => BrushParams,
              private onChange: () => void = () => {},
              private doc: Document = document,
              private undoBudget = 256 * 1024 * 1024) {
    this.layer = mkCanvas(w, h, doc);
    this.stroke = mkCanvas(w, h, doc);
    this.comp = mkCanvas(w, h, doc);
  }

  get width() { return this.layer.width; }
  get height() { return this.layer.height; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** New size. The strokes are rescaled when `keep`; undo history is dropped either way
   *  (its snapshots are the old size). */
  resize(w: number, h: number, keep = true): void {
    if (this.width === w && this.height === h) return;
    const old = this.layer;
    this.layer = mkCanvas(w, h, this.doc);
    if (keep && this.hasStrokes) this.layer.getContext("2d")!.drawImage(old, 0, 0, w, h);
    else this.hasStrokes = false;
    this.stroke = mkCanvas(w, h, this.doc);
    this.comp = mkCanvas(w, h, this.doc);
    this.undoStack.length = 0; this.redoStack.length = 0;
  }

  /** Replace the layer with a picture, scaled to the layer. */
  load(img: CanvasImageSource): void {
    const lctx = this.layer.getContext("2d")!;
    lctx.clearRect(0, 0, this.width, this.height);
    lctx.drawImage(img, 0, 0, this.width, this.height);
    this.hasStrokes = true;
  }

  begin(x: number, y: number, r: number): void {
    this.stroking = true; this.last = null; this.strokeR = 0;
    this.to(x, y, r);
  }

  to(x: number, y: number, r: number): void {
    if (!this.stroking) return;
    const p = this.params();
    const sctx = this.stroke.getContext("2d")!;
    const [cr, cg, cb] = hexToRgb(p.tool === "eraser" ? "#000000" : p.color);
    sctx.strokeStyle = sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    sctx.lineCap = sctx.lineJoin = "round";
    const rc = Math.max(0.5, coreRadius(r, p.hardness));
    this.strokeR = Math.max(this.strokeR, r);
    if (!this.last) {
      sctx.beginPath(); sctx.arc(x, y, rc, 0, Math.PI * 2); sctx.fill();
    } else {
      sctx.lineWidth = rc * 2;
      sctx.beginPath(); sctx.moveTo(this.last[0], this.last[1]); sctx.lineTo(x, y); sctx.stroke();
    }
    this.last = [x, y];
  }

  /** Bake the stroke in progress into the layer. */
  end(): void {
    if (!this.stroking) return;
    this.stroking = false; this.last = null;
    this.snapshot();
    this.composite(this.comp.getContext("2d")!, true);
    const lctx = this.layer.getContext("2d")!;
    lctx.clearRect(0, 0, this.width, this.height);
    lctx.drawImage(this.comp, 0, 0);
    this.stroke.getContext("2d")!.clearRect(0, 0, this.width, this.height);
    this.hasStrokes = true;
    this.onChange();
  }

  /** layer ⊕ current stroke, with the brush opacity - the same op end() bakes in. */
  composite(target: CanvasRenderingContext2D, withStroke: boolean): void {
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
    target.clearRect(0, 0, this.width, this.height);
    target.drawImage(this.layer, 0, 0);
    if (!withStroke) return;
    const p = this.params();
    target.globalAlpha = p.opacity;
    target.globalCompositeOperation = p.tool === "eraser" ? "destination-out" : "source-over";
    const blur = fringeBlur(this.strokeR, p.hardness);
    target.filter = blur >= 0.5 ? `blur(${blur.toFixed(1)}px)` : "none";
    target.drawImage(this.stroke, 0, 0);
    target.filter = "none";
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
  }

  /** What to draw on screen right now: the live composite mid-stroke, else the layer. */
  current(): HTMLCanvasElement {
    if (!this.stroking) return this.layer;
    this.composite(this.comp.getContext("2d")!, true);
    return this.comp;
  }

  /** Wipe the layer (undoable). False when there was nothing to wipe. */
  clear(): boolean {
    if (!this.hasStrokes) return false;
    this.snapshot();
    this.layer.getContext("2d")!.clearRect(0, 0, this.width, this.height);
    this.hasStrokes = false;
    return true;
  }

  undo(): void { this.restore(this.undoStack, this.redoStack); }
  redo(): void { this.restore(this.redoStack, this.undoStack); }

  private snapshot(): void {
    const lctx = this.layer.getContext("2d")!;
    this.undoStack.push(lctx.getImageData(0, 0, this.width, this.height));
    this.redoStack.length = 0;
    const per = this.width * this.height * 4;
    const max = Math.max(3, Math.min(20, Math.floor(this.undoBudget / per)));
    while (this.undoStack.length > max) this.undoStack.shift();
  }

  private restore(from: ImageData[], to: ImageData[]): void {
    const img = from.pop(); if (!img) return;
    const lctx = this.layer.getContext("2d")!;
    to.push(lctx.getImageData(0, 0, this.width, this.height));
    lctx.putImageData(img, 0, 0);
    this.hasStrokes = true;
    this.onChange();
  }
}
