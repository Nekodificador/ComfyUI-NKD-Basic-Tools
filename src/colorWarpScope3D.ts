// 😺NKD Color Warp — 3D vectorscope (3DLC-style), right pane toggle view.
// Point cloud in ENGINE space (OKLab): floor plane = (a, b) normalized by
// C_REF (the wheel seen from above), vertical axis = L. Destination cloud —
// every point is pushed through the same meshSample + neutral cast the LUT
// bakes, colored with its graded color. Optional "trails" draw a faded line
// from each point's source position to its destination.
// Orbit: drag rotates, wheel zooms. Additive blending for the scope-glow look.
// ponytail: warp+color run on CPU per edit (~15-20ms for 20k pts, rAF-debounced);
// move to a GPU transform if it ever limits drag rates.
import { Mesh, meshSample, oklabToSrgb, srgbToOklab, C_REF,
         RADIAL_MODES, RadialModeName, RadialMode,
         SKIN_LOCUS, skinChromaAt } from "./colorCore";

const RAD = Math.PI / 180;

const VERT = `#version 300 es
in vec3 aPos;
in vec3 aCol;
uniform mat4 uMVP;
uniform float uPtSize;
out vec3 vCol;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = uPtSize / max(gl_Position.w, 0.1);
  vCol = aCol;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
uniform float uAlpha;
uniform float uRound; // 1 = round point sprite, 0 = plain (lines)
out vec4 outColor;
void main() {
  float w = 1.0;
  if (uRound > 0.5) {
    vec2 d = gl_PointCoord - 0.5;
    w = smoothstep(0.5, 0.30, length(d));
  }
  outColor = vec4(vCol, uAlpha * w);
}`;
// (sprite edge: 0.5→0.30 keeps a crisp core with a short AA falloff)

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Column-major 4x4 helpers (only what the scope needs).
function matPerspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function matMul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

function matLookAt(eye: number[], center: number[]): Float32Array {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  // up = (0,1,0)
  let xx = zz, xy = 0, xz = -zx; // cross(up, z)
  const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; // cross(z, x)
  const m = new Float32Array(16);
  m[0] = xx; m[4] = xy; m[8] = xz;
  m[1] = yx; m[5] = yy; m[9] = yz;
  m[2] = zx; m[6] = zy; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export class ColorWarpScope3D {
  trails = false;

  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uMVP: WebGLUniformLocation | null = null;
  private uPtSize: WebGLUniformLocation | null = null;
  private uAlpha: WebGLUniformLocation | null = null;
  private uRound: WebGLUniformLocation | null = null;
  private aPos = -1; private aCol = -1;
  private ptsBuf: WebGLBuffer | null = null;
  private trailBuf: WebGLBuffer | null = null;
  private refBuf: WebGLBuffer | null = null;
  private skinBuf: WebGLBuffer | null = null;
  private nPts = 0; private nTrail = 0; private nRef = 0; private nSkin = 0;
  // ≥2 supersamples the mini window so the cloud stays crisp at small sizes.
  private dpr = Math.max(window.devicePixelRatio || 1, 2);

  private mesh: Mesh | null = null;
  private visible = false;
  private dirty = true;
  private raf = 0;

  // Source cloud (built once per source): OKLab positions + source colors.
  private srcLab: Float32Array | null = null; // [L, a, b] * n
  private srcRgb: Float32Array | null = null; // [r, g, b] * n

  // Orbit camera around the L axis midpoint.
  private yaw = -35 * RAD;
  private pitch = -22 * RAD;
  private dist = 2.9;
  private orbiting: number | null = null;
  private lastX = 0; private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.style.touchAction = "none";
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (gl && this.initGL(gl)) this.gl = gl;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private initGL(gl: WebGL2RenderingContext): boolean {
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[ColorWarp scope3d] shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.prog = prog;
    this.uMVP = gl.getUniformLocation(prog, "uMVP");
    this.uPtSize = gl.getUniformLocation(prog, "uPtSize");
    this.uAlpha = gl.getUniformLocation(prog, "uAlpha");
    this.uRound = gl.getUniformLocation(prog, "uRound");
    this.aPos = gl.getAttribLocation(prog, "aPos");
    this.aCol = gl.getAttribLocation(prog, "aCol");
    this.ptsBuf = gl.createBuffer();
    this.trailBuf = gl.createBuffer();
    this.refBuf = gl.createBuffer();
    this.skinBuf = gl.createBuffer();
    this.buildRef(gl);
    this.buildSkin(gl);
    return true;
  }

  // Reference cage: unit chroma circle at L=0.5, faint circles at L=0/1, the
  // neutral axis, and 4 corner posts — enough to read orientation in orbit.
  private buildRef(gl: WebGL2RenderingContext) {
    const v: number[] = [];
    const C = [0.35, 0.45, 0.55]; // line color
    const circle = (y: number) => {
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        v.push(Math.cos(a0), y, Math.sin(a0), ...C, Math.cos(a1), y, Math.sin(a1), ...C);
      }
    };
    circle(0.5);
    circle(0.0);
    circle(1.0);
    v.push(0, 0, 0, ...C, 0, 1, 0, ...C); // neutral axis
    for (let i = 0; i < 4; i++) {         // corner posts
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      v.push(Math.cos(a), 0, Math.sin(a), ...C, Math.cos(a), 1, Math.sin(a), ...C);
    }
    const arr = new Float32Array(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.refBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.nRef = arr.length / 6;
  }

  // Skin locus cage: the hue wedge of SKIN_LOCUS swept up the L axis, with its
  // radius following the measured chroma ceiling — a cone that pinches shut in
  // the shadows, which is the part the 2D disc cannot show. Wireframe rather
  // than a translucent solid: the scope draws additively with depth testing off
  // (a solid would just wash out whatever is behind it), and lines reuse the
  // existing pipeline with no new shader.
  // Rebuilt with the cage because it depends on the radial mode, same as the cloud.
  private buildSkin(gl: WebGL2RenderingContext) {
    const v: number[] = [];
    const C = [0.95, 0.62, 0.42]; // warm, reads as "skin" without competing with the dots
    const { hueLo, hueHi, envelope } = SKIN_LOCUS;
    const L0 = envelope[0][0], L1 = envelope[envelope.length - 1][0];
    const ARC = 12, RUNGS = 9;
    // A point on the cage: hue t∈[0,1] across the wedge, at lightness L.
    const pt = (t: number, L: number): [number, number, number] => {
      const h = (hueLo + (hueHi - hueLo) * t) * RAD;
      const sat = skinChromaAt(L) / C_REF;
      const r = this.radial.toRadius(sat); // same projection as the cloud
      return [r * Math.cos(h), L, r * Math.sin(h)];
    };
    const seg = (a: [number, number, number], b: [number, number, number]) =>
      v.push(a[0], a[1], a[2], ...C, b[0], b[1], b[2], ...C);

    for (let k = 0; k < RUNGS; k++) { // horizontal arcs up the cone
      const L = L0 + (L1 - L0) * (k / (RUNGS - 1));
      for (let i = 0; i < ARC; i++) seg(pt(i / ARC, L), pt((i + 1) / ARC, L));
    }
    for (const t of [0, 1]) {         // the two vertical edges of the wedge
      for (let k = 0; k < RUNGS - 1; k++) {
        const La = L0 + (L1 - L0) * (k / (RUNGS - 1));
        const Lb = L0 + (L1 - L0) * ((k + 1) / (RUNGS - 1));
        seg(pt(t, La), pt(t, Lb));
      }
      seg([0, L0, 0], pt(t, L0));     // close the wedge onto the neutral axis
      seg([0, L1, 0], pt(t, L1));
    }
    const arr = new Float32Array(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skinBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.nSkin = arr.length / 6;
  }

  // --- data ------------------------------------------------------------------

  // Build the source cloud from the 16-bit push (preferred) or a canvas.
  setSource(canvas: HTMLCanvasElement | null,
            s16: { data: Uint16Array; width: number; height: number } | null) {
    let rgb: (i: number) => [number, number, number];
    let sw = 0, sh = 0;
    let imgData: Uint8ClampedArray | null = null;
    if (s16) {
      sw = s16.width; sh = s16.height;
      rgb = (i) => [s16.data[i * 3] / 65535, s16.data[i * 3 + 1] / 65535, s16.data[i * 3 + 2] / 65535];
    } else if (canvas && canvas.width && canvas.height) {
      const long = Math.max(canvas.width, canvas.height);
      const scale = long > 256 ? 256 / long : 1;
      sw = Math.max(1, Math.round(canvas.width * scale));
      sh = Math.max(1, Math.round(canvas.height * scale));
      const tmp = document.createElement("canvas");
      tmp.width = sw; tmp.height = sh;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(canvas, 0, 0, sw, sh);
      imgData = tctx.getImageData(0, 0, sw, sh).data;
      const d = imgData;
      rgb = (i) => [d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255];
    } else {
      this.srcLab = null; this.srcRgb = null; this.dirty = true; this.schedule();
      return;
    }
    const step = Math.max(1, Math.round(Math.sqrt((sw * sh) / 20000)));
    const cap = Math.ceil(sw / step) * Math.ceil(sh / step);
    const lab = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    let n = 0;
    for (let y = 0; y < sh; y += step) {
      for (let x = 0; x < sw; x += step) {
        const [r, g, b] = rgb(y * sw + x);
        const L = srgbToOklab([r, g, b]);
        lab[n * 3] = L[0]; lab[n * 3 + 1] = L[1]; lab[n * 3 + 2] = L[2];
        col[n * 3] = r; col[n * 3 + 1] = g; col[n * 3 + 2] = b;
        n++;
      }
    }
    this.srcLab = lab.subarray(0, n * 3);
    this.srcRgb = col.subarray(0, n * 3);
    this.dirty = true;
    this.schedule();
  }

  setMesh(m: Mesh) { this.mesh = m; this.dirty = true; this.schedule(); }
  // Same radial projection as the 2D wheel — the floor plane IS the wheel seen
  // from above, so if they disagree the two views stop being the same picture.
  setRadialMode(name: RadialModeName) {
    this.radial = RADIAL_MODES[name];
    if (this.gl) this.buildSkin(this.gl); // the cone is drawn in projected radius too
    this.dirty = true;
    this.schedule();
  }
  private radial: RadialMode = RADIAL_MODES.neutral;
  setTrails(t: boolean) { this.trails = t; this.schedule(); }

  setVisible(v: boolean) {
    this.visible = v;
    if (v) { this.resize(); this.schedule(); }
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.schedule();
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    if (this.raf) cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (!gl) return;
    if (this.ptsBuf) gl.deleteBuffer(this.ptsBuf);
    if (this.trailBuf) gl.deleteBuffer(this.trailBuf);
    if (this.refBuf) gl.deleteBuffer(this.refBuf);
    if (this.prog) gl.deleteProgram(this.prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // --- orbit -------------------------------------------------------------------

  private onDown = (e: PointerEvent) => {
    this.orbiting = e.pointerId;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  private onMove = (e: PointerEvent) => {
    if (this.orbiting == null) return;
    // "Grab the cloud" horizontally; vertical inverted per Neko's preference.
    // (Signs re-derived after fixing the mirrored lookAt frame — the previous
    // pair was eyeballed against a 180°-rolled view.)
    this.yaw -= (e.clientX - this.lastX) * 0.008;
    this.pitch += (e.clientY - this.lastY) * 0.008;
    const lim = 88 * RAD;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.schedule();
  };
  private onUp = (e: PointerEvent) => {
    if (this.orbiting == null) return;
    try { this.canvas.releasePointerCapture(this.orbiting); } catch { /* ignore */ }
    this.orbiting = null;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = Math.max(1.4, Math.min(6.0, this.dist * Math.exp(e.deltaY * 0.001)));
    this.schedule();
  };

  // --- render ------------------------------------------------------------------

  private schedule() {
    if (!this.visible || this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  // Radius gain for an OKLab (a,b): displayRadius / sat, so scaling the vector
  // by it lands the point where the 2D wheel draws that same colour.
  private floorGain(a: number, b: number): number {
    const sat = Math.hypot(a, b) / C_REF;
    return sat > 1e-9 ? this.radial.toRadius(sat) / sat : 1;
  }

  // Warp the source cloud through the ENGINE (meshSample + neutral, same math
  // as the LUT bake sans gamut clip) and upload point/trail vertex buffers.
  private rebuild(gl: WebGL2RenderingContext) {
    this.dirty = false;
    const lab = this.srcLab, srcCol = this.srcRgb;
    if (!lab || !srcCol) { this.nPts = 0; this.nTrail = 0; return; }
    const n = lab.length / 3;
    const m = this.mesh;
    const na = m?.neutral?.[0] ?? 0, nb = m?.neutral?.[1] ?? 0;
    const pts = new Float32Array(n * 6);
    const trl = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
      let L2 = L, a2 = a, b2 = b;
      if (m) {
        const C = Math.hypot(a, b);
        const h = ((Math.atan2(b, a) / RAD) % 360 + 360) % 360;
        const sat = C / C_REF;
        const [dh, ds, dl] = meshSample(m, h, sat);
        const C2 = Math.max(sat + ds, 0) * C_REF;
        const h2 = (h + dh) * RAD;
        a2 = C2 * Math.cos(h2) + na;
        b2 = C2 * Math.sin(h2) + nb;
        L2 = clamp01(L + dl);
      }
      const rgb = oklabToSrgb([L2, a2, b2]);
      const r = clamp01(rgb[0]), g = clamp01(rgb[1]), bl = clamp01(rgb[2]);
      // Floor position = (a,b)/C_REF rescaled by the radial mode: the vector's
      // length IS engine sat, so one gain factor moves it to its display radius
      // (direction — the hue — is untouched).
      const dg = this.floorGain(a2, b2);
      const px = a2 / C_REF * dg, py = L2, pz = b2 / C_REF * dg;
      const o = i * 6;
      pts[o] = px; pts[o + 1] = py; pts[o + 2] = pz;
      pts[o + 3] = r; pts[o + 4] = g; pts[o + 5] = bl;
      const t = i * 12;
      const sg = this.floorGain(lab[i * 3 + 1], lab[i * 3 + 2]);
      trl[t] = lab[i * 3 + 1] / C_REF * sg; trl[t + 1] = L; trl[t + 2] = lab[i * 3 + 2] / C_REF * sg;
      trl[t + 3] = srcCol[i * 3] * 0.45; trl[t + 4] = srcCol[i * 3 + 1] * 0.45; trl[t + 5] = srcCol[i * 3 + 2] * 0.45;
      trl[t + 6] = px; trl[t + 7] = py; trl[t + 8] = pz;
      trl[t + 9] = r; trl[t + 10] = g; trl[t + 11] = bl;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
    gl.bufferData(gl.ARRAY_BUFFER, trl, gl.DYNAMIC_DRAW);
    this.nPts = n;
    this.nTrail = n * 2;
  }

  private bindAttribs(gl: WebGL2RenderingContext, buf: WebGLBuffer | null) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.aCol);
    gl.vertexAttribPointer(this.aCol, 3, gl.FLOAT, false, 24, 12);
  }

  private draw() {
    const gl = this.gl;
    if (!gl || !this.prog || !this.visible) return;
    if (this.dirty) this.rebuild(gl);
    const W = this.canvas.width, H = this.canvas.height;
    if (W < 2 || H < 2) return;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.05, 0.057, 0.075, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive scope glow

    const cy = 0.5;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [
      this.dist * cp * Math.sin(this.yaw),
      cy + this.dist * sp,
      this.dist * cp * Math.cos(this.yaw),
    ];
    const mvp = matMul(
      matPerspective(45 * RAD, W / H, 0.1, 30),
      matLookAt(eye, [0, cy, 0]),
    );

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    gl.uniform1f(this.uRound, 0);
    gl.uniform1f(this.uAlpha, 0.4);
    this.bindAttribs(gl, this.refBuf);
    gl.drawArrays(gl.LINES, 0, this.nRef);

    if (this.nSkin) { // skin locus cone, brighter than the neutral cage
      gl.uniform1f(this.uAlpha, 0.55);
      this.bindAttribs(gl, this.skinBuf);
      gl.drawArrays(gl.LINES, 0, this.nSkin);
    }

    if (this.trails && this.nTrail) {
      gl.uniform1f(this.uAlpha, 0.16);
      this.bindAttribs(gl, this.trailBuf);
      gl.drawArrays(gl.LINES, 0, this.nTrail);
    }

    if (this.nPts) {
      gl.uniform1f(this.uRound, 1);
      gl.uniform1f(this.uAlpha, 0.8);
      // Point size scales with the canvas, so the mini window gets small crisp
      // dots instead of the full-pane size blurred down.
      gl.uniform1f(this.uPtSize, Math.max(3, H / 110));
      this.bindAttribs(gl, this.ptsBuf);
      gl.drawArrays(gl.POINTS, 0, this.nPts);
    }
  }
}
