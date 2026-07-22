// 😺NKD Color Warp — WebGL2 live preview (right pane).
// Applies the baked 3D LUT (bakeLut, size 33) to the source image in-shader via
// a hardware-trilinear TEXTURE_3D. Red = axis 0 (RGB → 3D texcoords x=r,y=g,z=b)
// to match the LUT layout in colorCore. If WebGL2 / 3D textures are unavailable
// it falls back to a CPU applyRgb pass at reduced resolution (still correct,
// just slower). Mesh changes rebake + re-upload the LUT, debounced with rAF.
import { Mesh, bakeLut, applyRgb } from "./colorCore";

const LUT_SIZE = 33;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uImg;
uniform highp sampler3D uLut;
uniform float uN;
out vec4 outColor;
void main() {
  vec3 c = clamp(texture(uImg, vUv).rgb, 0.0, 1.0);
  // Half-texel scale/offset so grid endpoints hit texel centers — matches the
  // CPU applyRgb which samples on the [0, N-1] integer lattice.
  vec3 coord = (c * (uN - 1.0) + 0.5) / uN;
  outColor = vec4(texture(uLut, coord).rgb, 1.0);
}`;

export class ColorWarpPreview {
  private canvas: HTMLCanvasElement;
  private dpr = Math.max(window.devicePixelRatio || 1, 1);
  private mesh: Mesh | null = null;
  private source: HTMLCanvasElement | null = null;

  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private imgTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uImg = -1; private uLut = -1; private uN = -1;
  private cpu = false;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private lutDirty = true;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (gl && this.initGL(gl)) {
      this.gl = gl;
    } else {
      // Fallback: reduced-res CPU LUT apply on a 2D context.
      this.cpu = true;
      this.ctx2d = canvas.getContext("2d");
    }
  }

  private initGL(gl: WebGL2RenderingContext): boolean {
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[ColorWarp] shader compile failed:", gl.getShaderInfoLog(s));
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[ColorWarp] program link failed:", gl.getProgramInfoLog(prog));
      return false;
    }
    this.prog = prog;
    this.uImg = gl.getUniformLocation(prog, "uImg") as any;
    this.uLut = gl.getUniformLocation(prog, "uLut") as any;
    this.uN = gl.getUniformLocation(prog, "uN") as any;

    // Fullscreen quad.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    this.imgTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    return true;
  }

  setMesh(mesh: Mesh) {
    this.mesh = mesh;
    this.lutDirty = true;
    this.schedule();
  }

  setSource(src: HTMLCanvasElement) {
    this.source = src;
    if (this.gl) this.uploadImage();
    this.schedule();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.render();
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (!gl) return;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.prog) gl.deleteProgram(this.prog);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }

  // Debounce rebake/re-upload + render into one rAF (Phase 4.2).
  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private uploadImage() {
    const gl = this.gl;
    if (!gl || !this.source) return;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Rebake the 3D LUT and upload as an RGBA8 TEXTURE_3D. RGBA8 is always
  // LINEAR-filterable (float 3D textures need OES_texture_float_linear, which
  // isn't guaranteed) — 8-bit precision is ample for a screen preview.
  private uploadLut() {
    const gl = this.gl;
    if (!gl || !this.mesh) return;
    const size = LUT_SIZE;
    const lut = bakeLut(this.mesh, size); // Float64Array, idx ((r*size+g)*size+b)*3
    // Repack so the texel at (x,y,z)=(r,g,b) — data order x fastest — holds
    // lut[r,g,b]. dst index = (r + g*size + b*size*size)*4.
    const data = new Uint8Array(size * size * size * 4);
    for (let r = 0; r < size; r++) {
      for (let g = 0; g < size; g++) {
        for (let b = 0; b < size; b++) {
          const s = ((r * size + g) * size + b) * 3;
          const d = (r + g * size + b * size * size) * 4;
          data[d] = Math.round(lut[s] * 255);
          data[d + 1] = Math.round(lut[s + 1] * 255);
          data[d + 2] = Math.round(lut[s + 2] * 255);
          data[d + 3] = 255;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    this.lutDirty = false;
  }

  private render() {
    if (this.cpu) return this.renderCPU();
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.067, 0.075, 0.094, 1); // #111318
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.source || !this.mesh) return;
    if (this.lutDirty) this.uploadLut();

    // Letterbox: fit image aspect into the pane via viewport.
    const iw = this.source.width, ih = this.source.height;
    const r = Math.min(W / iw, H / ih);
    const dw = iw * r, dh = ih * r;
    gl.viewport(Math.round((W - dw) / 2), Math.round((H - dh) / 2),
      Math.round(dw), Math.round(dh));

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(this.uImg, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(this.uLut, 1);
    gl.uniform1f(this.uN, LUT_SIZE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // CPU fallback: apply the LUT to a ≤512px copy and blit letterboxed.
  private renderCPU() {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, W, H);
    if (!this.source || !this.mesh) return;

    const lut = bakeLut(this.mesh, LUT_SIZE);
    const iw = this.source.width, ih = this.source.height;
    const longest = Math.max(iw, ih);
    const scale = longest > 512 ? 512 / longest : 1;
    const sw = Math.max(1, Math.round(iw * scale));
    const sh = Math.max(1, Math.round(ih * scale));
    const tmp = document.createElement("canvas");
    tmp.width = sw; tmp.height = sh;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage(this.source, 0, 0, sw, sh);
    const img = tctx.getImageData(0, 0, sw, sh);
    const px = img.data;
    for (let k = 0; k < px.length; k += 4) {
      const rgb = applyRgb(lut, LUT_SIZE, [px[k] / 255, px[k + 1] / 255, px[k + 2] / 255]);
      px[k] = Math.round(rgb[0] * 255);
      px[k + 1] = Math.round(rgb[1] * 255);
      px[k + 2] = Math.round(rgb[2] * 255);
    }
    tctx.putImageData(img, 0, 0);

    const r = Math.min(W / iw, H / ih);
    const dw = iw * r, dh = ih * r;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
}
