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
 *
 * Clone and heal fill that same blurred stroke with the owner's `clone.src` (what is on
 * screen, snapshotted at the stroke's start so it never samples itself) shifted by the
 * offset, instead of a colour. Heal then solves Poisson on release (`healPatch`): the
 * source keeps its texture and takes the light and colour of the destination's edge,
 * which is Photoshop's healing brush (Pérez et al. 2003, Georgiev 2004).
 */

export type BrushTool = "brush" | "eraser" | "clone" | "heal";
/** Layer px. The stroke at (x, y) copies `src` at (x + dx, y + dy); `src` spans the layer. */
export interface CloneSource { src: CanvasImageSource; dx: number; dy: number }
export interface BrushParams {
  size: number;       // diameter, layer px
  opacity: number;    // 0..1, applied to the whole stroke on release
  hardness: number;   // 0 soft airbrush .. 1 solid edge
  tool: BrushTool;
  color: string;      // #rrggbb; ignored by the eraser
  clone?: CloneSource | null;   // clone / heal only; without it they paint nothing
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

/**
 * Solve the harmonic membrane in place: inside cells take the smooth interpolation of the
 * known cells around them (Laplace with Dirichlet edges; the box edge is Neumann).
 * Coarse-to-fine: each half-size level seeds the next, so SOR only has to fix detail.
 * `f` is 3 interleaved channels.
 */
export function membrane(f: Float32Array, inside: Uint8Array, w: number, h: number): void {
  const n = w * h;
  if (!inside.some((v) => v)) return;
  if (Math.min(w, h) > 8) {
    const cw = (w + 1) >> 1, ch = (h + 1) >> 1;
    const cf = new Float32Array(cw * ch * 3), cnt = new Uint8Array(cw * ch), cin = new Uint8Array(cw * ch);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inside[i]) continue;
      const c = (y >> 1) * cw + (x >> 1);
      cnt[c]++;
      for (let k = 0; k < 3; k++) cf[c * 3 + k] += f[i * 3 + k];
    }
    // A coarse cell is known as soon as one of its pixels is: the mean of those.
    for (let c = 0; c < cw * ch; c++) {
      if (cnt[c]) for (let k = 0; k < 3; k++) cf[c * 3 + k] /= cnt[c];
      else cin[c] = 1;
    }
    membrane(cf, cin, cw, ch);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      const c = (y >> 1) * cw + (x >> 1);
      for (let k = 0; k < 3; k++) f[i * 3 + k] = cf[c * 3 + k];
    }
    sor(f, inside, w, h, 30);
  } else {
    const m = [0, 0, 0]; let known = 0;
    for (let i = 0; i < n; i++) if (!inside[i]) { known++; for (let k = 0; k < 3; k++) m[k] += f[i * 3 + k]; }
    for (let i = 0; i < n; i++) if (inside[i]) for (let k = 0; k < 3; k++) f[i * 3 + k] = known ? m[k] / known : 0;
    sor(f, inside, w, h, 200);
  }
}

function sor(f: Float32Array, inside: Uint8Array, w: number, h: number, iters: number): void {
  const OMEGA = 1.8;
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      if (x > 0) { const j = (i - 1) * 3; r += f[j]; g += f[j + 1]; b += f[j + 2]; c++; }
      if (x < w - 1) { const j = (i + 1) * 3; r += f[j]; g += f[j + 1]; b += f[j + 2]; c++; }
      if (y > 0) { const j = (i - w) * 3; r += f[j]; g += f[j + 1]; b += f[j + 2]; c++; }
      if (y < h - 1) { const j = (i + w) * 3; r += f[j]; g += f[j + 1]; b += f[j + 2]; c++; }
      const j = i * 3;
      f[j] += OMEGA * (r / c - f[j]); f[j + 1] += OMEGA * (g / c - f[j + 1]); f[j + 2] += OMEGA * (b / c - f[j + 2]);
    }
  }
}

/**
 * Healing brush on RGBA pixels of one box: `s` the shifted source, `d` the destination,
 * `m` the stroke (its alpha). Inside the stroke the result is the source plus the membrane
 * of (destination - source) on its edge; the alpha is the stroke's, so the fringe still
 * fades out. Where the source falls off the picture nothing is painted, as with clone.
 */
export function healPatch(s: Uint8ClampedArray, d: Uint8ClampedArray, m: Uint8ClampedArray,
                          w: number, h: number): Uint8ClampedArray {
  const n = w * h;
  const inside = new Uint8Array(n), f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    inside[i] = m[i * 4 + 3] > 0 && s[i * 4 + 3] === 255 ? 1 : 0;
    // ponytail: off-picture source pixels count as "no change" on the edge; only matters
    // when a heal reaches past the picture's border.
    if (s[i * 4 + 3]) for (let k = 0; k < 3; k++) f[i * 3 + k] = d[i * 4 + k] - s[i * 4 + k];
  }
  membrane(f, inside, w, h);
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = s[i * 4 + k] + f[i * 3 + k];
    out[i * 4 + 3] = m[i * 4 + 3];
  }
  return out;
}

export class BrushLayer {
  layer: HTMLCanvasElement;
  stroke: HTMLCanvasElement;
  comp: HTMLCanvasElement;
  patch: HTMLCanvasElement;   // the clone source cut to the stroke
  hasStrokes = false;
  stroking = false;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private last: [number, number] | null = null;
  private strokeR = 0;   // brush radius of the stroke in progress, for the blur at composite time
  private box = [0, 0, 0, 0];   // layer px the stroke in progress covers: x0, y0, x1, y1
  private healed: HTMLCanvasElement | null = null;

  /** `onChange` runs after a committed stroke, undo or redo: the owner saves and redraws. */
  constructor(w: number, h: number, private params: () => BrushParams,
              private onChange: () => void = () => {},
              private doc: Document = document,
              private undoBudget = 256 * 1024 * 1024) {
    this.layer = mkCanvas(w, h, doc);
    this.stroke = mkCanvas(w, h, doc);
    this.comp = mkCanvas(w, h, doc);
    this.patch = mkCanvas(w, h, doc);
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
    this.patch = mkCanvas(w, h, this.doc);
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
    this.box = [Infinity, Infinity, -Infinity, -Infinity];
    this.to(x, y, r);
  }

  to(x: number, y: number, r: number): void {
    if (!this.stroking) return;
    const p = this.params();
    const sctx = this.stroke.getContext("2d")!;
    const [cr, cg, cb] = hexToRgb(p.tool === "brush" ? p.color : "#000000");
    sctx.strokeStyle = sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    sctx.lineCap = sctx.lineJoin = "round";
    const rc = Math.max(0.5, coreRadius(r, p.hardness));
    this.strokeR = Math.max(this.strokeR, r);
    const b = this.box;
    b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r);
    b[2] = Math.max(b[2], x + r); b[3] = Math.max(b[3], y + r);
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
    const p = this.params();
    if (p.tool === "heal" && p.clone) this.healed = this.heal(p, p.clone);
    this.composite(this.comp.getContext("2d")!, true);
    this.healed = null;
    const lctx = this.layer.getContext("2d")!;
    lctx.clearRect(0, 0, this.width, this.height);
    lctx.drawImage(this.comp, 0, 0);
    this.stroke.getContext("2d")!.clearRect(0, 0, this.width, this.height);
    this.hasStrokes = true;
    this.onChange();
  }

  /** Lasso: fill a closed outline as one stroke, so opacity, softness (the brush's own
   *  fringe at radius `r`), the eraser and undo all behave as for a brush stroke. */
  fill(pts: Array<[number, number]>, r: number): void {
    if (pts.length < 3) return;
    const p = this.params();
    const sctx = this.stroke.getContext("2d")!;
    const [cr, cg, cb] = hexToRgb(p.tool === "brush" ? p.color : "#000000");
    sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    sctx.beginPath();
    sctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i][0], pts[i][1]);
    sctx.closePath(); sctx.fill();
    this.stroking = true; this.last = null; this.strokeR = r;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    this.box = [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
    this.end();
  }

  /** Draw a picture over the layer (undoable, reported through onChange). */
  paste(img: CanvasImageSource): void {
    this.snapshot();
    this.layer.getContext("2d")!.drawImage(img, 0, 0, this.width, this.height);
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
    if (this.healed) target.drawImage(this.healed, 0, 0);
    else if (p.clone && (p.tool === "clone" || p.tool === "heal")) target.drawImage(this.clonePatch(p, p.clone), 0, 0);
    else if (p.tool === "brush" || p.tool === "eraser") {
      target.filter = this.blurFilter(p);
      target.drawImage(this.stroke, 0, 0);
      target.filter = "none";
    }
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
  }

  private blurFilter(p: BrushParams): string {
    const blur = fringeBlur(this.strokeR, p.hardness);
    return blur >= 0.5 ? `blur(${blur.toFixed(1)}px)` : "none";
  }

  /** The source, shifted, cut to the blurred stroke. Also the live preview of a heal. */
  private clonePatch(p: BrushParams, c: CloneSource): HTMLCanvasElement {
    const x = this.patch.getContext("2d")!;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, this.width, this.height);
    x.drawImage(c.src, -c.dx, -c.dy, this.width, this.height);
    x.globalCompositeOperation = "destination-in";
    x.filter = this.blurFilter(p);
    x.drawImage(this.stroke, 0, 0);
    x.filter = "none";
    x.globalCompositeOperation = "source-over";
    return this.patch;
  }

  /** The finished heal, in `patch`: only the stroke's box goes through the solver. */
  private heal(p: BrushParams, c: CloneSource): HTMLCanvasElement {
    const pad = Math.ceil(fringeBlur(this.strokeR, p.hardness) * 3) + 2;
    const x0 = Math.max(0, Math.floor(this.box[0]) - pad), y0 = Math.max(0, Math.floor(this.box[1]) - pad);
    const x1 = Math.min(this.width, Math.ceil(this.box[2]) + pad), y1 = Math.min(this.height, Math.ceil(this.box[3]) + pad);
    const w = x1 - x0, h = y1 - y0;
    if (w < 1 || h < 1) return this.clonePatch(p, c);
    const x = this.patch.getContext("2d")!;
    const grab = (draw: () => void) => {
      x.clearRect(0, 0, this.width, this.height); draw();
      return x.getImageData(x0, y0, w, h).data;
    };
    const m = grab(() => { x.filter = this.blurFilter(p); x.drawImage(this.stroke, 0, 0); x.filter = "none"; });
    const s = grab(() => x.drawImage(c.src, -c.dx, -c.dy, this.width, this.height));
    const d = grab(() => x.drawImage(c.src, 0, 0, this.width, this.height));
    const out = x.createImageData(w, h);
    out.data.set(healPatch(s, d, m, w, h));
    x.clearRect(0, 0, this.width, this.height);
    x.putImageData(out, x0, y0);
    return this.patch;
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
