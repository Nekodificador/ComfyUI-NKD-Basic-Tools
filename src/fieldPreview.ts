/**
 * 😺NKD Field Blur — live preview on the GPU.
 *
 * The one blur here that is worth previewing client-side. Its radius comes from
 * a closed-form weighting of a handful of pins, which is a short loop in a
 * fragment shader, and the blur itself is a mip lookup — so it runs on every
 * mouse move instead of waiting on a round trip. Path Blur cannot do this: its
 * direction field needs a scatter-and-normalize pass that does not belong in a
 * fragment shader.
 *
 * It is a *guide*, not the render. The mip chain is not the backend's blur
 * pyramid, and grain restoration and the protect mask are not modelled here at
 * all. That is why the backend result still arrives on drag-end and takes over:
 * you steer with this and confirm with that.
 */

const MAX_PINS = 64;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // y is flipped on the way in, not on upload. Clip space puts +1 at the top of
  // the screen while an uploaded image puts its top row at v = 0, so the naive
  // aPos * 0.5 + 0.5 samples the picture upside down. Doing it here rather than
  // with UNPACK_FLIP_Y keeps vUv in the same frame as the pins, which are
  // normalized image coordinates with y running down.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform vec3 uPins[${MAX_PINS}];   // x, y, blur (0..1)
uniform int uCount;
uniform float uMaxBlur;            // pixels at texture resolution
uniform float uPower;              // IDW falloff
uniform vec2 uTexel;
uniform int uField;                // 1 = draw the radius field instead
in vec2 vUv;
out vec4 frag;

void main() {
  // Inverse-distance weighting, the same form the backend solves. Distances are
  // in normalized units on both sides, so a non-square image skews identically.
  float num = 0.0, den = 0.0;
  for (int i = 0; i < ${MAX_PINS}; i++) {
    if (i >= uCount) break;
    vec2 d = vUv - uPins[i].xy;
    float w = pow(dot(d, d) + 1e-9, -uPower * 0.5);
    num += w * uPins[i].z;
    den += w;
  }
  float unit = den > 0.0 ? num / den : 0.0;

  if (uField == 1) {
    frag = vec4(vec3(clamp(unit, 0.0, 1.0)), 1.0);
    return;
  }

  float r = unit * uMaxBlur;
  float lod = log2(max(r, 1.0));
  // A handful of taps around the point, because a straight mip lookup goes
  // visibly blocky once the level is high and that reads as an artefact rather
  // than as blur.
  vec3 c = textureLod(uImg, vUv, lod).rgb * 2.0;
  float o = r * 0.5;
  c += textureLod(uImg, vUv + vec2( o, 0.0) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(-o, 0.0) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(0.0,  o) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(0.0, -o) * uTexel, lod).rgb;
  frag = vec4(c / 6.0, 1.0);
}`;

export type PinData = { x: number; y: number; blur: number };

export class FieldPreview {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private ready = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false });
    if (!this.gl) return;                    // caller falls back to the backend
    const gl = this.gl;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[NKD Field Blur] shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { this.gl = null; return; }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[NKD Field Blur] link:", gl.getProgramInfoLog(prog));
      this.gl = null;
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const n of ["uImg", "uPins", "uCount", "uMaxBlur", "uPower", "uTexel", "uField"]) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
  }

  get available(): boolean {
    return !!this.gl && this.ready;
  }

  /** Upload the backdrop. Mipmaps are the blur, so they are built once here. */
  setImage(src: CanvasImageSource, w: number, h: number): void {
    const gl = this.gl;
    if (!gl) return;
    this.canvas.width = Math.max(1, w);
    this.canvas.height = Math.max(1, h);
    if (!this.tex) this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as any);
    } catch {
      this.ready = false;
      return;
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ready = true;
  }

  /** Repaint. `field` draws the radius map instead of the blurred image. */
  render(pins: PinData[], maxBlur: number, falloff: number, field: boolean): boolean {
    const gl = this.gl;
    if (!gl || !this.ready || !this.prog) return false;

    const n = Math.min(pins.length, MAX_PINS);
    const flat = new Float32Array(MAX_PINS * 3);
    for (let i = 0; i < n; i++) {
      flat[i * 3] = pins[i].x;
      flat[i * 3 + 1] = pins[i].y;
      flat[i * 3 + 2] = pins[i].blur;
    }

    gl.useProgram(this.prog);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uImg, 0);
    gl.uniform3fv(this.loc.uPins, flat);
    gl.uniform1i(this.loc.uCount, n);
    // The texture may be smaller than the full image; the radius has to shrink
    // with it or the preview would blur harder than the render.
    gl.uniform1f(this.loc.uMaxBlur, maxBlur);
    gl.uniform1f(this.loc.uPower, falloff);
    gl.uniform2f(this.loc.uTexel, 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1i(this.loc.uField, field ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.prog) gl.deleteProgram(this.prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.ready = false;
  }
}
