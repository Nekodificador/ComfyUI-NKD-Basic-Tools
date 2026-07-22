// 😺NKD Color Warp — RYB polar grid canvas (left pane).
// Layers (per nkd-curve-style): hue–sat wheel background (angle = display/RYB,
// radius = saturation) → pixel-cloud scatter → reference rings/spokes → the
// deformable mesh web (nodes at their warped positions) → control handles.
// HiDPI. Wheel + scatter are cached and recomputed only on resize / source
// change; the vector layers redraw per frame (cheap) so drag edits stay live.
import {
  Mesh, hslToSrgb, displayToHue, hueToDisplay,
} from "./colorCore";

const GRID_LINE = "rgba(120,180,255,0.35)";
const WEB_LINE = "rgba(120,180,255,0.55)";
const ACCENT = "#4ab4ff";
const RAD = Math.PI / 180;

// Angle convention: display 0° at top (12 o'clock), increasing clockwise.
// (Canvas y is down, so +sin points down.) Flagged for Neko to eyeball — this
// is the one free choice in the RYB layout and easy to rotate/flip here.
function angleRad(displayDeg: number): number {
  return (displayDeg - 90) * RAD;
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

export class ColorWarpGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(window.devicePixelRatio || 1, 2);
  private mesh: Mesh | null = null;
  private source: HTMLCanvasElement | null = null;

  // Geometry in CSS px, recomputed on resize.
  private cx = 0; private cy = 0; private R = 0;
  private cssW = 0; private cssH = 0;

  // Cached wheel (device-px ImageData) keyed by device size.
  private wheel: ImageData | null = null;
  private wheelKey = "";

  // Cached scatter: [displayDeg, sat] per sampled pixel, source-independent of size.
  private scatter: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  setMesh(mesh: Mesh) { this.mesh = mesh; this.draw(); }

  setSource(src: HTMLCanvasElement) {
    this.source = src;
    this.scatter = null; // recompute lazily in draw()
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

  dispose() { /* no listeners of our own */ }

  // display angle + normalized sat → CSS-px screen point.
  private polar(displayDeg: number, sat: number): [number, number] {
    const a = angleRad(displayDeg);
    const r = sat * this.R;
    return [this.cx + r * Math.cos(a), this.cy + r * Math.sin(a)];
  }

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
        // atan2(dy,dx) with our convention: displayDeg = atan2 angle + 90.
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
      // HSL inline (S,L only need max/min); reuse srgbToHsl mapping.
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
  // ring polylines + spoke polylines through them, plus handles. Identity mesh
  // ⇒ nodes sit on the reference intersections (undistorted web centered).
  private drawWeb(ctx: CanvasRenderingContext2D, mesh: Mesh) {
    const R = mesh.sat_rings, S = mesh.hue_segments;
    const pt = (ri: number, sj: number): [number, number] => {
      const baseDisp = sj * 360 / S;
      const baseSat = ri / R;
      const off = mesh.offsets[ri][sj]; // [dhRaw, ds, dl]
      const hue = displayToHue(baseDisp);
      const warpedHue = hue + off[0] * baseSat; // center-safe (matches meshSample)
      const warpedDisp = hueToDisplay(warpedHue);
      const warpedSat = clamp01(baseSat + off[1]);
      return this.polar(warpedDisp, warpedSat);
    };

    ctx.strokeStyle = WEB_LINE;
    ctx.lineWidth = 1;
    // Ring polylines (closed) for ri ≥ 1 (ri 0 is the center point).
    for (let ri = 1; ri <= R; ri++) {
      ctx.beginPath();
      for (let sj = 0; sj <= S; sj++) {
        const [x, y] = pt(ri, sj % S);
        sj ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // Spoke polylines from center out.
    for (let sj = 0; sj < S; sj++) {
      ctx.beginPath();
      for (let ri = 0; ri <= R; ri++) {
        const [x, y] = pt(ri, sj);
        ri ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // Handles (nkd-curve-style radius 6). Skip the R+1 center duplicates —
    // ri 0 collapses to one point; draw it once.
    ctx.fillStyle = ACCENT;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    const drawHandle = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    for (let ri = 1; ri <= R; ri++) {
      for (let sj = 0; sj < S; sj++) {
        const [x, y] = pt(ri, sj);
        drawHandle(x, y, 6);
      }
    }
    // Single center handle.
    const [cx0, cy0] = pt(0, 0);
    drawHandle(cx0, cy0, 6);
  }
}
