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
};

type Box = { x0: number; y0: number; x1: number; y1: number }; // source-pixel space

function defaultBox(w: number, h: number): Box {
  return { x0: 0, y0: 0, x1: w, y1: h };
}

function parseRegion(json: string, w: number, h: number): Box {
  if (!json) return defaultBox(w, h);
  try {
    const d = JSON.parse(json);
    const x = Number(d.x) || 0, y = Number(d.y) || 0;
    const bw = Number(d.w) || 1, bh = Number(d.h) || 1;
    return { x0: x * w, y0: y * h, x1: (x + bw) * w, y1: (y + bh) * h };
  } catch {
    return defaultBox(w, h);
  }
}

function serialiseRegion(box: Box, w: number, h: number): string {
  if (w <= 0 || h <= 0) return "";
  return JSON.stringify({
    x: box.x0 / w, y: box.y0 / h, w: (box.x1 - box.x0) / w, h: (box.y1 - box.y0) / h,
  });
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

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

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
  let box: Box = parseRegion(regionW.value, srcW, srcH);
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
  const label = document.createElement("span");
  label.textContent = "Aspect";
  label.style.opacity = "0.6";
  const select = document.createElement("select");
  select.style.cssText = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;" +
    "border-radius:4px;font:11px sans-serif;padding:2px 4px;";
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
    "cursor:pointer;";
  bar.append(label, select, resetBtn);

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
  // no siempre hace falta" — so the margin band only exists in Outpaint mode.
  const modeW = findW(node, "mode");
  const isOutpaint = () => modeW?.value === "Outpaint";
  const margin = () => (isOutpaint() ? MARGIN : 0);

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

    // The crop/outpaint rectangle.
    const [rx0, ry0] = toCanvas(box.x0, box.y0);
    const [rx1, ry1] = toCanvas(box.x1, box.y1);
    const rw = rx1 - rx0, rh = ry1 - ry0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx0, ry0, rw, rh);
    ctx.clip();
    ctx.fillStyle = C.rectFill;
    ctx.fillRect(rx0, ry0, rw, rh);
    // Amber hatch over the part of the rect outside the source — same "generate here"
    // visual language as NKD Timeline's gap band.
    if (box.x0 < 0 || box.y0 < 0 || box.x1 > srcW || box.y1 > srcH) {
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
    ctx.strokeStyle = C.rect;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx0, ry0, rw, rh);

    // Handles: corners always, edges only when aspect is unlocked.
    const locked = ASPECTS[node.properties.nkdCropAspect] != null;
    const pts: [number, number, Handle][] = [
      [rx0, ry0, "nw"], [rx1, ry0, "ne"], [rx0, ry1, "sw"], [rx1, ry1, "se"],
    ];
    if (!locked) {
      pts.push([(rx0 + rx1) / 2, ry0, "n"], [(rx0 + rx1) / 2, ry1, "s"],
               [rx0, (ry0 + ry1) / 2, "w"], [rx1, (ry0 + ry1) / 2, "e"]);
    }
    ctx.fillStyle = C.handle;
    for (const [hx, hy] of pts) {
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const [rx0, ry0] = toCanvas(box.x0, box.y0);
    const [rx1, ry1] = toCanvas(box.x1, box.y1);
    const near = (ax: number, ay: number) => Math.hypot(cx - ax, cy - ay) <= HANDLE_HIT;
    const locked = ASPECTS[node.properties.nkdCropAspect] != null;
    if (near(rx0, ry0)) return "nw";
    if (near(rx1, ry0)) return "ne";
    if (near(rx0, ry1)) return "sw";
    if (near(rx1, ry1)) return "se";
    if (!locked) {
      if (near((rx0 + rx1) / 2, ry0)) return "n";
      if (near((rx0 + rx1) / 2, ry1)) return "s";
      if (near(rx0, (ry0 + ry1) / 2)) return "w";
      if (near(rx1, (ry0 + ry1) / 2)) return "e";
    }
    if (cx >= rx0 && cx <= rx1 && cy >= ry0 && cy <= ry1) return "move";
    return null;
  }

  /** `ratio` overrides the Aspect combo — used for Shift-drag in Free mode, which locks to
   *  whatever ratio the box already had at the start of THIS drag, not a preset. */
  function applyAspect(b: Box, ratio?: number | null): Box {
    const r = ratio ?? ASPECTS[node.properties.nkdCropAspect];
    if (!r) return b;
    const w = b.x1 - b.x0;
    const h = w / r;
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y0 + h };
  }

  /** Mode clamp (Crop mode can't leave the source) then grid snap — the same order and the
   *  same math `_region_box` uses server-side, so the widget shows exactly what gets rendered. */
  function finalizeBox(b: Box): Box {
    let out = b;
    if (!isOutpaint()) {
      out = {
        x0: Math.max(0, out.x0), y0: Math.max(0, out.y0),
        x1: Math.min(srcW, out.x1), y1: Math.min(srcH, out.y1),
      };
    }
    const grid = gridMultiple();
    if (grid) out = snapBox(out, grid, isOutpaint() ? null : srcW, isOutpaint() ? null : srcH);
    return out;
  }

  let drag: { handle: Handle; startBox: Box; startSrc: [number, number] } | null = null;

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
    if (!h) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { handle: h, startBox: { ...box }, startSrc: eventToSource(e) };
    e.stopPropagation();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [sx, sy] = eventToSource(e);
    const dx = sx - drag.startSrc[0], dy = sy - drag.startSrc[1];
    const b0 = drag.startBox;
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
    // all in Crop mode — margin() is 0 there).
    const m = margin();
    const lo = -m, hi = 1 + m;
    next.x0 = Math.max(lo * srcW, next.x0); next.y0 = Math.max(lo * srcH, next.y0);
    next.x1 = Math.min(hi * srcW, next.x1); next.y1 = Math.min(hi * srcH, next.y1);
    if (drag.handle !== "move") {
      // Shift in Free mode locks to the CURRENT bbox ratio (from the drag's start box), not
      // a preset — the same "hold Shift to keep proportions" as any resize handle elsewhere.
      const locked = ASPECTS[node.properties.nkdCropAspect];
      const startW = b0.x1 - b0.x0, startH = b0.y1 - b0.y0;
      const shiftRatio = !locked && e.shiftKey && startH > 0 ? startW / startH : null;
      next = applyAspect(next, locked ?? shiftRatio);
    }
    box = finalizeBox(next);
    draw();
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    regionW.value = serialiseRegion(box, srcW, srcH);
    regionW.callback?.(regionW.value);
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  select.addEventListener("change", () => {
    node.properties.nkdCropAspect = select.value;
    box = finalizeBox(applyAspect(box));
    regionW.value = serialiseRegion(box, srcW, srcH);
    draw();
  });
  resetBtn.addEventListener("click", () => {
    box = finalizeBox(defaultBox(srcW, srcH));
    regionW.value = serialiseRegion(box, srcW, srcH);
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
    regionW.value = serialiseRegion(box, srcW, srcH);
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
    minWidthOf: () => bar.scrollWidth,
    estimate: () => BAR_H + Math.round(CANVAS_W * srcH / srcW)
      + (transport.style.display === "flex" ? TRANSPORT_H : 0),
    getValue: () => regionW.value,
    setValue: (v: string) => { regionW.value = v; box = parseRegion(v, srcW, srcH); draw(); },
    onResize: () => draw(),
  });

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any, data: any) {
    origConfigure?.apply(this, arguments);
    select.value = node.properties.nkdCropAspect ?? "Free";
    box = parseRegion(regionW.value, srcW, srcH);
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

  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    stopPlayback();          // cancels the rAF loop, or a deleted node keeps redrawing forever
    origRemoved?.apply(this, args);
  };

  syncFillWidgetsVisible();
  requestAnimationFrame(() => { refreshSource(); draw(); });
}
