/**
 * 😺NKD Crop / Outpaint — draggable crop rectangle that can extend past the source edge.
 *
 * The `region` STRING widget (hidden, `multiline=false` so it stays a real canvas widget —
 * see the nkd-node skill's textarea trap) is the source of truth; this DOM widget is only a
 * view onto it, same split as the `timeline` widget.
 *
 * Coordinates are kept in SOURCE PIXELS (not normalised) while dragging, then written out as
 * the fractions `_parse_region` on the Python side expects.
 *
 * `mode` (Crop | Outpaint) decides whether the margin band exists at all — Crop mode has no
 * outpaint headroom to drag into, box stays clamped to the source. `divisible_by` snaps the
 * box to a pixel grid live (`snapBox`, mirrors `_snap_bbox` server-side) — the same idea as
 * KJ's Transform node, important for models that quantise the canvas (MiniMax).
 *
 * Rotation: the box carries an `angle` (degrees) around its own center, dragged from the
 * handle above it. Hit-testing and the resize math never learned a second, rotated code
 * path — a pointer position is inverse-rotated into the box's own frame FIRST, so everything
 * downstream (`hitTest`'s corner/edge tests, the resize `switch` in `pointermove`) stays the
 * exact axis-aligned code it always was. Only `draw()` forward-rotates, for rendering.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { resolveSource, slotKind, viewUrl, type MediaRef } from "./mediaProbe";
import { findW, hideWidget, mountDomWidget, setWidgetVisible } from "./domHost";

const NODE_NAME = "NKDCrop";
const EXT_NAME = "NKD.BasicTools.Crop";

console.log("[NKD Crop] rev 1.0.0");

// ── Layout constants ──────────────────────────────────────────────────────────

const CANVAS_W = 180;   // startup guess only (see `liveW`) — the node should shrink like the
                        // native Load Image / Preview Image widgets do, not stay pinned wide
const MARGIN = 0.5;          // outpaint headroom on each side, as a fraction of source size
const HANDLE_R = 5;
const HANDLE_HIT = 10;
const BAR_H = 30;
const TRANSPORT_H = 26;
const ROTATE_OFFSET = 22;   // px above the box's (unrotated) top edge, canvas space
const ROTATE_BASE_DEG = -90; // atan2 angle of "straight up" — angle 0 points the handle here
const EDGE_SNAP_PX = 8;      // canvas px within which a box edge sticks to a source edge

const ASPECTS: Record<string, number | null> = {
  Free: null, "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16,
  "5:4": 5 / 4, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9,
};

const C = {
  bg: "#111318", srcBorder: "rgba(255,255,255,0.28)",
  marginHatch: "rgba(255,255,255,0.04)",
  rect: "#4ab4ff", rectFill: "rgba(74,180,255,0.08)",
  outpaintHatch: "rgba(255,176,32,0.28)",
  handle: "#4ab4ff", handleHover: "#ffd166",
  outsideDim: "rgba(0,0,0,0.55)", grid: "rgba(255,255,255,0.35)",
};

const DRAW_MIN_PX_FRAC = 0.02; // below this fraction of the source's shorter side, a
                               // freehand draw counts as an accidental click, not a box

type Box = { x0: number; y0: number; x1: number; y1: number }; // source-pixel space

function defaultBox(w: number, h: number): Box {
  return { x0: 0, y0: 0, x1: w, y1: h };
}

function parseRegion(json: string, w: number, h: number): { box: Box; angle: number } {
  if (!json) return { box: defaultBox(w, h), angle: 0 };
  try {
    const d = JSON.parse(json);
    const x = Number(d.x) || 0, y = Number(d.y) || 0;
    const bw = Number(d.w) || 1, bh = Number(d.h) || 1;
    const angle = Number(d.angle) || 0;
    return { box: { x0: x * w, y0: y * h, x1: (x + bw) * w, y1: (y + bh) * h }, angle };
  } catch {
    return { box: defaultBox(w, h), angle: 0 };
  }
}

function serialiseRegion(box: Box, angle: number, w: number, h: number): string {
  if (w <= 0 || h <= 0) return "";
  return JSON.stringify({
    x: box.x0 / w, y: box.y0 / h, w: (box.x1 - box.x0) / w, h: (box.y1 - box.y0) / h, angle,
  });
}

const boxCenter = (b: Box): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

/** Rotate `(px,py)` by `deg` around `(cx,cy)` — screen convention (Y down), used both to
 *  forward-rotate the box for drawing and to inverse-rotate a pointer position (negate `deg`)
 *  back into the box's own unrotated frame. */
function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t), sin = Math.sin(t);
  const dx = px - cx, dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/**
 * Grow the box so both axes land on a multiple of `multiple` — the pixel-grid alignment KJ's
 * Transform node does, important for models like MiniMax that quantise the canvas. Grows
 * evenly on both sides; when a `clamp*` limit is given, growth that would cross an edge is
 * redirected to the other side instead (never leaves `[0, clamp]`) — Crop mode has an edge to
 * respect, Outpaint doesn't. Mirrors `_snap_bbox` in `nkd_crop.py`; keep the two in lock-step.
 */
function snapBox(b: Box, multiple: number, clampW: number | null, clampH: number | null): Box {
  const grow = (a: number, bb: number, limit: number | null): [number, number] => {
    const size = bb - a;
    const rem = ((size % multiple) + multiple) % multiple;
    if (rem === 0) return [a, bb];
    const extra = multiple - rem;
    const addBefore = Math.floor(extra / 2);
    let na = a - addBefore, nb = bb + (extra - addBefore);
    if (limit != null) {
      if (na < 0) { nb += -na; na = 0; }
      if (nb > limit) { na -= (nb - limit); nb = limit; }
      na = Math.max(0, na);
    }
    return [na, nb];
  };
  const [x0, x1] = grow(b.x0, b.x1, clampW);
  const [y0, y1] = grow(b.y0, b.y1, clampH);
  return { x0, y0, x1, y1 };
}

/** Grid snap for a ROTATED box: grow the box's own width/height, centered — no edge to
 *  clamp against once it's rotated (its footprint in source space isn't the axis-aligned
 *  `[x0,x1]` range any more). Mirrors `_snap_bbox_rotated` in `nkd_crop.py`. */
function snapBoxRotated(b: Box, multiple: number): Box {
  const [cx, cy] = boxCenter(b);
  const grow = (v: number): number => {
    const rem = ((v % multiple) + multiple) % multiple;
    return rem === 0 ? v : v + (multiple - rem);
  };
  const w = grow(b.x1 - b.x0), h = grow(b.y1 - b.y0);
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

/** Stick box edges to the SOURCE edges (0 / w / h) when they come within `tol` source px
 *  FROM INSIDE the source only. Outside there is no pull at all, so dragging a box out
 *  into the outpaint band never sticks (Neko: "no puedo expandir igual que antes" when it
 *  snapped from both sides) — to land an edge exactly on the frame from outside, cross
 *  slightly in and it snaps back out. `edges` limits which sides may snap (a resize
 *  handle only moves its own sides); for a move all four are candidates but the box must
 *  shift as a whole, so per axis the closest candidate wins and both sides move together.
 *  Neko: outpaint a 2:3 to 1:1 by locking the ratio and gluing the box to the top and
 *  bottom edges — reachable by hand before, never exact. */
function snapToSourceEdges(b: Box, tol: number, w: number, h: number, edges: string, move: boolean): Box {
  const out = { ...b };
  const nearest = (v: number, lim: number): number | null => {
    if (v < 0 || v > lim) return null;
    let best: number | null = null;
    for (const t of [0, lim]) if (Math.abs(v - t) <= tol && (best == null || Math.abs(v - t) < Math.abs(v - best))) best = t;
    return best;
  };
  if (move) {
    const sx = nearest(out.x0, w), ex = nearest(out.x1, w);
    const dx = sx != null ? sx - out.x0 : ex != null ? ex - out.x1 : 0;
    const sy = nearest(out.y0, h), ey = nearest(out.y1, h);
    const dy = sy != null ? sy - out.y0 : ey != null ? ey - out.y1 : 0;
    return { x0: out.x0 + dx, y0: out.y0 + dy, x1: out.x1 + dx, y1: out.y1 + dy };
  }
  if (edges.includes("w")) out.x0 = nearest(out.x0, w) ?? out.x0;
  if (edges.includes("e")) out.x1 = nearest(out.x1, w) ?? out.x1;
  if (edges.includes("n")) out.y0 = nearest(out.y0, h) ?? out.y0;
  if (edges.includes("s")) out.y1 = nearest(out.y1, h) ?? out.y1;
  return out;
}

/** Crop mode's hard guarantee: the box's ROTATED footprint never leaves `[0,w]x[0,h]` —
 *  translate it back in first (cheap, keeps the size the user picked), and only shrink it
 *  (around its own center, so rotating in place doesn't also recenter it) if translating
 *  alone can't make it fit — a box already close to the full source, rotated. A few
 *  iterations because shrinking changes the footprint, which can re-open room to translate. */
function containRotatedBox(b: Box, deg: number, w: number, h: number): Box {
  let out = b;
  for (let i = 0; i < 6; i++) {
    const [cx, cy] = boxCenter(out);
    const corners: [number, number][] = [
      [out.x0, out.y0], [out.x1, out.y0], [out.x1, out.y1], [out.x0, out.y1],
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of corners) {
      const [rx, ry] = rotatePoint(px, py, cx, cy, deg);
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const bw = maxX - minX, bh = maxY - minY;
    if (bw > w + 1e-6 || bh > h + 1e-6) {
      const scale = Math.min(w / bw, h / bh) * 0.999;
      out = {
        x0: cx + (out.x0 - cx) * scale, y0: cy + (out.y0 - cy) * scale,
        x1: cx + (out.x1 - cx) * scale, y1: cy + (out.y1 - cy) * scale,
      };
      continue;
    }
    let dx = 0, dy = 0;
    if (minX < 0) dx = -minX; else if (maxX > w) dx = w - maxX;
    if (minY < 0) dy = -minY; else if (maxY > h) dy = h - maxY;
    if (dx === 0 && dy === 0) break;
    out = { x0: out.x0 + dx, y0: out.y0 + dy, x1: out.x1 + dx, y1: out.y1 + dy };
  }
  return out;
}

type Handle = "move" | "rotate" | "draw" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function registerCrop(): void {
  comfyApp.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdCropWrapped) return;
      nodeType.prototype.__nkdCropWrapped = true;

      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setupCropWidget(this);
        return r;
      };
    },
  });
}

function setupCropWidget(node: any): void {
  const regionW = node.widgets?.find((w: any) => w.name === "region");
  if (!regionW) return;
  hideWidget(regionW);

  // View-only state — not an execute() input, so it lives in properties, same as the
  // timeline's zoom/scroll (see nkd_timeline.py's cache-signature note).
  node.properties.nkdCropAspect = node.properties.nkdCropAspect ?? "Free";

  let srcW = 512, srcH = 512;                 // placeholder until a source resolves
  let srcEl: HTMLImageElement | HTMLVideoElement | null = null;
  let { box, angle } = parseRegion(regionW.value, srcW, srcH);
  // Inactive (no box drawn yet) shows the plain image and nothing else — Neko: "el recuadro
  // no esté activo hasta pintarlo". A loaded workflow with a real saved region starts active;
  // a brand-new node starts empty and the first drag anywhere draws the box (see hitTest).
  let boxActive = !!regionW.value;
  let lastRef: MediaRef | null = null;
  let playing = false;
  let rafId = 0;

  const root = document.createElement("div");
  root.className = "nkd-crop-wrap";
  root.style.cssText = "display:flex;flex-direction:column;background:#111318;" +
    "border:1px solid #2a2d36;border-radius:6px;overflow:hidden;width:100%;";

  const bar = document.createElement("div");
  bar.style.cssText = `display:flex;align-items:center;gap:6px;height:${BAR_H}px;` +
    "padding:0 8px;background:#1a1c22;border-bottom:1px solid #2a2d36;" +
    "font:11px sans-serif;color:#c8d0e0;";
  // `flex:0 0 auto` on every bar child is load-bearing, not cosmetic: `barMinWidth()` below
  // sums their offsetWidths to get the toolbar's INTRINSIC width, and a shrinking flex item
  // would report whatever it was squeezed to instead of what it needs.
  const label = document.createElement("span");
  label.textContent = "Aspect";
  label.style.cssText = "opacity:0.6;flex:0 0 auto;";
  const select = document.createElement("select");
  select.style.cssText = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;" +
    "border-radius:4px;font:11px sans-serif;padding:2px 4px;flex:0 0 auto;";
  for (const k of Object.keys(ASPECTS)) {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = k;
    select.appendChild(opt);
  }
  select.value = node.properties.nkdCropAspect;
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = "margin-left:auto;background:#252830;color:#c8d0e0;" +
    "border:1px solid #3a3d46;border-radius:4px;font:11px sans-serif;padding:2px 8px;" +
    "cursor:pointer;flex:0 0 auto;";
  bar.append(label, select, resetBtn);

  const BAR_PAD_X = 16, BAR_GAP = 6;
  /**
   * The toolbar's INTRINSIC width — what it needs, not what it currently is.
   *
   * This used to be `bar.scrollWidth`, and that was the bug behind "no puedo encoger el
   * nodo": for an element whose content fits, `scrollWidth` is the element's own LAYOUT
   * width, and the bar is `width:100%` of the node. So the reported minimum was always the
   * node's current width — `mountDomWidget` fed it into `minNodeWidth()`, `onResize`
   * clamped the node to it, and the node could never get smaller than it already was (only
   * creeping down a few px per event, by the gutter arithmetic). Summing the children is
   * independent of how wide the bar happens to be laid out.
   */
  const barMinWidth = () => {
    const kids = Array.from(bar.children) as HTMLElement[];
    const content = kids.reduce((sum, k) => sum + k.offsetWidth, 0);
    return content + BAR_PAD_X + BAR_GAP * Math.max(0, kids.length - 1);
  };

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;cursor:crosshair;";

  // Transport: only shown for a video source. Scrubbing/playing just needs to keep
  // redrawing the canvas from the same <video> element `draw()` already reads —
  // no separate player, the crop rect stays visible the whole time.
  const transport = document.createElement("div");
  transport.style.cssText = "display:none;align-items:center;gap:6px;height:26px;" +
    "padding:0 8px;background:#1a1c22;border-top:1px solid #2a2d36;";
  const playBtn = document.createElement("button");
  playBtn.textContent = "▶";
  playBtn.style.cssText = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;" +
    "border-radius:4px;font:11px sans-serif;padding:2px 6px;cursor:pointer;width:26px;";
  const scrub = document.createElement("input");
  scrub.type = "range"; scrub.min = "0"; scrub.max = "1000"; scrub.value = "0";
  scrub.style.cssText = "flex:1;";
  transport.append(playBtn, scrub);

  root.append(bar, canvas, transport);

  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  // Crop mode has no reason to spend canvas space on outpaint headroom — "el marco externo
  // no siempre hace falta" — so the margin band only exists in Outpaint mode, or while a
  // rotated box actually needs the room.
  const modeW = findW(node, "mode");
  const isOutpaint = () => modeW?.value === "Outpaint";
  const isRotated = () => Math.abs(angle) > 0.01;

  /** The box's ROTATED bounding extent, in source pixels. */
  function rotatedBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const [cx, cy] = boxCenter(box);
    const corners: [number, number][] = [
      [box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1],
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of corners) {
      const [rx, ry] = rotatePoint(px, py, cx, cy, angle);
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    return { minX, maxX, minY, maxY };
  }

  /** How far the box's rotated bounding extent currently reaches past the source, as a
   *  fraction of the smaller source dimension. A 2° nudge and a full outpaint both set
   *  `isRotated()`/`isOutpaint()`, but they don't need the same amount of canvas headroom —
   *  this is what the amber "generate" hatch keys off (it must track the REAL overflow,
   *  never earlier — that band means "this will be generated"). `margin()` below uses a
   *  look-ahead version instead, so the canvas has room BEFORE the box gets there. */
  function overflowFraction(): number {
    const { minX, maxX, minY, maxY } = rotatedBounds();
    const overflow = Math.max(0, -minX, maxX - srcW, -minY, maxY - srcH);
    return overflow / Math.max(1, Math.min(srcW, srcH));
  }

  // Fraction of the source size the box's bounding extent has to still be from an edge
  // before the margin band starts growing to meet it — Neko: "que muestre el margen antes
  // de necesitarlo", so a drag toward the edge never hits a hard wall of canvas suddenly
  // needing to expand out from under the cursor.
  const EDGE_LOOKAHEAD = 0.12;

  function marginNeedFraction(): number {
    const { minX, maxX, minY, maxY } = rotatedBounds();
    const buffer = EDGE_LOOKAHEAD * Math.max(1, Math.min(srcW, srcH));
    const need = Math.max(0, buffer - minX, maxX - (srcW - buffer),
                          buffer - minY, maxY - (srcH - buffer));
    return need / Math.max(1, Math.min(srcW, srcH));
  }

  // Two growth regimes, not one long ramp: below TIER1_MAX the margin tracks the overflow
  // 1:1 (Neko: "un pequeño salto solo hasta donde necesito" — the precise, small-jump feel
  // from before raising the ceiling). A single 1:1 ramp all the way to a high ceiling made
  // that SAME precision brutal once past ~1.0: because canvas width is `srcW*(1+2*margin)`,
  // each extra unit of margin buys proportionally less image, so the picture collapsed fast
  // right when the box was hardest to place. Past TIER1_MAX, extra overflow only adds
  // TIER2_RATE margin per unit instead of 1:1 — still grows for genuinely extreme cases, just
  // gently enough to stay controllable — up to TIER2_MAX.
  const TIER1_MAX = 0.6;
  const TIER2_MAX = 2.5;
  const TIER2_RATE = 0.35;
  const MARGIN_SLACK = 1.25; // reserve a bit more than the CURRENT overflow, so the next
                             // small drag doesn't clip before the following redraw catches up
  const marginFor = (want: number): number =>
    want <= TIER1_MAX ? want : Math.min(TIER2_MAX, TIER1_MAX + (want - TIER1_MAX) * TIER2_RATE);
  // Crop mode is now geometrically GUARANTEED to stay inside the source (`finalizeBox`'s
  // `containRotatedBox`, rotated or not) — so it never needs headroom, full stop. Only
  // Outpaint mode can ever have anything past the edge, and keeps its resting headroom (the
  // "grab a handle and drag past the edge" affordance) plus the look-ahead/tiered growth.
  const margin = () => {
    if (!isOutpaint()) return 0;
    const need = marginNeedFraction() * MARGIN_SLACK;
    return marginFor(Math.max(MARGIN, need));
  };

  const divisibleByW = findW(node, "divisible_by");
  const gridMultiple = () => {
    const v = divisibleByW?.value;
    return v && v !== "disabled" ? parseInt(v, 10) : null;
  };

  // LOGICAL (CSS px) canvas width — tracks the element's ACTUAL current width. `clientWidth`
  // forces a layout read, but only pays for one when a resize is genuinely pending; the
  // ResizeObserver this used to feed instead COMPETED with the one already inside
  // `mountDomWidget` (watching the same content), each one's redraw nudging the other's
  // observed box — the "fights back" drag lag Neko reported. One clock, not two.
  // CANVAS_W is just the startup guess, before the element has ever been laid out.
  function canvasSize(): [number, number] {
    const m = margin();
    const cw = canvas.clientWidth || CANVAS_W;
    const ch = cw * (srcH * (1 + 2 * m)) / (srcW * (1 + 2 * m));
    return [cw, ch];
  }

  function scaleAndOrigin() {
    const m = margin();
    const [cw] = canvasSize();
    const scale = cw / (srcW * (1 + 2 * m));
    return { scale, ox: m * srcW * scale, oy: m * srcH * scale };
  }

  const toCanvas = (px: number, py: number) => {
    const { scale, ox, oy } = scaleAndOrigin();
    return [ox + px * scale, oy + py * scale];
  };
  const toSource = (cx: number, cy: number) => {
    const { scale, ox, oy } = scaleAndOrigin();
    return [(cx - ox) / scale, (cy - oy) / scale];
  };
  // Alt disables the edge snap, as in any layout tool. Rotated boxes never snap: `next`
  // lives in the box's LOCAL frame there, the source edges in the global one.
  const edgeSnapTol = (e: PointerEvent): number =>
    e.altKey || isRotated() ? 0 : EDGE_SNAP_PX / scaleAndOrigin().scale;

  /**
   * NO explicit `canvas.style.height` — that was the bug (Neko: "al estirar el nodo se
   * estira la imagen"). A <canvas> is a replaced element like <img>: with only CSS width
   * set, its displayed height follows its OWN intrinsic ratio (the width/height ATTRIBUTES
   * below), exactly like the native Preview Image widget. So the buffer's attribute RATIO
   * must always equal the scene's aspect (srcH/srcW, margin cancels) — that alone kills the
   * distortion — while its ABSOLUTE resolution follows the canvas's live CSS width × dpr, so
   * a small node renders small/cheap and a big node renders sharp, never a stretched blur of
   * a fixed 380px buffer.
   */
  function syncCanvasBuffer() {
    const [cw, ch] = canvasSize();
    const d = dpr();
    const w = Math.max(1, Math.round(cw * d)), h = Math.max(1, Math.round(cw * d * (ch / cw)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(w / cw, 0, 0, h / ch, 0, 0);
    return ctx;
  }

  // Coalesces to one draw per animation frame: a resize drag or a fast pointermove can fire
  // far more often than the browser paints, so extra calls in the same frame are pure waste.
  let drawScheduled = false;
  function scheduleDraw(): void {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => { drawScheduled = false; draw(); });
  }

  function draw() {
    const [cw, ch] = canvasSize();
    const ctx = syncCanvasBuffer();
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cw, ch);

    // The source rect and its margin band.
    const [sx0, sy0] = toCanvas(0, 0);
    const [sx1, sy1] = toCanvas(srcW, srcH);
    if (srcEl) {
      try { ctx.drawImage(srcEl as any, sx0, sy0, sx1 - sx0, sy1 - sy0); } catch { /* not ready */ }
    } else {
      ctx.fillStyle = "#1a1c22";
      ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    }
    ctx.strokeStyle = C.srcBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, sx1 - sx0 - 1, sy1 - sy0 - 1);

    // Nothing drawn yet: plain image, no box, no handles — Neko: "el recuadro no esté
    // activo hasta pintarlo". `hitTest` already routes every click here into drawing one.
    if (!boxActive) return;

    // The crop/outpaint rectangle — rotated around its own (canvas-space) center. Hit-testing
    // undoes this same rotation on the POINTER instead (see hitTest), so this is the only
    // place `angle` is applied forward.
    const [rx0, ry0] = toCanvas(box.x0, box.y0);
    const [rx1, ry1] = toCanvas(box.x1, box.y1);
    const [ccx, ccy] = [(rx0 + rx1) / 2, (ry0 + ry1) / 2];
    const rw = rx1 - rx0, rh = ry1 - ry0;
    const corners: [number, number][] = [[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1]]
      .map(([x, y]) => rotatePoint(x, y, ccx, ccy, angle));
    // Traces the quad as a SUBPATH — no beginPath of its own, so it can be combined with
    // another subpath (the dim overlay below needs the quad AND the full canvas rect in one
    // path for evenodd to punch a hole). `strokeQuad` wraps this with its own beginPath for
    // every other use (clip, stroke), where a single subpath is exactly what's wanted.
    const addQuadSubpath = () => {
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
    };
    const strokeQuad = () => { ctx.beginPath(); addQuadSubpath(); };

    // Dim everything OUTSIDE the box first, so the kept area reads clearly against the
    // discarded one — the box's own fill/stroke/handles draw on top of this, undimmed.
    // BUG FIXED HERE (Neko: "la parte oscura debería ser la de fuera del recuadro, no
    // dentro"): this used to call `strokeQuad()`, whose OWN `beginPath()` wiped the
    // `ctx.rect(...)` added a line above — leaving only the quad as a single subpath, which
    // evenodd just fills normally (the INSIDE). `addQuadSubpath` never resets the path, so
    // both subpaths survive into the one `fill("evenodd")` call.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    addQuadSubpath();
    ctx.fillStyle = C.outsideDim;
    ctx.fill("evenodd");
    ctx.restore();

    ctx.save();
    strokeQuad();
    ctx.clip();
    ctx.fillStyle = C.rectFill;
    ctx.fill();
    // Amber hatch over the part of the rect outside the source — same "generate here" visual
    // language as NKD Timeline's gap band. Keyed off the box's ROTATED extent actually
    // reaching past the source (not "is rotated at all" — a 2° nudge that never leaves the
    // source has nothing to generate, and shouldn't look like it does). Drawn in the box's
    // OWN frame (rotate the canvas instead of each line) since the clip is already the
    // rotated quad.
    if (overflowFraction() > 1e-4) {
      ctx.translate(ccx, ccy);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.translate(-ccx, -ccy);
      ctx.strokeStyle = C.outpaintHatch;
      ctx.lineWidth = 1;
      const step = 8;
      for (let d2 = -rh; d2 < rw; d2 += step) {
        ctx.beginPath();
        ctx.moveTo(rx0 + d2, ry0);
        ctx.lineTo(rx0 + d2 + rh, ry0 + rh);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Rule-of-thirds grid, for composition — rotated with the box (same canvas-rotate trick
    // as the hatch above, so the lines are just drawn in the box's own unrotated coords).
    ctx.save();
    ctx.translate(ccx, ccy);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.translate(-ccx, -ccy);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let k = 1; k <= 2; k++) {
      const gx = rx0 + (rw * k) / 3;
      ctx.beginPath(); ctx.moveTo(gx, ry0); ctx.lineTo(gx, ry1); ctx.stroke();
      const gy = ry0 + (rh * k) / 3;
      ctx.beginPath(); ctx.moveTo(rx0, gy); ctx.lineTo(rx1, gy); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = C.rect;
    ctx.lineWidth = 1.5;
    strokeQuad();
    ctx.stroke();

    // Handles — all 8 plus rotate, always: an aspect-locked edge handle now scales the OTHER
    // axis through it (see applyAspect) instead of being hidden, so there's no dead handle.
    const localPts: [number, number, Handle][] = [
      [rx0, ry0, "nw"], [rx1, ry0, "ne"], [rx0, ry1, "sw"], [rx1, ry1, "se"],
      [(rx0 + rx1) / 2, ry0, "n"], [(rx0 + rx1) / 2, ry1, "s"],
      [rx0, (ry0 + ry1) / 2, "w"], [rx1, (ry0 + ry1) / 2, "e"],
    ];
    ctx.fillStyle = C.handle;
    for (const [lx, ly] of localPts) {
      const [hx, hy] = rotatePoint(lx, ly, ccx, ccy, angle);
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotation handle, above the (rotated) top edge, joined by a thin line.
    const [topX, topY] = rotatePoint((rx0 + rx1) / 2, ry0, ccx, ccy, angle);
    const [hubX, hubY] = rotatePoint((rx0 + rx1) / 2, ry0 - ROTATE_OFFSET, ccx, ccy, angle);
    ctx.strokeStyle = C.rect;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(hubX, hubY);
    ctx.stroke();
    ctx.fillStyle = C.handle;
    ctx.beginPath();
    ctx.arc(hubX, hubY, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Video transport (play/pause + scrub) ────────────────────────────────────
  // Only the same `draw()` loop that already reads `srcEl` — a playing/scrubbed <video>
  // just means the next drawImage() picks up a different frame, crop rect and all.

  function stopPlayback(): void {
    playing = false;
    playBtn.textContent = "▶";
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (srcEl instanceof HTMLVideoElement) srcEl.pause();
  }

  function stepPlayback(): void {
    if (!playing) return;
    draw();
    const v = srcEl as HTMLVideoElement;
    if (v.duration > 0) scrub.value = String(Math.round((v.currentTime / v.duration) * 1000));
    rafId = requestAnimationFrame(stepPlayback);
  }

  function setPlaying(p: boolean): void {
    if (!(srcEl instanceof HTMLVideoElement)) return;
    if (p) {
      playing = true;
      playBtn.textContent = "⏸";
      srcEl.play().catch(() => { playing = false; playBtn.textContent = "▶"; });
      rafId = requestAnimationFrame(stepPlayback);
    } else {
      stopPlayback();
    }
  }

  playBtn.addEventListener("click", () => setPlaying(!playing));
  scrub.addEventListener("input", () => {
    if (!(srcEl instanceof HTMLVideoElement)) return;
    stopPlayback();
    if (srcEl.duration > 0) srcEl.currentTime = (Number(scrub.value) / 1000) * srcEl.duration;
    draw();
  });

  // ── Source resolution ──────────────────────────────────────────────────────

  // No probe endpoint here (that's Preview Tools' PyAV route) — the <img>/<video> element's
  // own natural size is enough, and it's free once the element has loaded anyway.
  function loadThumb(ref: MediaRef) {
    const kind = slotKind(node, "image");
    const url = viewUrl(ref);
    stopPlayback();
    if (kind === "video") {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "metadata"; v.loop = true;
      v.src = url;
      transport.style.display = "flex";
      scrub.value = "0";
      v.onloadeddata = () => { srcEl = v; srcW = v.videoWidth || srcW; srcH = v.videoHeight || srcH; draw(); };
      srcEl = null;
    } else {
      transport.style.display = "none";
      const img = new Image();
      img.onload = () => { srcEl = img; srcW = img.naturalWidth || srcW; srcH = img.naturalHeight || srcH; draw(); };
      img.src = url;
    }
  }

  function refreshSource() {
    const ref = resolveSource(node, "image");
    if (!ref || (lastRef && ref.filename === lastRef.filename
                 && ref.subfolder === lastRef.subfolder && ref.type === lastRef.type)) {
      return;
    }
    lastRef = ref;
    srcEl = null;
    loadThumb(ref);
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  function hitTest(cx: number, cy: number): Handle {
    // Nothing to hit yet — every click anywhere draws a fresh box (see the "draw" case in
    // pointerdown/pointermove). Neko: "al arrastrar sobre una zona vacía... pueda dibujar
    // directamente el recuadro".
    if (!boxActive) return "draw";

    const [rx0, ry0] = toCanvas(box.x0, box.y0);
    const [rx1, ry1] = toCanvas(box.x1, box.y1);
    const [ccx, ccy] = [(rx0 + rx1) / 2, (ry0 + ry1) / 2];

    // Rotation handle lives OUTSIDE the box, in FORWARD-rotated space — check it first.
    const [hubX, hubY] = rotatePoint((rx0 + rx1) / 2, ry0 - ROTATE_OFFSET, ccx, ccy, angle);
    if (Math.hypot(cx - hubX, cy - hubY) <= HANDLE_HIT) return "rotate";

    // Everything else: undo the rotation on the POINTER, so the rest of this function (and
    // the resize math in pointermove) stays exactly the axis-aligned code it always was.
    const [lx, ly] = rotatePoint(cx, cy, ccx, ccy, -angle);
    const near = (ax: number, ay: number) => Math.hypot(lx - ax, ly - ay) <= HANDLE_HIT;
    if (near(rx0, ry0)) return "nw";
    if (near(rx1, ry0)) return "ne";
    if (near(rx0, ry1)) return "sw";
    if (near(rx1, ry1)) return "se";
    if (near((rx0 + rx1) / 2, ry0)) return "n";
    if (near((rx0 + rx1) / 2, ry1)) return "s";
    if (near(rx0, (ry0 + ry1) / 2)) return "w";
    if (near(rx1, (ry0 + ry1) / 2)) return "e";
    if (lx >= rx0 && lx <= rx1 && ly >= ry0 && ly <= ry1) return "move";
    // Empty area with a box already active: start drawing a NEW one, same as when inactive.
    return "draw";
  }

  /** `ratio` overrides the Aspect combo — used for Shift-drag in Free mode, which locks to
   *  whatever ratio the box already had at the start of THIS drag, not a preset. `handle`
   *  decides which axis DRIVES the other: n/s edge handles now work under a locked aspect
   *  too (they used to just be hidden) by deriving width from the height they actually
   *  changed, scaled around the box's horizontal center — everything else stays width-drives-
   *  height, anchored at (x0,y0), as it always was. */
  function applyAspect(b: Box, ratio?: number | null, handle?: Handle): Box {
    const r = ratio ?? ASPECTS[node.properties.nkdCropAspect];
    if (!r) return b;
    if (handle === "n" || handle === "s") {
      const h = b.y1 - b.y0;
      const w = h * r;
      const cx = (b.x0 + b.x1) / 2;
      return { x0: cx - w / 2, y0: b.y0, x1: cx + w / 2, y1: b.y1 };
    }
    const w = b.x1 - b.x0;
    const h = w / r;
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y0 + h };
  }

  /** Grid snap first (best effort — `snapBoxRotated`'s centered grow has no edge to redirect
   *  against once rotated), THEN Crop mode's containment as the final, absolute guarantee:
   *  translate/shrink the box so its rotated footprint never leaves the source (Neko:
   *  "debería contenerse dentro del marco" — rotating in Crop mode was drifting past the
   *  edge instead, same as an unrotated resize always used to be blocked from doing).
   *  Containment running LAST can undo a little of the grid alignment in a corner-wedged
   *  rotated case — accepted trade: "never leaves the source" outranks "exactly on the grid"
   *  in Crop mode. Outpaint mode never runs this at all. */
  function finalizeBox(b: Box): Box {
    let out = b;
    const grid = gridMultiple();
    if (grid) {
      out = isRotated()
        ? snapBoxRotated(out, grid)
        : snapBox(out, grid, isOutpaint() ? null : srcW, isOutpaint() ? null : srcH);
    }
    if (!isOutpaint()) out = containRotatedBox(out, angle, srcW, srcH);
    return out;
  }

  let drag: {
    handle: Handle; startBox: Box; startSrc: [number, number]; startAngle: number;
    // Only set for "draw" — what to restore if the drag turns out too small to count.
    preBox?: Box; preAngle?: number; preActive?: boolean;
  } | null = null;

  function eventToSource(e: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const [cw, ch] = canvasSize();
    const cx = (e.clientX - rect.left) * (cw / rect.width);
    const cy = (e.clientY - rect.top) * (ch / rect.height);
    return toSource(cx, cy) as [number, number];
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const [cw, ch] = canvasSize();
    const cx = (e.clientX - rect.left) * (cw / rect.width);
    const cy = (e.clientY - rect.top) * (ch / rect.height);
    const h = hitTest(cx, cy);
    canvas.setPointerCapture(e.pointerId);
    const [sxRaw, syRaw] = eventToSource(e);
    if (h === "draw") {
      // Start a brand new box, axis-aligned, anchored at this point — a freehand marquee,
      // like any crop tool. Optimistically active already, so draw() shows it live;
      // endDrag reverts everything below if the result is too small to count.
      const preBox = { ...box }, preAngle = angle, preActive = boxActive;
      angle = 0;
      boxActive = true;
      box = { x0: sxRaw, y0: syRaw, x1: sxRaw, y1: syRaw };
      drag = { handle: h, startBox: box, startSrc: [sxRaw, syRaw], startAngle: 0,
               preBox, preAngle, preActive };
      draw();
      e.stopPropagation();
      return;
    }
    // Resize handles want the pointer in the box's own LOCAL (de-rotated) frame — see the
    // file header. Move/rotate read the global source position directly.
    const startSrc: [number, number] = h === "move" || h === "rotate"
      ? [sxRaw, syRaw]
      : rotatePoint(sxRaw, syRaw, ...boxCenter(box), -angle);
    drag = { handle: h, startBox: { ...box }, startSrc, startAngle: angle };
    e.stopPropagation();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const b0 = drag.startBox;

    if (drag.handle === "draw") {
      const [sx, sy] = eventToSource(e);
      const [ax, ay] = drag.startSrc;
      let next: Box = { x0: Math.min(ax, sx), y0: Math.min(ay, sy),
                        x1: Math.max(ax, sx), y1: Math.max(ay, sy) };
      const m = margin();
      const lo = -m, hi = 1 + m;
      next.x0 = Math.max(lo * srcW, next.x0); next.y0 = Math.max(lo * srcH, next.y0);
      next.x1 = Math.min(hi * srcW, next.x1); next.y1 = Math.min(hi * srcH, next.y1);
      next = snapToSourceEdges(next, edgeSnapTol(e), srcW, srcH, "nsew", false);
      const locked = ASPECTS[node.properties.nkdCropAspect];
      if (locked) next = applyAspect(next, locked);
      box = finalizeBox(next);
      scheduleDraw();
      return;
    }

    if (drag.handle === "rotate") {
      const [sx, sy] = eventToSource(e);
      const [cx, cy] = boxCenter(b0);
      const rawDeg = (Math.atan2(sy - cy, sx - cx) * 180) / Math.PI;
      let next = rawDeg - ROTATE_BASE_DEG;
      // Shift snaps to 15° steps — a rotate handle has no continuous "fine" concept, so a
      // discrete snap stands in for the pack's usual ×0.1 fine-drag convention.
      if (e.shiftKey) next = Math.round(next / 15) * 15;
      angle = ((next % 360) + 360) % 360;
      box = finalizeBox(box);   // re-snap to the grid at the new orientation
      scheduleDraw();
      return;
    }

    const [sxRaw, syRaw] = eventToSource(e);
    const [sx, sy] = drag.handle === "move"
      ? [sxRaw, syRaw]
      : rotatePoint(sxRaw, syRaw, ...boxCenter(b0), -drag.startAngle);
    const dx = sx - drag.startSrc[0], dy = sy - drag.startSrc[1];
    let next: Box = { ...b0 };
    const minSize = Math.max(4, Math.min(srcW, srcH) * 0.02);
    switch (drag.handle) {
      case "move":
        next = { x0: b0.x0 + dx, y0: b0.y0 + dy, x1: b0.x1 + dx, y1: b0.y1 + dy };
        break;
      case "n": next.y0 = Math.min(b0.y1 - minSize, b0.y0 + dy); break;
      case "s": next.y1 = Math.max(b0.y0 + minSize, b0.y1 + dy); break;
      case "w": next.x0 = Math.min(b0.x1 - minSize, b0.x0 + dx); break;
      case "e": next.x1 = Math.max(b0.x0 + minSize, b0.x1 + dx); break;
      case "nw": next.x0 = Math.min(b0.x1 - minSize, b0.x0 + dx); next.y0 = Math.min(b0.y1 - minSize, b0.y0 + dy); break;
      case "ne": next.x1 = Math.max(b0.x0 + minSize, b0.x1 + dx); next.y0 = Math.min(b0.y1 - minSize, b0.y0 + dy); break;
      case "sw": next.x0 = Math.min(b0.x1 - minSize, b0.x0 + dx); next.y1 = Math.max(b0.y0 + minSize, b0.y1 + dy); break;
      case "se": next.x1 = Math.max(b0.x0 + minSize, b0.x1 + dx); next.y1 = Math.max(b0.y0 + minSize, b0.y1 + dy); break;
    }
    // Clamp the box to the visible margin band so it stays reachable by drag (no band at
    // all in Crop mode, unless rotated — margin() is 0 there). Skipped once rotated: the
    // band is in GLOBAL source axes and `next` here is in the box's own LOCAL frame.
    if (!isRotated()) {
      const m = margin();
      const lo = -m, hi = 1 + m;
      next.x0 = Math.max(lo * srcW, next.x0); next.y0 = Math.max(lo * srcH, next.y0);
      next.x1 = Math.min(hi * srcW, next.x1); next.y1 = Math.min(hi * srcH, next.y1);
    }
    next = snapToSourceEdges(next, edgeSnapTol(e), srcW, srcH, drag.handle, drag.handle === "move");
    if (drag.handle !== "move") {
      // Shift in Free mode locks to the CURRENT bbox ratio (from the drag's start box), not
      // a preset — the same "hold Shift to keep proportions" as any resize handle elsewhere.
      const locked = ASPECTS[node.properties.nkdCropAspect];
      const startW = b0.x1 - b0.x0, startH = b0.y1 - b0.y0;
      const shiftRatio = !locked && e.shiftKey && startH > 0 ? startW / startH : null;
      next = applyAspect(next, locked ?? shiftRatio, drag.handle);
    }
    box = finalizeBox(next);
    scheduleDraw();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.handle === "draw") {
      const tooSmall = (box.x1 - box.x0) < srcW * DRAW_MIN_PX_FRAC
        || (box.y1 - box.y0) < srcH * DRAW_MIN_PX_FRAC;
      if (tooSmall) {
        // An accidental click, not a drag — put everything back exactly as it was.
        box = drag.preBox!; angle = drag.preAngle!; boxActive = drag.preActive!;
        drag = null;
        draw();
        return;
      }
    }
    drag = null;
    regionW.value = serialiseRegion(box, angle, srcW, srcH);
    regionW.callback?.(regionW.value);
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  select.addEventListener("change", () => {
    node.properties.nkdCropAspect = select.value;
    box = finalizeBox(applyAspect(box));
    regionW.value = serialiseRegion(box, angle, srcW, srcH);
    draw();
  });
  resetBtn.addEventListener("click", () => {
    angle = 0;
    boxActive = true;
    box = finalizeBox(defaultBox(srcW, srcH));
    regionW.value = serialiseRegion(box, angle, srcW, srcH);
    draw();
  });

  // `fill`/`fill_color` only matter in Outpaint mode (Crop mode never has an area to fill),
  // and `fill_color` further only for fill = "color". Both reversible (setWidgetVisible),
  // unlike `region`'s one-way hideWidget: these have to come back.
  const fillW = findW(node, "fill");
  function syncFillWidgetsVisible(): void {
    const outpaint = isOutpaint();
    setWidgetVisible(node, "fill", outpaint);
    setWidgetVisible(node, "fill_color", outpaint && fillW?.value === "color");
    if (Array.isArray(node.widgets)) node.widgets = [...node.widgets]; // invalidate 2.0 snapshot
    node.setSize(node.computeSize());
    node.setDirtyCanvas(true, true);
  }
  function wrapCallback(w: any, flag: string, handler: () => void): void {
    if (!w || w[flag]) return;
    const orig = w.callback;
    w.callback = function (this: any, ...args: any[]) {
      const r = orig?.apply(this, args);
      handler();
      return r;
    };
    w[flag] = true;
  }
  wrapCallback(fillW, "_nkdCropCb", syncFillWidgetsVisible);

  // Mode flips the margin band on/off (canvas geometry changes) and clamps any box that was
  // outpainting back inside the source. Grid changes just re-snap the box where it stands.
  function reflowBox(): void {
    box = finalizeBox(box);
    regionW.value = serialiseRegion(box, angle, srcW, srcH);
    if (mounted?.resizeToContent) mounted.resizeToContent();
    draw();
  }
  wrapCallback(modeW, "_nkdCropCb", () => { syncFillWidgetsVisible(); reflowBox(); });
  wrapCallback(divisibleByW, "_nkdCropCb", reflowBox);

  const mounted = mountDomWidget(node, {
    name: "nkd_crop_editor", type: "NKD_CROP", root,
    // The real floor is whatever the toolbar needs to not wrap (Aspect label + select +
    // Reset), not the canvas — the canvas itself is happy at any size, same as an <img>.
    minWidth: 120,
    minWidthOf: barMinWidth,
    estimate: () => BAR_H + Math.round(CANVAS_W * srcH / srcW)
      + (transport.style.display === "flex" ? TRANSPORT_H : 0),
    getValue: () => regionW.value,
    setValue: (v: string) => {
      regionW.value = v;
      ({ box, angle } = parseRegion(v, srcW, srcH));
      boxActive = !!v;
      draw();
    },
    onResize: () => scheduleDraw(),
  });

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any, data: any) {
    origConfigure?.apply(this, arguments);
    select.value = node.properties.nkdCropAspect ?? "Free";
    ({ box, angle } = parseRegion(regionW.value, srcW, srcH));
    boxActive = !!regionW.value;
    refreshSource();
    syncFillWidgetsVisible();
    if (mounted.resizeToContent) mounted.resizeToContent();
    draw();
  };

  const origConnChange = node.onConnectionsChange;
  node.onConnectionsChange = function (this: any, ...args: any[]) {
    origConnChange?.apply(this, args);
    refreshSource();
  };

  // Picking a DIFFERENT file in the upstream Load Image/Video's own widget touches no link,
  // so `onConnectionsChange` never fires for it — Neko: "si cambio el input... el nodo no se
  // actualiza". `refreshSource` already short-circuits to a no-op when the resolved file
  // hasn't changed, so polling it is cheap; matches the same "material bajo los pies" fix
  // NKD Timeline already has for the identical problem.
  const refreshPoll = window.setInterval(refreshSource, 500);

  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    stopPlayback();          // cancels the rAF loop, or a deleted node keeps redrawing forever
    clearInterval(refreshPoll);
    origRemoved?.apply(this, args);
  };

  syncFillWidgetsVisible();
  requestAnimationFrame(() => { refreshSource(); draw(); });
}
