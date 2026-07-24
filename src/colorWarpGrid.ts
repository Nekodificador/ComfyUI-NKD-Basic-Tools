// 😺NKD Color Warp — polar grid canvas (left pane).
// Layers (per nkd-curve-style): hue–sat wheel background → pixel-cloud scatter
// → reference rings/spokes → the deformable mesh web (nodes at their warped
// positions) → control handles.
//
// SPACES: the engine (mesh/LUT) works in OKLCh — hue in degrees, radius =
// C/C_REF. The wheel is only a PROJECTION of that space: the active wheel mode
// (WHEEL_MODES: ryb/rgb/oklch) is an anchor table display-angle ↔ OKLCh hue.
// Everything drawn or hit-tested goes through d2h/h2d with the current mode's
// anchors; the scatter stores engine coords so switching modes just reprojects.
// HiDPI. Wheel + scatter are cached and recomputed only on resize / source /
// mode change; the vector layers redraw per frame (cheap) so drags stay live.
//
// Interaction: pointer-capture drag of a node swings its OWN radial column to
// the cursor (straight radial line; only that spoke moves — no angular spread),
// à la 3DLC A/B. Pin All = only the grabbed node. Shift = DaVinci ring/sector
// gesture (horizontal = rotate a sector's hue, vertical = expand/contract a
// ring's sat). Alt+wheel nudges per-node luma. Double-click resets a node.
// Edits are written back through `onEdit(json, commit)`.
import {
  Mesh, displayToHue, hueToDisplay, meshToDict, meshIdentity, C_REF,
  oklabToLinear, linearToSrgb, srgbToEngine, WHEEL_MODES, WheelModeName,
  meshColumnHues, wheelColumnHues, meshSample, hslToSrgb,
} from "./colorCore";

const GRID_LINE = "rgba(120,180,255,0.35)";
const WEB_LINE = "rgba(120,180,255,0.55)";
const ACCENT = "#4ab4ff";
const RAD = Math.PI / 180;

// Skin-tone reference ray (vectorscope-style): defined as HSL hue 25° (the
// readout's convention), converted to the engine OKLCh hue so it lands on real
// skin colors under ANY wheel mode.
const SKIN_ENGINE_HUE = srgbToEngine(hslToSrgb([25, 1, 0.5]))[0];
const SKIN_LINE = "rgba(255,190,150,0.6)";

// Node coordinate labels (A1…): toolbar-toggled via `labels` — used when
// discussing exact nodes over text, off by default for daily work.

// nkd-curve-style handle radii.
const R_IDLE = 6;
const R_HOVER = 7;
const R_CENTER = 4.5;
const R_DEP = 3;   // dependent (non-autonomous) node → small dot (3DLC-style)
const HIT_PX = 14; // hit-test tolerance in CSS px
const MARQUEE_MIN = 4; // px: a rect smaller than this is a click (clears selection)
const GIZMO_R = 4;       // transform-box corner handle radius
const GIZMO_HIT = 10;    // corner / rotate handle hit tolerance (px)
const ROT_LEVER = 26;    // rotation lever length above the box (px)
const ROT_HANDLE_R = 5;  // rotation handle radius

// ponytail: interaction tuning knobs — the drag "feel" Neko will eyeball.
// Model (3DLC A/B, confirmed with Neko 2026-07-23): grabbing a node swings its
// OWN radial column to the cursor as a straight radial line (angle = cursor hue,
// sat scales from the centre through the cursor). ONLY that spoke moves — no
// angular spread to neighbours. Pin All = only the grabbed node.
// (A relax/smooth tool à la 3DLC would be a NEW feature, not a drag falloff.)
const SHIFT_ROT_PER_PX = 0.3;   // deg of hue pivot per px (Shift horizontal)
const SHIFT_SAT_PER_PX = 0.003; // sat change per px (Shift vertical; up = away from centre)
const SHIFT_AXIS_MIN = 4;       // px of travel before a Shift-drag locks to the hue or sat axis
const LUMA_PER_WHEEL = 0.0015;  // dl per wheel delta unit (Alt+wheel)

// Angle convention: display 0° at top (12 o'clock), increasing clockwise.
// (Canvas y is down, so +sin points down.) Flagged for Neko to eyeball — this
// is the one free choice in the RYB layout and easy to rotate/flip here.
function angleRad(displayDeg: number): number {
  return (displayDeg - 90) * RAD;
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
// Wrap a degree delta into [-180, 180) so hue placement takes the short way.
function wrapDeg(d: number): number {
  return ((d + 180) % 360 + 360) % 360 - 180;
}

interface HoverInfo { ri: number; sj: number; dh: number; ds: number; dl: number; }

export interface GridCallbacks {
  // Fired on every mesh mutation. commit=false during a drag (repaint preview
  // only), commit=true on drag end / discrete edit (also write back to node).
  onEdit?: (json: string, commit: boolean) => void;
  // Node hover (for tooltip). null = nothing under cursor.
  onHover?: (info: HoverInfo | null, clientX: number, clientY: number) => void;
  // Grid cursor in ENGINE polar space (OKLCh hue deg + sat) every move, plus
  // whether Alt is held — drives the Alt affected-region mask on the preview.
  onGridCursor?: (engineHue: number, sat: number, alt: boolean, inside: boolean) => void;
}

// Wheel centre lightness (OKLab L). Toward the rim, L heads to each hue's
// GAMUT CUSP (the L where that hue reaches max sRGB chroma) — a fixed-L wheel
// washes blue/violet/cyan into the same pale tone because saturated blue only
// exists at low L; per-channel clamping then destroys the hue distinction.
const WHEEL_L = 0.72;
// ponytail: wheel softness knobs for Neko to eyeball.
// WHEEL_CHROMA scales the wheel's chroma below the gamut cusp (1.0 = fully
// vivid rim; DaVinci-style softer ≈ 0.85). WHEEL_L_SMOOTH_DEG is the gaussian
// σ (in hue degrees) smoothing the cusp-lightness curve: the raw sRGB cusp has
// a lightness CLIFF at the blue corner (cyan ≈0.90 vs blue ≈0.45) that reads
// as an abrupt jump; 0 = raw cusp (vivid, cliffy), larger = flatter lightness
// (smoother, approaching DaVinci's pale-blue look).
const WHEEL_CHROMA = 0.9;
const WHEEL_L_SMOOTH_DEG = 12;
// Beyond each hue's max sRGB chroma the wheel FADES (instead of silently
// plateauing at the boundary color): the vivid edge traces the actual gamut
// silhouette, 3DLC-style, and the dimmed zone reads as "no sRGB colors here".
// Radius stays ABSOLUTE chroma (C/C_REF) — it's an engine coordinate; only the
// painting acknowledges the gamut. 0 = plateau look, 1 = fade to black.
// Neko 2026-07-23: 0.45 read as a dark smudge over the cyans → off. If the
// gamut edge ever needs to be visible, a thin contour line would beat a fade.
const WHEEL_OOG_FADE = 0.0;

// 4096-entry linear→sRGB-byte table so the wheel repaint avoids 3 pow() per px.
let gammaLut: Uint8Array | null = null;
function srgbByte(lin: number): number {
  if (!gammaLut) {
    gammaLut = new Uint8Array(4097);
    for (let i = 0; i <= 4096; i++) gammaLut[i] = Math.round(linearToSrgb(i / 4096) * 255);
  }
  return gammaLut[lin <= 0 ? 0 : lin >= 1 ? 4096 : Math.round(lin * 4096)];
}

function linInGamut(lin: [number, number, number]): boolean {
  return lin[0] >= 0 && lin[0] <= 1 && lin[1] >= 0 && lin[1] <= 1 && lin[2] >= 0 && lin[2] <= 1;
}

// Engine-hue → OKLab L of the sRGB gamut cusp (max-chroma point) at that hue.
// 0.5° table computed once per session. The L search is CONTINUOUS (golden-
// section over the unimodal maxC(L) slice) — a stepped L scan quantizes the
// rim lightness and paints visible angular bands. Lookup lerps between entries.
let cuspLTab: Float64Array | null = null;
function cuspL(hueDeg: number): number {
  if (!cuspLTab) {
    cuspLTab = new Float64Array(721);
    const PHI = 0.6180339887498949;
    for (let i = 0; i <= 720; i++) {
      const rad = i * 0.5 * RAD;
      const ca = Math.cos(rad), sb = Math.sin(rad);
      const maxC = (L: number): number => {
        let lo = 0, hi = 0.5;
        for (let it = 0; it < 16; it++) {
          const mid = (lo + hi) / 2;
          if (linInGamut(oklabToLinear([L, mid * ca, mid * sb]))) lo = mid; else hi = mid;
        }
        return lo;
      };
      let a = 0.02, b = 0.998;
      let x1 = b - PHI * (b - a), x2 = a + PHI * (b - a);
      let f1 = maxC(x1), f2 = maxC(x2);
      for (let it = 0; it < 30; it++) {
        if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + PHI * (b - a); f2 = maxC(x2); }
        else { b = x2; x2 = x1; f2 = f1; x1 = b - PHI * (b - a); f1 = maxC(x1); }
      }
      cuspLTab[i] = (a + b) / 2;
    }
    if (WHEEL_L_SMOOTH_DEG > 0) {
      // Circular gaussian blur of the cusp-lightness curve (see knob comment).
      const sigma = WHEEL_L_SMOOTH_DEG * 2; // samples (0.5°/sample)
      const radius = Math.ceil(sigma * 3);
      const kernel = new Float64Array(radius * 2 + 1);
      let ksum = 0;
      for (let k = -radius; k <= radius; k++) {
        const w = Math.exp(-(k * k) / (2 * sigma * sigma));
        kernel[k + radius] = w; ksum += w;
      }
      const raw = cuspLTab.slice(0, 720);
      for (let i = 0; i < 720; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += raw[(i + k + 720 * 4) % 720] * kernel[k + radius];
        cuspLTab[i] = s / ksum;
      }
      cuspLTab[720] = cuspLTab[0];
    }
  }
  const h = ((hueDeg % 360) + 360) % 360;
  const p = h * 2;
  const i0 = Math.floor(p), f = p - i0;
  return cuspLTab[i0] * (1 - f) + cuspLTab[Math.min(i0 + 1, 720)] * f;
}

export class ColorWarpGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(window.devicePixelRatio || 1, 2);
  private mesh: Mesh | null = null;
  private source: HTMLCanvasElement | null = null;

  // Public interaction toggles (viewer toolbar drives these).
  pin = false;
  labels = false; // A1… node coordinate labels
  cb: GridCallbacks = {};

  // Active wheel mode: the display↔OKLCh-hue projection. Mesh data is engine-
  // space, so switching modes only reprojects the view.
  private modeName: WheelModeName = "ryb";
  private anchors = WHEEL_MODES.ryb.anchors;
  // Cached h2d table (0.5° steps) for per-point hot paths (scatter/indicator).
  private h2dTab: Float32Array | null = null;

  private d2h(displayDeg: number): number { return displayToHue(displayDeg, this.anchors); }
  private h2d(hueDeg: number): number { return hueToDisplay(hueDeg, this.anchors); }
  private h2dFast(hueDeg: number): number {
    if (!this.h2dTab) {
      const t = new Float32Array(721);
      for (let i = 0; i <= 720; i++) t[i] = this.h2d(i * 0.5);
      this.h2dTab = t;
    }
    const h = ((hueDeg % 360) + 360) % 360;
    return this.h2dTab[Math.round(h * 2)];
  }

  // Minimal API for external editors sharing this mesh (the Hue/Luma strip
  // mutates the same Mesh object, then notifies through here).
  notifyExternalEdit(commit: boolean) { this.draw(); this.emit(commit); }
  refresh() { this.draw(); }
  projectHue(hue: number): number { return this.h2d(hue); }
  engineHueAt(displayDeg: number): number { return this.d2h(displayDeg); }

  getWheelMode(): WheelModeName { return this.modeName; }
  setWheelMode(name: WheelModeName) {
    this.modeName = name;
    this.anchors = WHEEL_MODES[name].anchors;
    this.h2dTab = null;
    this.wheelKey = ""; // repaint the background wheel in the new projection
    this.draw();
  }

  // Geometry in CSS px, recomputed on resize.
  private cx = 0; private cy = 0; private R = 0;
  private cssW = 0; private cssH = 0;

  // Cached wheel (device-px ImageData) keyed by device size.
  private wheel: ImageData | null = null;
  private wheelKey = "";

  // Cached scatter: ENGINE [oklchHueDeg, sat] per sampled pixel — wheel-mode
  // independent; projected through h2dFast at draw time.
  private scatter: Float32Array | null = null;

  // Drag / hover state.
  private hover: [number, number] | null = null; // [ri, sj] under cursor
  private drag: null | {
    kind: "node" | "shift" | "group" | "marquee" | "scale" | "rotate";
    ri: number; sj: number;
    startX: number; startY: number;          // pointer down (CSS px)
    start: number[][][];                       // deep copy of offsets at grab
    pointerId: number;
    groupStart?: { ri: number; sj: number; x: number; y: number }[]; // group/scale/rotate snapshot
    corner?: number;  // scale: dragged corner 0=TL 1=TR 2=BR 3=BL
    box?: { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }; // scale/rotate snapshot
    startAng?: number; // rotate: initial cursor angle from box centre
    xform?: (x: number, y: number) => [number, number]; // live scale/rotate map (for drawing the box)
    axis?: "h" | "v"; // Shift gesture: axis locked to hue (h) or saturation (v)
  } = null;

  // Box-select: nodes moved together + the live marquee rect [x0,y0,x1,y1].
  private selected = new Set<string>();
  private marquee: [number, number, number, number] | null = null;

  // Preview-hover indicator: ENGINE [oklchHueDeg, sat, cssColor] or null.
  private indicator: [number, number, string] | null = null;

  // Autonomy: nodes the user has fixed ("ri,sj"). Rim nodes are autonomous by
  // default (each arm's root). A dependent node is interpolated between its two
  // bracketing autonomous nodes on its arm; dragging a node makes it autonomous.
  private autonomous = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("dblclick", this.onDblClick);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  setMesh(mesh: Mesh) { this.mesh = mesh; this.initAutonomy(); this.draw(); }
  getMesh(): Mesh | null { return this.mesh; }

  setSource(src: HTMLCanvasElement) {
    this.source = src;
    this.scatter = null; // recompute lazily in draw()
    this.draw();
  }

  // Optional 16-bit source companion (backend push, RGB uint16 row-major):
  // the scatter reconstructs from this instead of the 8-bit canvas — 65536
  // levels make the cloud effectively continuous, no dither needed.
  setScatter16(s: { data: Uint16Array; width: number; height: number } | null) {
    this.scatter16 = s;
    this.scatter = null;
    this.draw();
  }
  private scatter16: { data: Uint16Array; width: number; height: number } | null = null;

  // Preview → grid indicator dot (Phase 7.1). ENGINE coords (OKLCh hue + sat);
  // stored engine-side so a wheel-mode switch reprojects it. Pass null to clear.
  setIndicator(engineHue: number | null, sat = 0, css = "#fff") {
    this.indicator = engineHue == null ? null : [engineHue, sat, css];
    this.draw();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cx = w / 2; this.cy = h / 2;
    this.R = Math.min(w, h) / 2 * 0.9;
    this.draw();
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("dblclick", this.onDblClick);
    c.removeEventListener("wheel", this.onWheel);
  }

  // --- geometry ------------------------------------------------------------

  // display angle + normalized sat → CSS-px screen point.
  private polar(displayDeg: number, sat: number): [number, number] {
    const a = angleRad(displayDeg);
    const r = sat * this.R;
    return [this.cx + r * Math.cos(a), this.cy + r * Math.sin(a)];
  }

  // Inverse: CSS-px screen point → [displayDeg, sat] (sat clamped to [0,1]).
  private toPolar(x: number, y: number): [number, number] {
    const dx = x - this.cx, dy = y - this.cy;
    const sat = clamp01(Math.hypot(dx, dy) / (this.R || 1));
    let disp = Math.atan2(dy, dx) / RAD + 90;
    disp = ((disp % 360) + 360) % 360;
    return [disp, sat];
  }

  // A mesh node's warped on-screen position (matches meshSample's center-safe
  // hue push: warpedHue = baseHue + dhRaw*baseSat). This is THE hit-test/inverse
  // reference used by every drag path.
  private nodePt(ri: number, sj: number): [number, number] {
    const m = this.mesh!;
    if (ri === 0) { // centre = the global neutral cast, drawn at its (a,b) position
      const n = m.neutral ?? [0, 0];
      const C = Math.hypot(n[0], n[1]);
      const hue = (Math.atan2(n[1], n[0]) * 180 / Math.PI + 360) % 360;
      return this.polar(this.h2d(hue), Math.min(C / C_REF, 1));
    }
    const R = m.sat_rings;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    // Base hue = the column's ENGINE anchor hue — the cell the node edits.
    // off[0] is the node's absolute hue rotation (matches meshSample).
    const warpedHue = meshColumnHues(m)[sj] + off[0];
    const warpedDisp = this.h2d(warpedHue);
    const warpedSat = clamp01(baseSat + off[1]);
    return this.polar(warpedDisp, warpedSat);
  }

  // --- autonomy / hierarchy ------------------------------------------------

  private key(ri: number, sj: number): string { return ri + "," + sj; }

  // A node's warped polar position [displayAngle, sat] (polar twin of nodePt).
  private nodePolar(ri: number, sj: number): [number, number] {
    const m = this.mesh!;
    const R = m.sat_rings;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    const warpedHue = meshColumnHues(m)[sj] + off[0];
    return [this.h2d(warpedHue), clamp01(baseSat + off[1])];
  }

  // Write the offset that places node (ri,sj) at a display angle + sat (keeps luma).
  private setNodePolar(ri: number, sj: number, angle: number, sat: number) {
    const m = this.mesh!;
    const R = m.sat_rings;
    const baseSat = ri / R;
    const baseHue = meshColumnHues(m)[sj];
    const o = m.offsets[ri][sj];
    o[0] = wrapDeg(this.d2h(angle) - baseHue);
    o[1] = sat - baseSat;
  }

  // Default anchors: the rim node of every spoke (each arm's root).
  private initAutonomy() {
    this.autonomous.clear();
    const m = this.mesh; if (!m) return;
    for (let sj = 0; sj < m.hue_segments; sj++) this.autonomous.add(this.key(m.sat_rings, sj));
  }

  // Reposition one spoke's dependent nodes: each is INTERPOLATED between its two
  // bracketing autonomous nodes on this arm — the nearest inward (or the centre,
  // sat 0) and the nearest outward (the rim is a default anchor). Autonomous
  // nodes keep their explicit position.
  private recomputeSpoke(sj: number) {
    const m = this.mesh!, R = m.sat_rings;
    for (let rr = 1; rr <= R; rr++) {
      if (this.autonomous.has(this.key(rr, sj))) continue;
      let abv = -1;
      for (let aa = rr + 1; aa <= R; aa++) if (this.autonomous.has(this.key(aa, sj))) { abv = aa; break; }
      if (abv < 0) continue; // no anchor outward (rim is a default anchor, so rare)
      let blo = 0; // centre
      for (let bb = rr - 1; bb >= 1; bb--) if (this.autonomous.has(this.key(bb, sj))) { blo = bb; break; }
      const [angA, satA] = this.nodePolar(abv, sj);
      const t = (rr - blo) / (abv - blo);
      let angle: number, sat: number;
      if (blo === 0) {          // inner bracket = the centre node → stretch, don't collapse
        const [bx, by] = this.polar(angA, satA * t);   // base radial position (centre at origin)
        const [vx, vy] = this.centerDisp();            // how far the centre was dragged
        const w = 1 - t;                                // full at the centre, 0 at the outer anchor
        [angle, sat] = this.toPolar(bx + vx * w, by + vy * w);
      } else {
        // Straight line (screen space) between the two bracketing anchors — polar
        // interpolation would bow the arm; 3DLC keeps it straight.
        const [angB, satB] = this.nodePolar(blo, sj);
        const [axS, ayS] = this.polar(angA, satA);
        const [bxS, byS] = this.polar(angB, satB);
        [angle, sat] = this.toPolar(bxS + (axS - bxS) * t, byS + (ayS - byS) * t);
      }
      this.setNodePolar(rr, sj, angle, sat);
    }
  }

  // Nearest control node to a CSS-px point, within HIT_PX. Center (ri=0) counted
  // once. Returns [ri, sj] or null.
  private hitTest(x: number, y: number): [number, number] | null {
    const m = this.mesh;
    if (!m) return null;
    const R = m.sat_rings, S = m.hue_segments;
    let best: [number, number] | null = null;
    let bestD = HIT_PX * HIT_PX;
    const consider = (ri: number, sj: number) => {
      const [px, py] = this.nodePt(ri, sj);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestD) { bestD = d; best = [ri, sj]; }
    };
    for (let ri = 1; ri <= R; ri++) for (let sj = 0; sj < S; sj++) consider(ri, sj);
    consider(0, 0); // center
    return best;
  }

  // --- interaction ---------------------------------------------------------

  private localXY(e: PointerEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private cloneOffsets(): number[][][] {
    return this.mesh!.offsets.map((ring) => ring.map((c) => [c[0], c[1], c[2]]));
  }

  // Screen-space bbox + centre of the current box-selection (≥2 nodes), or null.
  private selectionBox() {
    if (this.selected.size < 2 || !this.mesh) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of this.selected) {
      const [ri, sj] = k.split(",").map(Number);
      const [px, py] = this.nodePt(ri, sj);
      if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py;
    }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // The centre node's screen-space displacement from the canvas origin (the
  // vector by which the centre was dragged), used to stretch — not collapse — the web.
  private centerDisp(): [number, number] {
    const [px, py] = this.nodePt(0, 0);
    return [px - this.cx, py - this.cy];
  }

  // Snapshot selected nodes' current screen positions (for group/scale/rotate).
  private selectionSnapshot() {
    return [...this.selected].map((k) => {
      const [ri, sj] = k.split(",").map(Number);
      const [x, y] = this.nodePt(ri, sj);
      return { ri, sj, x, y };
    });
  }

  private emit(commit: boolean) {
    this.cb.onEdit?.(JSON.stringify(meshToDict(this.mesh!)), commit);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.mesh || this.R < 2) return;
    const [x, y] = this.localXY(e);
    if (e.shiftKey) {
      // Shift = axis-locked nudge of the node under the cursor (only that node).
      const hit = this.hitTest(x, y);
      if (!hit) return;
      this.drag = { kind: "shift", ri: hit[0], sj: hit[1], startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
    } else {
      const box = this.selectionBox();
      let handled = false;
      if (box) {
        // Transform gizmo: corners scale, the top lever rotates.
        const cxs = [box.x0, box.x1, box.x1, box.x0], cys = [box.y0, box.y0, box.y1, box.y1];
        let corner = -1, bd = GIZMO_HIT * GIZMO_HIT;
        for (let c = 0; c < 4; c++) { const ax = x - cxs[c], ay = y - cys[c], dd = ax * ax + ay * ay; if (dd < bd) { bd = dd; corner = c; } }
        const rhx = box.cx, rhy = box.y0 - ROT_LEVER;
        if (corner >= 0) {
          this.drag = { kind: "scale", ri: 0, sj: 0, startX: x, startY: y, start: [], pointerId: e.pointerId, corner, box, groupStart: this.selectionSnapshot() };
          handled = true;
        } else if ((x - rhx) * (x - rhx) + (y - rhy) * (y - rhy) < GIZMO_HIT * GIZMO_HIT) {
          this.drag = { kind: "rotate", ri: 0, sj: 0, startX: x, startY: y, start: [], pointerId: e.pointerId, box, startAng: Math.atan2(y - box.cy, x - box.cx), groupStart: this.selectionSnapshot() };
          handled = true;
        }
      }
      if (!handled) {
        const hit = this.hitTest(x, y);
        if (hit && this.selected.has(this.key(hit[0], hit[1]))) {
          this.drag = { kind: "group", ri: hit[0], sj: hit[1], startX: x, startY: y, start: [], pointerId: e.pointerId, groupStart: this.selectionSnapshot() };
        } else if (hit) {
          if (this.selected.size) { this.selected.clear(); this.draw(); } // plain grab clears selection
          this.drag = { kind: "node", ri: hit[0], sj: hit[1], startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
        } else if (box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) {
          // Inside the selection box → translate the whole group.
          this.drag = { kind: "group", ri: 0, sj: 0, startX: x, startY: y, start: [], pointerId: e.pointerId, groupStart: this.selectionSnapshot() };
        } else {
          this.drag = { kind: "marquee", ri: 0, sj: 0, startX: x, startY: y, start: [], pointerId: e.pointerId };
          this.marquee = [x, y, x, y];
        }
      }
    }
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.mesh || this.R < 2) return;
    const [x, y] = this.localXY(e);

    if (this.drag) {
      if (this.drag.kind === "marquee") {
        this.marquee = [this.drag.startX, this.drag.startY, x, y];
        this.draw();
        return;
      }
      if (this.drag.kind === "node") this.dragNode(x, y);
      else if (this.drag.kind === "group") this.dragGroup(x, y);
      else if (this.drag.kind === "scale") this.dragScale(x, y, e);
      else if (this.drag.kind === "rotate") this.dragRotate(x, y);
      else this.dragShift(x, y);
      this.draw();
      this.emit(false);
      // Live tooltip on the dragged node.
      const { ri, sj } = this.drag;
      const off = this.mesh.offsets[ri][sj];
      this.cb.onHover?.({ ri, sj, dh: off[0], ds: off[1], dl: off[2] }, e.clientX, e.clientY);
      return;
    }

    // Hover: track nearest node for handle highlight + tooltip.
    const hit = this.hitTest(x, y);
    const changed = (hit?.[0] !== this.hover?.[0]) || (hit?.[1] !== this.hover?.[1]);
    this.hover = hit;
    if (changed) this.draw();
    if (hit) {
      const off = this.mesh.offsets[hit[0]][hit[1]];
      this.cb.onHover?.({ ri: hit[0], sj: hit[1], dh: off[0], ds: off[1], dl: off[2] }, e.clientX, e.clientY);
    } else {
      this.cb.onHover?.(null, e.clientX, e.clientY);
    }

    // Feed the grid cursor to the viewer in ENGINE coords (drives the Alt mask).
    const [disp, sat] = this.toPolar(x, y);
    const inside = Math.hypot(x - this.cx, y - this.cy) <= this.R;
    this.cb.onGridCursor?.(this.d2h(disp), sat, e.altKey, inside);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    try { this.canvas.releasePointerCapture(this.drag.pointerId); } catch { /* ignore */ }
    const wasMarquee = this.drag.kind === "marquee";
    this.drag = null;
    if (wasMarquee) { this.finishMarquee(); this.marquee = null; this.draw(); return; }
    this.draw();
    this.emit(true); // write back to node on drag end
  };

  // Move every selected node by the same screen delta (box-select group drag).
  private dragGroup(x: number, y: number) {
    const d = this.drag!;
    const dx = x - d.startX, dy = y - d.startY;
    const spokes = new Set<number>();
    for (const g of d.groupStart!) {
      if (g.ri === 0) continue; // leave the centre out of group moves
      const [disp, sat] = this.toPolar(g.x + dx, g.y + dy);
      this.autonomous.add(this.key(g.ri, g.sj));
      this.setNodePolar(g.ri, g.sj, disp, sat);
      spokes.add(g.sj);
    }
    for (const sj of spokes) this.recomputeSpoke(sj);
  }

  // Transform-box SCALE: drag a corner. Anchor = opposite corner, or the box
  // centre with Alt; Shift keeps it proportional (uniform by distance ratio).
  private dragScale(x: number, y: number, e: PointerEvent) {
    const d = this.drag!, b = d.box!, corner = d.corner!;
    const cx = [b.x0, b.x1, b.x1, b.x0], cy = [b.y0, b.y0, b.y1, b.y1];
    const p0x = cx[corner], p0y = cy[corner];
    let ax: number, ay: number;
    if (e.altKey) { ax = b.cx; ay = b.cy; }
    else { const opp = (corner + 2) % 4; ax = cx[opp]; ay = cy[opp]; }
    let sx = (p0x - ax) !== 0 ? (x - ax) / (p0x - ax) : 1;
    let sy = (p0y - ay) !== 0 ? (y - ay) / (p0y - ay) : 1;
    if (e.shiftKey) {
      const s = Math.hypot(x - ax, y - ay) / (Math.hypot(p0x - ax, p0y - ay) || 1);
      sx = s; sy = s;
    }
    this.applyGroupXform((gx, gy) => [ax + (gx - ax) * sx, ay + (gy - ay) * sy]);
  }

  // Transform-box ROTATE: the top lever pivots the selection around the centre.
  private dragRotate(x: number, y: number) {
    const d = this.drag!, b = d.box!;
    const delta = Math.atan2(y - b.cy, x - b.cx) - d.startAng!;
    const cos = Math.cos(delta), sin = Math.sin(delta);
    this.applyGroupXform((gx, gy) => {
      const ox = gx - b.cx, oy = gy - b.cy;
      return [b.cx + ox * cos - oy * sin, b.cy + ox * sin + oy * cos];
    });
  }

  // Map every snapshot node's screen position through `f`, write it back as an
  // autonomous node, and recompute the affected spokes. Shared by scale/rotate.
  private applyGroupXform(f: (x: number, y: number) => [number, number]) {
    this.drag!.xform = f; // remember it so drawGizmo can show the box transformed
    const spokes = new Set<number>();
    for (const g of this.drag!.groupStart!) {
      if (g.ri === 0) continue;
      const [nx, ny] = f(g.x, g.y);
      const [disp, sat] = this.toPolar(nx, ny);
      this.autonomous.add(this.key(g.ri, g.sj));
      this.setNodePolar(g.ri, g.sj, disp, sat);
      spokes.add(g.sj);
    }
    for (const sj of spokes) this.recomputeSpoke(sj);
  }

  // Select every node whose handle falls inside the marquee rect. A tiny rect
  // (a click, not a drag) clears the selection instead.
  private finishMarquee() {
    const m = this.marquee; if (!m || !this.mesh) return;
    const x0 = Math.min(m[0], m[2]), x1 = Math.max(m[0], m[2]);
    const y0 = Math.min(m[1], m[3]), y1 = Math.max(m[1], m[3]);
    this.selected.clear();
    if (x1 - x0 < MARQUEE_MIN && y1 - y0 < MARQUEE_MIN) return; // click → just clear
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    for (let ri = 1; ri <= R; ri++)
      for (let sj = 0; sj < S; sj++) {
        const [px, py] = this.nodePt(ri, sj);
        if (px >= x0 && px <= x1 && py >= y0 && py <= y1) this.selected.add(this.key(ri, sj));
      }
  }

  // Clear the selection; returns whether there was one (Esc handling).
  clearSelection(): boolean {
    if (!this.selected.size) return false;
    this.selected.clear();
    this.draw();
    return true;
  }

  // Drag a node → it becomes AUTONOMOUS (fixed at the cursor); the dependent nodes
  // on its arm re-interpolate between the autonomous anchors (nearest inward/centre
  // ↔ nearest outward/rim). Other spokes stay put (3DLC hierarchy). Pin All moves
  // only the grabbed node.
  private dragNode(x: number, y: number) {
    const m = this.mesh!;
    const { ri, sj } = this.drag!;
    const [disp, sat] = this.toPolar(x, y);

    // Centre (ri=0) = global neutral cast: store an OKLab (a,b) toward the cursor
    // so gray tints in any direction (not only straight up).
    if (ri === 0) {
      const rad = this.d2h(disp) * Math.PI / 180;
      const C = sat * C_REF;
      m.neutral = [C * Math.cos(rad), C * Math.sin(rad)];
      for (let s = 0; s < m.hue_segments; s++) this.recomputeSpoke(s); // web follows the centre
      return;
    }

    this.autonomous.add(this.key(ri, sj)); // dragging fixes the node
    this.setNodePolar(ri, sj, disp, sat);  // place it under the cursor
    if (!this.pin) this.recomputeSpoke(sj); // dependents follow; Pin = only this node
  }

  // Shift = a normal node drag (dependents follow the same) but on locked SCREEN
  // axes, independent of the node's position: horizontal mouse pivots the hue
  // (rotate around the circle at constant radius), vertical moves it in/out (sat).
  // If the grabbed node belongs to a box-selection, the SAME delta applies to
  // every selected node — each from its OWN starting offsets (relative move).
  private dragShift(x: number, y: number) {
    const m = this.mesh!;
    const R = m.sat_rings;
    const d = this.drag!;
    const { ri, sj, startX, startY, start } = d;
    if (ri === 0) return;
    const dx = x - startX, dy = y - startY;
    if (!d.axis && Math.hypot(dx, dy) > SHIFT_AXIS_MIN) d.axis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    const targets: [number, number][] = this.selected.has(this.key(ri, sj))
      ? [...this.selected].map((k) => k.split(",").map(Number) as [number, number])
      : [[ri, sj]];
    const hues = meshColumnHues(m);
    const spokes = new Set<number>();
    for (const [rr, ss] of targets) {
      if (rr === 0) continue;
      const baseSat = rr / R;
      const snapAngle = this.h2d(hues[ss] + start[rr][ss][0]);
      const snapSat = clamp01(baseSat + start[rr][ss][1]);
      const angle = d.axis === "h" ? snapAngle + dx * SHIFT_ROT_PER_PX : snapAngle; // pivot hue
      const sat = d.axis === "v" ? clamp01(snapSat - dy * SHIFT_SAT_PER_PX) : snapSat; // in/out
      this.autonomous.add(this.key(rr, ss));
      this.setNodePolar(rr, ss, angle, sat);
      spokes.add(ss);
    }
    if (!this.pin) for (const ss of spokes) this.recomputeSpoke(ss); // dependents follow
  }

  private onDblClick = (e: MouseEvent) => {
    if (!this.mesh) return;
    const [x, y] = this.localXY(e);
    const hit = this.hitTest(x, y);
    if (!hit) return;
    const [ri, sj] = hit;
    const o = this.mesh.offsets[ri][sj];
    o[0] = 0; o[1] = 0; o[2] = 0;
    // De-autonomise (back to dependent), except the rim which stays each arm's
    // anchor; then let the spoke recompute so the freed node follows again.
    if (ri !== this.mesh.sat_rings) this.autonomous.delete(this.key(ri, sj));
    if (ri === 0) {
      this.mesh.neutral = [0, 0];
      for (let s = 0; s < this.mesh.hue_segments; s++) this.recomputeSpoke(s); // web returns from the stretch
    } else {
      this.recomputeSpoke(sj);
    }
    this.draw();
    this.emit(true);
    e.preventDefault();
  };

  // Alt+wheel over a node adjusts its luma (dl ∈ [-1,1]) (Phase 6.2). Over a
  // box-selected node the delta applies to every selected node — relative, so
  // each keeps its own prior dl.
  private onWheel = (e: WheelEvent) => {
    if (!this.mesh || !e.altKey) return;
    const [x, y] = this.localXY(e);
    const hit = this.hitTest(x, y);
    if (!hit) return;
    e.preventDefault();
    const targets: [number, number][] = this.selected.has(this.key(hit[0], hit[1]))
      ? [...this.selected].map((k) => k.split(",").map(Number) as [number, number])
      : [hit];
    for (const [rr, ss] of targets) {
      if (rr === 0) continue;
      const o = this.mesh.offsets[rr][ss];
      o[2] = Math.min(Math.max(o[2] - e.deltaY * LUMA_PER_WHEEL, -1), 1);
    }
    this.draw();
    this.emit(true);
  };

  // Reset all offsets to identity (keeps current density) (Phase 8).
  resetAll() {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    for (let rr = 0; rr <= R; rr++)
      for (let ss = 0; ss < S; ss++) this.mesh.offsets[rr][ss] = [0, 0, 0];
    this.mesh.neutral = [0, 0];
    this.initAutonomy();
    this.draw();
    this.emit(true);
  }

  // Change grid density (spokes and/or rings, DaVinci-style). Resets offsets to
  // identity at the new resolution — remapping arbitrary warps across densities
  // isn't meaningful. Columns anchor on the ACTIVE wheel mode's layout.
  setDensity(hueSegments?: number, satRings?: number) {
    const S = hueSegments ?? this.mesh?.hue_segments ?? 12;
    const R = satRings ?? this.mesh?.sat_rings ?? 6;
    this.mesh = meshIdentity(S, R, wheelColumnHues(S, this.anchors));
    this.initAutonomy();
    this.hover = null;
    this.selected.clear();
    this.draw();
    this.emit(true);
  }

  // --- rendering -----------------------------------------------------------

  // Paint the background wheel in ENGINE space: radius = C/C_REF, angle through
  // the active mode's projection. Per sample, L blends from WHEEL_L (centre)
  // to the hue's gamut-cusp L (rim) and chroma is COMPRESSED to the sRGB
  // boundary at constant L/hue — never per-channel clamped, which washed the
  // blue/violet/cyan sectors into one pale tone. Colors are computed on a small
  // polar table (0.5° × NR radii) and bilinearly sampled per pixel, so the cost
  // is independent of canvas resolution.
  private buildWheel() {
    const dw = this.canvas.width, dh = this.canvas.height;
    const key = `${dw}x${dh}:${this.modeName}`;
    if (this.wheel && this.wheelKey === key) return;

    const NA = 720, NR = 48;
    const tab = new Uint8Array(NA * (NR + 1) * 3);
    for (let a = 0; a < NA; a++) {
      const hue = this.d2h(a * 360 / NA);
      const rad = hue * RAD, ca = Math.cos(rad), sb = Math.sin(rad);
      const Lc = cuspL(hue);
      for (let r = 0; r <= NR; r++) {
        const sat = r / NR;
        const L = WHEEL_L + (Lc - WHEEL_L) * sat;
        const C = sat * C_REF * WHEEL_CHROMA;
        let lin = oklabToLinear([L, C * ca, C * sb]);
        if (!linInGamut(lin)) { // out of gamut: show the boundary color, faded
          let lo = 0, hi = C;
          for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            if (linInGamut(oklabToLinear([L, mid * ca, mid * sb]))) lo = mid; else hi = mid;
          }
          lin = oklabToLinear([L, lo * ca, lo * sb]);
          // t² ramp: C1-smooth at the boundary, deepest overshoot dims most.
          // Uniform linear-RGB scaling preserves chromaticity (no hue shift).
          const t = Math.min(1, (C - lo) / (0.35 * C_REF));
          const fade = 1 - WHEEL_OOG_FADE * t * t;
          lin = [lin[0] * fade, lin[1] * fade, lin[2] * fade];
        }
        const o = (a * (NR + 1) + r) * 3;
        tab[o] = srgbByte(lin[0]);
        tab[o + 1] = srgbByte(lin[1]);
        tab[o + 2] = srgbByte(lin[2]);
      }
    }

    const img = new ImageData(dw, dh);
    const data = img.data;
    const cx = this.cx * this.dpr, cy = this.cy * this.dpr, R = this.R * this.dpr;
    for (let y = 0; y < dh; y++) {
      const dy = y - cy;
      for (let x = 0; x < dw; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        const k = (y * dw + x) * 4;
        if (dist > R) { data[k + 3] = 0; continue; }
        let disp = Math.atan2(dy, dx) / RAD + 90;
        disp = ((disp % 360) + 360) % 360;
        const ap = (disp / 360) * NA;
        const a0 = Math.floor(ap) % NA, a1 = (a0 + 1) % NA, fa = ap - Math.floor(ap);
        const rp = Math.min(dist / R, 1) * NR;
        const r0 = Math.min(Math.floor(rp), NR - 1), fr = rp - r0;
        const o00 = (a0 * (NR + 1) + r0) * 3, o01 = o00 + 3;
        const o10 = (a1 * (NR + 1) + r0) * 3, o11 = o10 + 3;
        for (let c = 0; c < 3; c++) {
          const v0 = tab[o00 + c] * (1 - fr) + tab[o01 + c] * fr;
          const v1 = tab[o10 + c] * (1 - fr) + tab[o11 + c] * fr;
          data[k + c] = Math.round(v0 * (1 - fa) + v1 * fa);
        }
        data[k + 3] = 255;
      }
    }
    this.wheel = img;
    this.wheelKey = key;
  }

  // Sample source pixels → ENGINE [oklchHueDeg, sat] cloud (Phase 3). Downsample
  // longest side to ≤256. Engine coords = where the mesh actually warps each
  // pixel; the wheel projection is applied at draw time (h2dFast).
  private buildScatter() {
    if (this.scatter) return;
    if (this.scatter16) { // 16-bit path: continuous, no dither required
      const { data, width: sw, height: sh } = this.scatter16;
      const step = Math.max(1, Math.round(Math.sqrt((sw * sh) / 20000)));
      const out = new Float32Array(Math.ceil(sw / step) * Math.ceil(sh / step) * 2);
      let n = 0;
      for (let y = 0; y < sh; y += step) {
        for (let x = 0; x < sw; x += step) {
          const k = (y * sw + x) * 3;
          const [h, s] = srgbToEngine([data[k] / 65535, data[k + 1] / 65535, data[k + 2] / 65535]);
          out[n++] = h;
          out[n++] = clamp01(s);
        }
      }
      this.scatter = out.subarray(0, n);
      return;
    }
    if (!this.source) return;
    const iw = this.source.width, ih = this.source.height;
    if (!iw || !ih) return;
    const longest = Math.max(iw, ih);
    const scale = longest > 256 ? 256 / longest : 1;
    const sw = Math.max(1, Math.round(iw * scale));
    const sh = Math.max(1, Math.round(ih * scale));
    const tmp = document.createElement("canvas");
    tmp.width = sw; tmp.height = sh;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage(this.source, 0, 0, sw, sh);
    const px = tctx.getImageData(0, 0, sw, sh).data;
    // Cap ≈20k points: the live warp (meshSample per dot per frame) must stay
    // cheap enough to drag at interactive rates; density on screen barely changes.
    const step = Math.max(1, Math.round(Math.sqrt((sw * sh) / 20000)));
    // Deterministic ±0.5 LSB dither: reconstruct the continuous color the 8-bit
    // source quantized. A strong warp STRETCHES color space locally and blows
    // the quantization gaps up into visible streaks; dithering fills them (same
    // reason 3DLC's scope looks smooth). Hash by pixel index → stable frames.
    const dith = (seed: number): number => {
      let v = (seed ^ 0x9e3779b9) >>> 0;
      v = Math.imul(v ^ (v >>> 15), 0x85ebca6b) >>> 0;
      v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35) >>> 0;
      return ((v ^ (v >>> 16)) >>> 0) / 4294967296 - 0.5;
    };
    const out = new Float32Array(Math.ceil(sw / step) * Math.ceil(sh / step) * 2);
    let n = 0;
    for (let y = 0; y < sh; y += step) {
      for (let x = 0; x < sw; x += step) {
        const k = (y * sw + x) * 4;
        const [h, s] = srgbToEngine([
          clamp01((px[k] + dith(k)) / 255),
          clamp01((px[k + 1] + dith(k + 1)) / 255),
          clamp01((px[k + 2] + dith(k + 2)) / 255),
        ]);
        out[n++] = h;
        out[n++] = clamp01(s);
      }
    }
    this.scatter = out.subarray(0, n);
  }

  private draw() {
    if (!this.ctx || this.cssW < 2) return;
    const ctx = this.ctx;

    // Background wheel (device-px, drawn via putImageData → ignores transform).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.buildWheel();
    if (this.wheel) ctx.putImageData(this.wheel, 0, 0);

    // Vector layers in CSS px.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawScatter(ctx);
    this.drawReferenceGrid(ctx);
    if (this.mesh) this.drawWeb(ctx, this.mesh);
    if (this.labels && this.mesh) this.drawLabels(ctx);
    this.drawIndicator(ctx);
    this.drawGizmo(ctx);
    this.drawMarquee(ctx);
  }

  // Free-transform box around a box-selection: a dashed quad, corner scale dots,
  // and a top lever with a rotate handle. While a scale/rotate drag is live, the
  // box is drawn as the SNAPSHOT box mapped through the current transform — so it
  // visibly rotates/scales with the lever (not a re-fitted axis-aligned bbox).
  private drawGizmo(ctx: CanvasRenderingContext2D) {
    if (this.drag?.kind === "marquee") return;
    const active = (this.drag?.kind === "scale" || this.drag?.kind === "rotate") ? this.drag : null;
    let corners: [number, number][];
    if (active?.box && active.xform) {
      const b = active.box, f = active.xform;
      corners = ([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] as [number, number][]).map(([px, py]) => f(px, py));
    } else {
      const box = this.selectionBox();
      if (!box) return;
      corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]];
    }
    const [TL, TR] = corners;
    ctx.save();
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    // Lever from the (possibly rotated) top-edge midpoint, perpendicular outward.
    const midX = (TL[0] + TR[0]) / 2, midY = (TL[1] + TR[1]) / 2;
    const ex = TR[0] - TL[0], ey = TR[1] - TL[1], len = Math.hypot(ex, ey) || 1;
    const tipX = midX + (ey / len) * ROT_LEVER, tipY = midY + (-ex / len) * ROT_LEVER;
    ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.lineWidth = 1.5;
    for (const [hx, hy] of corners) { ctx.beginPath(); ctx.arc(hx, hy, GIZMO_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(tipX, tipY, ROT_HANDLE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawMarquee(ctx: CanvasRenderingContext2D) {
    if (!this.marquee) return;
    const [x0, y0, x1, y1] = this.marquee;
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.save();
    ctx.fillStyle = "rgba(74,180,255,0.10)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // Coordinate labels (letter = spoke, number = ring) next to each node, so
  // drag behaviour can be discussed by exact node name (toolbar "Labels").
  private drawLabels(ctx: CanvasRenderingContext2D) {
    const R = this.mesh!.sat_rings, S = this.mesh!.hue_segments;
    ctx.save();
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = (x: number, y: number, text: string) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x + 9, y - 9);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + 9, y - 9);
    };
    for (let ri = 1; ri <= R; ri++)
      for (let sj = 0; sj < S; sj++) {
        const [x, y] = this.nodePt(ri, sj);
        label(x, y, `${sj < 26 ? String.fromCharCode(65 + sj) : String(sj)}${ri}`);
      }
    const [cx, cy] = this.nodePt(0, 0);
    label(cx, cy, "0");
    ctx.restore();
  }

  // Vectorscope cloud: the dots are pushed through the SAME meshSample +
  // neutral cast the LUT bakes, so the cloud shows live where the image's
  // colors are LANDING. Destination only — a faint source "ghost" was tried
  // and dropped: dense clusters stack alpha into a bright blob that reads as
  // unmoved colors (the Alt mask already shows what a cell grabs).
  private drawScatter(ctx: CanvasRenderingContext2D) {
    this.buildScatter();
    if (!this.scatter) return;
    const s = this.scatter;
    const m = this.mesh;
    const warped = !!m && !isIdentityMesh(m);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    // Dot size scales with the wheel radius (alpha compensated): on a large
    // wheel 1px dots re-expose the 8-bit quantization gaps the dither can't
    // bridge (source gradients that skip levels); soft-bigger dots merge into
    // the density-cloud look of a real scope.
    const d = Math.min(Math.max(this.R / 400, 1), 2.5);
    const o = d / 2;
    ctx.globalAlpha = Math.min(0.5, 0.55 / d);
    for (let i = 0; i < s.length; i += 2) {
      let h = s[i], sat = s[i + 1];
      if (warped) [h, sat] = this.warpPoint(m!, h, sat);
      const [x, y] = this.polar(this.h2dFast(h), sat);
      ctx.fillRect(x - o, y - o, d, d);
    }
    ctx.restore();
  }

  // Engine-space warp of one scatter point: meshSample (dh, ds) + the global
  // neutral (a,b) cast — the polar mirror of what lut.bake does (sans gamut).
  private warpPoint(m: Mesh, h: number, sat: number): [number, number] {
    const [dh, ds] = meshSample(m, h, sat);
    let hue = h + dh;
    let s2 = clamp01(sat + ds);
    const n = m.neutral;
    if (n && (n[0] || n[1])) {
      const C = s2 * C_REF;
      const rad = hue * RAD;
      const a = C * Math.cos(rad) + n[0];
      const b = C * Math.sin(rad) + n[1];
      hue = Math.atan2(b, a) / RAD;
      s2 = clamp01(Math.hypot(a, b) / C_REF);
    }
    return [hue, s2];
  }

  // Static reference net: sat_rings concentric circles + hue_segments spokes.
  // Spokes sit at the PROJECTED column hues — on the wheel the mesh was created
  // in they are display-uniform; other modes show them where they truly act.
  private drawReferenceGrid(ctx: CanvasRenderingContext2D) {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    const hues = meshColumnHues(this.mesh);
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let i = 1; i <= R; i++) {
      const rad = (i / R) * this.R;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let j = 0; j < S; j++) {
      const [x, y] = this.polar(this.h2d(hues[j]), 1);
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Skin-tone reference ray (dashed) + rim label.
    const [sx, sy] = this.polar(this.h2d(SKIN_ENGINE_HUE), 1);
    ctx.save();
    ctx.strokeStyle = SKIN_LINE;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SKIN_LINE;
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    const [lx, ly] = this.polar(this.h2d(SKIN_ENGINE_HUE), 1.045);
    ctx.fillText("skin", lx, ly);
    ctx.restore();
  }

  // The deformable mesh web: each control node placed at its warped position,
  // ring polylines + spoke polylines through them, plus handles.
  private drawWeb(ctx: CanvasRenderingContext2D, mesh: Mesh) {
    const R = mesh.sat_rings, S = mesh.hue_segments;
    const pt = (ri: number, sj: number) => this.nodePt(ri, sj);

    ctx.strokeStyle = WEB_LINE;
    ctx.lineWidth = 1;
    for (let ri = 1; ri <= R; ri++) {
      ctx.beginPath();
      for (let sj = 0; sj <= S; sj++) {
        const [x, y] = pt(ri, sj % S);
        sj ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (let sj = 0; sj < S; sj++) {
      ctx.beginPath();
      for (let ri = 0; ri <= R; ri++) {
        const [x, y] = pt(ri, sj);
        ri ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // Handles. Hovered / dragged node grows to R_HOVER; luma shows as a fill
    // tint (dark = -dl, light = +dl) so per-node brightness reads on the grid.
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    const hovRi = this.drag ? this.drag.ri : this.hover?.[0];
    const hovSj = this.drag ? this.drag.sj : this.hover?.[1];
    const drawHandle = (x: number, y: number, ri: number, sj: number, base: number) => {
      const isHot = ri === hovRi && sj === hovSj;
      const r = isHot ? R_HOVER : base;
      const dl = mesh.offsets[ri][sj][2];
      ctx.fillStyle = dl === 0 ? ACCENT : mixLuma(ACCENT, dl);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isHot) { // bright ring on the active node
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
      } else if (this.selected.has(this.key(ri, sj))) { // box-selected
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.5;
      }
    };
    for (let ri = 1; ri <= R; ri++) {
      for (let sj = 0; sj < S; sj++) {
        const [x, y] = pt(ri, sj);
        // Autonomous nodes read as full handles; dependents as small dots (3DLC).
        drawHandle(x, y, ri, sj, this.autonomous.has(this.key(ri, sj)) ? R_IDLE : R_DEP);
      }
    }
    const [cx0, cy0] = pt(0, 0);
    drawHandle(cx0, cy0, 0, 0, R_CENTER);
  }

  private drawIndicator(ctx: CanvasRenderingContext2D) {
    if (!this.indicator) return;
    const [engHue, sat, css] = this.indicator;
    const [x, y] = this.polar(this.h2dFast(engHue), sat);
    ctx.save();
    ctx.fillStyle = css;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// --- Hue/Luma strip (DaVinci-style second view) ------------------------------
// X = the wheel's display projection unrolled (0..360, same mode/anchors as the
// wheel above); Y = luma offset (dl). One handle per mesh column, editing that
// ARM's dl across all rings — the "make the yellows darker" gesture. Hue moves
// keep L by design (OKLab), so this is where perceived-lightness work happens.
// ponytail: v1 is arm-uniform dl; per-ring luma stays on Alt+wheel over the
// wheel's nodes. A full per-ring luma lattice is the upgrade if this is coarse.

const DL_RANGE = 0.5;   // dl mapped to the strip half-height (clamped visually)
const STRIP_PAD_X = 14;
const STRIP_PAD_Y = 10;
const STRIP_HIT = 16;

export class ColorWarpLumaStrip {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(window.devicePixelRatio || 1, 2);
  private grid: ColorWarpGrid;
  private cssW = 0; private cssH = 0;
  private drag: { sj: number; pointerId: number } | null = null;
  private hover: number | null = null;

  constructor(canvas: HTMLCanvasElement, grid: ColorWarpGrid) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.grid = grid;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("dblclick", this.onDblClick);
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("dblclick", this.onDblClick);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.draw();
  }

  refresh() { this.draw(); }

  private mesh(): Mesh | null { return this.grid.getMesh(); }

  private xOf(displayDeg: number): number {
    return STRIP_PAD_X + (displayDeg / 360) * (this.cssW - 2 * STRIP_PAD_X);
  }
  private yOf(dl: number): number {
    const half = this.cssH / 2 - STRIP_PAD_Y;
    const t = Math.max(-1, Math.min(1, dl / DL_RANGE));
    return this.cssH / 2 - t * half;
  }
  private dlAt(y: number): number {
    const half = this.cssH / 2 - STRIP_PAD_Y;
    return Math.max(-1, Math.min(1, (this.cssH / 2 - y) / half)) * DL_RANGE;
  }

  // Handle per column at its projected x, sorted for the polyline.
  private columns(): { sj: number; x: number; y: number; dl: number }[] {
    const m = this.mesh(); if (!m || this.cssW < 2) return [];
    const hues = meshColumnHues(m);
    const R = m.sat_rings;
    const cols: { sj: number; x: number; y: number; dl: number }[] = [];
    for (let sj = 0; sj < m.hue_segments; sj++) {
      const dl = m.offsets[R][sj][2]; // rim value represents the arm
      cols.push({ sj, x: this.xOf(this.grid.projectHue(hues[sj])), y: this.yOf(dl), dl });
    }
    cols.sort((a, b) => a.x - b.x);
    return cols;
  }

  private localXY(e: PointerEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private hitTest(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = STRIP_HIT * STRIP_HIT;
    for (const c of this.columns()) {
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bestD) { bestD = d; best = c.sj; }
    }
    return best;
  }

  private apply(sj: number, y: number, commit: boolean) {
    const m = this.mesh(); if (!m) return;
    const dl = this.dlAt(y);
    for (let r = 1; r <= m.sat_rings; r++) m.offsets[r][sj][2] = dl;
    this.grid.notifyExternalEdit(commit);
    this.draw();
  }

  private onDown = (e: PointerEvent) => {
    const [x, y] = this.localXY(e);
    const hit = this.hitTest(x, y);
    if (hit == null) return;
    this.drag = { sj: hit, pointerId: e.pointerId };
    this.canvas.setPointerCapture(e.pointerId);
    this.apply(hit, y, false);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.localXY(e);
    if (this.drag) { this.apply(this.drag.sj, y, false); return; }
    const hit = this.hitTest(x, y);
    if (hit !== this.hover) { this.hover = hit; this.draw(); }
    this.canvas.style.cursor = hit == null ? "default" : "ns-resize";
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    try { this.canvas.releasePointerCapture(this.drag.pointerId); } catch { /* ignore */ }
    const sj = this.drag.sj;
    this.drag = null;
    const [, y] = this.localXY(e);
    this.apply(sj, y, true);
  };

  private onDblClick = (e: MouseEvent) => {
    const [x, y] = this.localXY(e);
    const hit = this.hitTest(x, y);
    const m = this.mesh();
    if (hit == null || !m) return;
    for (let r = 1; r <= m.sat_rings; r++) m.offsets[r][hit][2] = 0;
    this.grid.notifyExternalEdit(true);
    this.draw();
    e.preventDefault();
  };

  private draw() {
    const ctx = this.ctx;
    if (!ctx || this.cssW < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#14161b";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = this.mesh(); if (!m) return;

    // Hue bar: the wheel's projection unrolled (moderate chroma at cusp L —
    // always in gamut, decorative orientation only).
    const x0 = STRIP_PAD_X, x1 = this.cssW - STRIP_PAD_X;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let i = 0; i <= 72; i++) {
      const hue = this.grid.engineHueAt((i / 72) * 360);
      const r = hue * RAD;
      const lin = oklabToLinear([cuspL(hue), 0.14 * Math.cos(r), 0.14 * Math.sin(r)]);
      grad.addColorStop(i / 72, `rgb(${srgbByte(lin[0])},${srgbByte(lin[1])},${srgbByte(lin[2])})`);
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grad;
    ctx.fillRect(x0, STRIP_PAD_Y, x1 - x0, this.cssH - 2 * STRIP_PAD_Y);
    ctx.globalAlpha = 1;

    // dl = 0 axis + tiny labels.
    const midY = this.cssH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, midY); ctx.lineTo(x1, midY); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 9px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("+L", 2, STRIP_PAD_Y + 4);
    ctx.fillText("−L", 2, this.cssH - STRIP_PAD_Y - 4);

    // Polyline + handles.
    const cols = this.columns();
    if (!cols.length) return;
    ctx.strokeStyle = WEB_LINE;
    ctx.beginPath();
    cols.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    for (const c of cols) {
      const hot = this.drag ? c.sj === this.drag.sj : c.sj === this.hover;
      ctx.fillStyle = c.dl === 0 ? ACCENT : mixLuma(ACCENT, c.dl);
      ctx.beginPath();
      ctx.arc(c.x, c.y, hot ? R_HOVER : 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (hot) {
        ctx.strokeStyle = "#fff";
        ctx.beginPath(); ctx.arc(c.x, c.y, (hot ? R_HOVER : 5) + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.fillStyle = "#fff";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.fillText(`dl ${c.dl >= 0 ? "+" : ""}${c.dl.toFixed(2)}`, Math.min(c.x + 10, this.cssW - 52), c.y - 10);
      }
    }
  }
}

function isIdentityMesh(m: Mesh): boolean {
  const n = m.neutral;
  if (n && (n[0] !== 0 || n[1] !== 0)) return false;
  for (const ring of m.offsets)
    for (const c of ring) if (c[0] !== 0 || c[1] !== 0 || c[2] !== 0) return false;
  return true;
}

// Tint the accent toward black (dl<0) or white (dl>0) to show per-node luma.
function mixLuma(hex: string, dl: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = Math.min(Math.abs(dl), 1) * 0.7;
  const tgt = dl < 0 ? 0 : 255;
  r = Math.round(r + (tgt - r) * t);
  g = Math.round(g + (tgt - g) * t);
  b = Math.round(b + (tgt - b) * t);
  return `rgb(${r},${g},${b})`;
}
