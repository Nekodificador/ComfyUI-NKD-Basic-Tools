// 😺NKD Color Warp — RYB polar grid canvas (left pane).
// Layers (per nkd-curve-style): hue–sat wheel background (angle = display/RYB,
// radius = saturation) → pixel-cloud scatter → reference rings/spokes → the
// deformable mesh web (nodes at their warped positions) → control handles.
// HiDPI. Wheel + scatter are cached and recomputed only on resize / source
// change; the vector layers redraw per frame (cheap) so drag edits stay live.
//
// Interaction: pointer-capture drag of a node swings its OWN radial column to
// the cursor (straight radial line; only that spoke moves — no angular spread),
// à la 3DLC A/B. Pin All = only the grabbed node. Shift = DaVinci ring/sector
// gesture (horizontal = rotate a sector's hue, vertical = expand/contract a
// ring's sat). Alt+wheel nudges per-node luma. Double-click resets a node.
// Edits are written back through `onEdit(json, commit)`.
import {
  Mesh, hslToSrgb, displayToHue, hueToDisplay, meshToDict, meshIdentity,
} from "./colorCore";

const GRID_LINE = "rgba(120,180,255,0.35)";
const WEB_LINE = "rgba(120,180,255,0.55)";
const ACCENT = "#4ab4ff";
const RAD = Math.PI / 180;

// TEMP debug (2026-07-23): draw A1–F4 coordinate labels on each node so Neko can
// name exact nodes over text. Radius letter = segment (A at top, clockwise);
// number = ring (1 = inner … 4 = rim). Flip to false to remove.
const DEBUG_LABELS = true;

// nkd-curve-style handle radii.
const R_IDLE = 6;
const R_HOVER = 7;
const R_CENTER = 4.5;
const R_DEP = 3;   // dependent (non-autonomous) node → small dot (3DLC-style)
const HIT_PX = 14; // hit-test tolerance in CSS px

// ponytail: interaction tuning knobs — the drag "feel" Neko will eyeball.
// Model (3DLC A/B, confirmed with Neko 2026-07-23): grabbing a node swings its
// OWN radial column to the cursor as a straight radial line (angle = cursor hue,
// sat scales from the centre through the cursor). ONLY that spoke moves — no
// angular spread to neighbours. Pin All = only the grabbed node.
// (Smooth is a future relax tool à la 3DLC, not a drag falloff.)
const SHIFT_ROT_PER_PX = 0.25; // deg of sector hue rotation per px (Shift horiz)
const SHIFT_SAT_PER_PX = 0.003; // ring sat expand/contract per px (Shift vert)
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
  // Grid cursor in polar space every move, plus whether Alt is held — the
  // viewer uses this to drive the Alt affected-region mask on the preview.
  onGridCursor?: (displayDeg: number, sat: number, alt: boolean, inside: boolean) => void;
}

export class ColorWarpGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(window.devicePixelRatio || 1, 2);
  private mesh: Mesh | null = null;
  private source: HTMLCanvasElement | null = null;

  // Public interaction toggles (viewer toolbar drives these).
  smooth = true;
  pin = false;
  cb: GridCallbacks = {};

  // Geometry in CSS px, recomputed on resize.
  private cx = 0; private cy = 0; private R = 0;
  private cssW = 0; private cssH = 0;

  // Cached wheel (device-px ImageData) keyed by device size.
  private wheel: ImageData | null = null;
  private wheelKey = "";

  // Cached scatter: [displayDeg, sat] per sampled pixel, source-independent of size.
  private scatter: Float32Array | null = null;

  // Drag / hover state.
  private hover: [number, number] | null = null; // [ri, sj] under cursor
  private drag: null | {
    kind: "node" | "shift";
    ri: number; sj: number;
    startX: number; startY: number;          // pointer down (CSS px)
    start: number[][][];                       // deep copy of offsets at grab
    pointerId: number;
  } = null;

  // Preview-hover indicator: [displayDeg, sat, cssColor] or null.
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

  // Preview → grid indicator dot (Phase 7.1). Pass null to clear.
  setIndicator(displayDeg: number | null, sat = 0, css = "#fff") {
    this.indicator = displayDeg == null ? null : [displayDeg, sat, css];
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
    const S = m.hue_segments, R = m.sat_rings;
    const baseDisp = sj * 360 / S;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    const hue = displayToHue(baseDisp);
    const warpedHue = hue + off[0] * baseSat;
    const warpedDisp = hueToDisplay(warpedHue);
    const warpedSat = clamp01(baseSat + off[1]);
    return this.polar(warpedDisp, warpedSat);
  }

  // --- autonomy / hierarchy ------------------------------------------------

  private key(ri: number, sj: number): string { return ri + "," + sj; }

  // A node's warped polar position [displayAngle, sat] (polar twin of nodePt).
  private nodePolar(ri: number, sj: number): [number, number] {
    const m = this.mesh!;
    const S = m.hue_segments, R = m.sat_rings;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    const warpedHue = displayToHue(sj * 360 / S) + off[0] * baseSat;
    return [hueToDisplay(warpedHue), clamp01(baseSat + off[1])];
  }

  // Write the offset that places node (ri,sj) at a display angle + sat (keeps luma).
  private setNodePolar(ri: number, sj: number, angle: number, sat: number) {
    const m = this.mesh!;
    const S = m.hue_segments, R = m.sat_rings;
    const baseSat = ri / R;
    const baseHue = displayToHue(sj * 360 / S);
    const o = m.offsets[ri][sj];
    o[0] = wrapDeg(displayToHue(angle) - baseHue) / baseSat;
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
      if (blo === 0) {          // centre has no angle → radial line at the outward anchor
        angle = angA; sat = satA * t;
      } else {
        const [angB, satB] = this.nodePolar(blo, sj);
        angle = angB + wrapDeg(angA - angB) * t;
        sat = satB + (satA - satB) * t;
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

  private emit(commit: boolean) {
    this.cb.onEdit?.(JSON.stringify(meshToDict(this.mesh!)), commit);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.mesh || this.R < 2) return;
    const [x, y] = this.localXY(e);
    if (e.shiftKey) {
      // DaVinci ring/sector gesture — grab the ring & sector under the cursor.
      const [disp, sat] = this.toPolar(x, y);
      const S = this.mesh.hue_segments, R = this.mesh.sat_rings;
      const ri = Math.min(Math.max(Math.round(sat * R), 1), R);
      const sj = ((Math.round(disp / (360 / S)) % S) + S) % S;
      this.drag = { kind: "shift", ri, sj, startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
    } else {
      const hit = this.hitTest(x, y);
      if (!hit) return;
      this.drag = { kind: "node", ri: hit[0], sj: hit[1], startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
    }
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.mesh || this.R < 2) return;
    const [x, y] = this.localXY(e);

    if (this.drag) {
      if (this.drag.kind === "node") this.dragNode(x, y);
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

    // Feed the grid cursor to the viewer (drives the Alt mask on the preview).
    const [disp, sat] = this.toPolar(x, y);
    const inside = Math.hypot(x - this.cx, y - this.cy) <= this.R;
    this.cb.onGridCursor?.(disp, sat, e.altKey, inside);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    try { this.canvas.releasePointerCapture(this.drag.pointerId); } catch { /* ignore */ }
    this.drag = null;
    this.draw();
    this.emit(true); // write back to node on drag end
  };

  // Drag a node → it becomes AUTONOMOUS (fixed at the cursor); the dependent nodes
  // on its arm re-interpolate between the autonomous anchors (nearest inward/centre
  // ↔ nearest outward/rim). Other spokes stay put (3DLC hierarchy). Pin All moves
  // only the grabbed node.
  private dragNode(x: number, y: number) {
    const m = this.mesh!;
    const S = m.hue_segments;
    const { ri, sj } = this.drag!;
    const [disp, sat] = this.toPolar(x, y);

    // Center (ri=0) collapses to a point — apply its radius uniformly.
    if (ri === 0) {
      for (let ss = 0; ss < S; ss++) { const o = m.offsets[0][ss]; o[0] = 0; o[1] = sat; }
      return;
    }

    this.autonomous.add(this.key(ri, sj)); // dragging fixes the node
    this.setNodePolar(ri, sj, disp, sat);  // place it under the cursor
    if (!this.pin) this.recomputeSpoke(sj); // dependents follow; Pin = only this node
  }

  // Shift gesture: horizontal rotates the grabbed sector's hue (dh on every ring
  // of that spoke), vertical expands/contracts the grabbed ring's sat (ds on
  // every segment of that ring). Both act off the grab snapshot.
  private dragShift(x: number, y: number) {
    const m = this.mesh!;
    const S = m.hue_segments, R = m.sat_rings;
    const { ri, sj, startX, startY, start } = this.drag!;
    const dx = x - startX, dy = y - startY;
    const dDh = dx * SHIFT_ROT_PER_PX;   // + = clockwise-ish hue push
    const dDs = -dy * SHIFT_SAT_PER_PX;  // up = expand sat

    // Reset to snapshot, then apply the two independent gestures.
    for (let rr = 0; rr <= R; rr++)
      for (let ss = 0; ss < S; ss++) {
        const o = m.offsets[rr][ss], s0 = start[rr][ss];
        o[0] = s0[0]; o[1] = s0[1]; o[2] = s0[2];
      }
    // Rotate hue of sector sj across all rings.
    for (let rr = 1; rr <= R; rr++) m.offsets[rr][sj][0] = start[rr][sj][0] + dDh;
    // Expand/contract sat of ring ri across all segments.
    for (let ss = 0; ss < S; ss++) m.offsets[ri][ss][1] = start[ri][ss][1] + dDs;
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
    if (ri !== 0) this.recomputeSpoke(sj);
    this.draw();
    this.emit(true);
    e.preventDefault();
  };

  // Alt+wheel over a node adjusts its luma (dl ∈ [-1,1]) (Phase 6.2).
  private onWheel = (e: WheelEvent) => {
    if (!this.mesh || !e.altKey) return;
    const [x, y] = this.localXY(e);
    const hit = this.hitTest(x, y);
    if (!hit) return;
    e.preventDefault();
    const o = this.mesh.offsets[hit[0]][hit[1]];
    o[2] = Math.min(Math.max(o[2] - e.deltaY * LUMA_PER_WHEEL, -1), 1);
    this.draw();
    this.emit(true);
  };

  // Reset all offsets to identity (keeps current density) (Phase 8).
  resetAll() {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    for (let rr = 0; rr <= R; rr++)
      for (let ss = 0; ss < S; ss++) this.mesh.offsets[rr][ss] = [0, 0, 0];
    this.initAutonomy();
    this.draw();
    this.emit(true);
  }

  // Change hue-segment density (8/12). Resets offsets to identity at the new
  // resolution — remapping arbitrary warps across densities isn't meaningful.
  setDensity(hueSegments: number) {
    const rings = this.mesh?.sat_rings ?? 6;
    this.mesh = meshIdentity(hueSegments, rings);
    this.initAutonomy();
    this.hover = null;
    this.draw();
    this.emit(true);
  }

  // --- rendering -----------------------------------------------------------

  private buildWheel() {
    const dw = this.canvas.width, dh = this.canvas.height;
    const key = `${dw}x${dh}`;
    if (this.wheel && this.wheelKey === key) return;
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
        const sat = dist / R;
        let disp = Math.atan2(dy, dx) / RAD + 90;
        disp = ((disp % 360) + 360) % 360;
        const hue = displayToHue(disp);
        const rgb = hslToSrgb([hue, sat, 0.5]);
        data[k] = Math.round(clamp01(rgb[0]) * 255);
        data[k + 1] = Math.round(clamp01(rgb[1]) * 255);
        data[k + 2] = Math.round(clamp01(rgb[2]) * 255);
        data[k + 3] = 255;
      }
    }
    this.wheel = img;
    this.wheelKey = key;
  }

  // Sample source pixels → [displayDeg, sat] cloud (Phase 3). Downsample longest
  // side to ≤256. Uses HSL to match the wheel's hue/sat mapping.
  private buildScatter() {
    if (this.scatter || !this.source) return;
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
    const out = new Float32Array(sw * sh * 2);
    let n = 0;
    for (let i = 0, k = 0; i < sw * sh; i++, k += 4) {
      const r = px[k] / 255, g = px[k + 1] / 255, b = px[k + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      const L = (mx + mn) / 2;
      const S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1) + 1e-12);
      let h = 0;
      if (d !== 0) {
        if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
      }
      h = ((h * 60) % 360 + 360) % 360;
      out[n++] = hueToDisplay(h);
      out[n++] = clamp01(S);
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
    if (DEBUG_LABELS && this.mesh) this.drawLabels(ctx);
    this.drawIndicator(ctx);
  }

  // TEMP: coordinate labels A1–F4 (letter = spoke, number = ring) next to each
  // node, so drag behaviour can be discussed by exact node name.
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
        label(x, y, `${String.fromCharCode(65 + sj)}${ri}`);
      }
    const [cx, cy] = this.nodePt(0, 0);
    label(cx, cy, "0");
    ctx.restore();
  }

  private drawScatter(ctx: CanvasRenderingContext2D) {
    this.buildScatter();
    if (!this.scatter) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const s = this.scatter;
    for (let i = 0; i < s.length; i += 2) {
      const [x, y] = this.polar(s[i], s[i + 1]);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  // Static reference net: sat_rings concentric circles + hue_segments spokes.
  private drawReferenceGrid(ctx: CanvasRenderingContext2D) {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let i = 1; i <= R; i++) {
      const rad = (i / R) * this.R;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let j = 0; j < S; j++) {
      const [x, y] = this.polar(j * 360 / S, 1);
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
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
    const [disp, sat, css] = this.indicator;
    const [x, y] = this.polar(disp, sat);
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
