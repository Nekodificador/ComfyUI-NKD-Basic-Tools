/**
 * 😺NKD Mask Picker — Photoshop-style object picking on the node's own preview.
 *
 * "Analyze" queues only this node (ComfyUI's partial execution). Its execute() sends every mask SAM3's
 * segment-everything found, run-length encoded at <=512 px, plus a small JPEG of the image. Hover and
 * clicks are then hit tests against those masks in the browser, with no server call while the mouse
 * moves. A pick is stored as the (point, level) that produced its mask; the next run re-decodes exactly
 * that mask at full resolution.
 *
 * One shared state per node, any number of views on it: the node's preview and the full-screen modal
 * draw the same picks, so the modal never has to move the node's DOM (that fights the auto-height).
 */
import { app as comfyApp } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { findW, hideWidget, mountDomWidget } from "./domHost";
import { openNkdModal } from "./nkd_modal";
import { resolveSource, viewUrl } from "./mediaProbe";

const NODE_NAME = "NKDMaskPicker";
const EXT_NAME = "NKD.BasicTools.MaskPicker";
console.log("[NKD Mask Picker] rev 2");

// a mask comes from a grid point (x, y) or, when forced where nothing was listed, from its own points
type Prompt = { x?: number; y?: number; points?: number[][]; level: number };
type Seg = Prompt & { score: number; area: number; rle: number[] };
type Payload = { w: number; h: number; image: string; image_hd?: string; masks: Seg[] };
type Pick = Prompt & { mode: "add" | "sub"; group?: number };

const HOVER: RGB = [74, 180, 255], PICKED: RGB = [124, 255, 107], CUT: RGB = [70, 70, 70];   // CUT: the dots of cut points
type RGB = [number, number, number];

function unrle(runs: number[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let pos = 0, on = false;
  for (const r of runs) { if (on) out.fill(1, pos, pos + r); pos += r; on = !on; }
  return out;
}

const pointsOf = (p: Prompt) => p.points ?? [[p.x!, p.y!]];
const samePick = (p: Pick, s: Seg) => {
  const a = pointsOf(p), b = pointsOf(s);
  return p.level === s.level && !p.points === !s.points && a.length === b.length &&
    a.every((q, i) => Math.abs(q[0] - b[i][0]) < 1e-3 && Math.abs(q[1] - b[i][1]) < 1e-3);
};
const DRAG = 4, POINT_STEP = 24, MAX_POINTS = 8;   // preview px
type Stroke = { x: number; y: number; hover: number; cut: boolean; keep: boolean; group: number;
  dragging: boolean; points: number[][]; before: Pick[]; seen: Set<number> };

class PickerState {
  payload: Payload | null = null;
  bits: Uint8Array[] = [];
  picks: Pick[] = [];
  backdrop: HTMLImageElement | null = null;
  hover = -1;
  depth = 0;          // wheel: 0 = smallest object under the cursor
  under: number[] = [];
  analyzing = false;
  again = false;      // a forced pick came in while analyzing: analyze once more when it ends
  analyze = () => {};
  canAutoAnalyze = () => true;   // false inside a subgraph, where Analyze runs the whole workflow
  stroke: Stroke | null = null;
  showMask = false;
  // ponytail: ~0.7 MB per hovered mask per colour at 512 px; upgrade: one white canvas per mask, tinted on draw
  private tints = new Map<string, HTMLCanvasElement>();
  readonly views = new Set<() => void>();

  constructor(private save: (picks: Pick[]) => void) {}

  redraw() { for (const v of this.views) v(); }

  setPayload(p: Payload) {
    if (p === this.payload) return;
    const running = this.analyzing;
    this.payload = p;
    this.abort();   // its hover indexes the old masks
    this.bits = p.masks.map((m) => unrle(m.rle, p.w * p.h));
    const kept = this.picks.filter((pk) => pk.points || p.masks.some((s) => samePick(pk, s)));
    if (kept.length !== this.picks.length) { this.picks = kept; this.save(kept); }
    this.tints.clear();
    this.hover = -1; this.under = []; this.analyzing = false;
    if (this.again && running) { this.again = false; this.analyze(); }
    const img = new Image();
    img.onload = () => { this.backdrop = img; this.redraw(); };
    img.src = p.image_hd ?? p.image;
  }

  setBackdropUrl(url: string) {
    if (this.payload) return;
    const img = new Image();
    img.onload = () => { if (!this.payload) { this.backdrop = img; this.redraw(); } };
    img.src = url;
  }

  /** Masks under preview pixel (px, py), smallest first. */
  hitTest(px: number, py: number): number[] {
    const p = this.payload;
    if (!p || px < 0 || py < 0 || px >= p.w || py >= p.h) return [];
    const i = py * p.w + px;
    return this.bits.map((b, k) => (b[i] ? k : -1)).filter((k) => k >= 0)
      .sort((a, b) => p.masks[a].area - p.masks[b].area);
  }

  hoverAt(px: number, py: number) {
    const under = this.hitTest(px, py);
    const changed = under.join() !== this.under.join();
    if (changed) {
      const i = under.indexOf(this.hover);
      this.under = under; this.depth = i >= 0 ? i : 0;
    }
    const hover = under.length ? under[Math.min(this.depth, under.length - 1)] : -1;
    if (hover === this.hover && !changed) return;
    this.hover = hover;
    this.redraw();
  }

  step(delta: number) {
    if (this.under.length < 2) return false;
    this.depth = Math.max(0, Math.min(this.under.length - 1, this.depth + delta));
    this.hover = this.under[this.depth];
    this.redraw();
    return true;
  }

  nextGroup() { return Math.max(-1, ...this.picks.map((p) => p.group ?? -1)) + 1; }

  /** Pick listed mask k unless it is already picked; false when it was. */
  add(k: number, cut: boolean, group: number) {
    const s = this.payload!.masks[k];
    if (this.picks.some((p) => samePick(p, s))) return false;
    const prompt: Prompt = s.points ? { points: s.points, level: s.level } : { x: s.x, y: s.y, level: s.level };
    this.picks.push({ ...prompt, mode: cut ? "sub" : "add", group });
    return true;
  }

  /** Listed masks picked to add. */
  added(): number[] { return this.pickedSegs().filter((x) => x.mode === "add").map((x) => x.k); }

  /** Whether mask k overlaps what is picked. */
  overlaps(k: number) {
    const b = this.bits[k];
    return this.added().some((a) => { const o = this.bits[a]; return b.some((on, i) => on && o[i]); });
  }

  /** Alt: take mask k's area out of the selection. Its own add pick goes, and a cut covers whatever other picks
   *  still mark there. Nothing marked under it: nothing to do. */
  cutOut(k: number, group: number) {
    if (!this.overlaps(k)) return false;
    const at = this.picks.findIndex((p) => samePick(p, this.payload!.masks[k]));
    if (at >= 0 && this.picks[at].mode === "sub") return false;
    if (at >= 0) this.picks.splice(at, 1);
    if (this.overlaps(k)) this.add(k, true, group);
    if (!this.picks.some((p) => p.mode === "add")) this.picks = [];   // cuts with nothing left to cut
    return true;
  }

  /** Whether preview pixel (px, py) is inside what is picked. */
  selectedAt(px: number, py: number) {
    const i = py * this.payload!.w + px;
    return this.added().some((a) => this.bits[a][i]);
  }

  /** A mask a stroke passes, once: picked, or with Alt cut out of the selection. */
  take(k: number, st: Stroke) {
    if (st.seen.has(k)) return false;
    st.seen.add(k);
    return st.cut ? this.cutOut(k, st.group) : this.add(k, false, st.group);
  }

  /** A new forced pick where SAM listed nothing: analyze now, or right after the run in progress. */
  force(points: number[][], cut: boolean, group: number) {
    this.picks.push({ points, level: 1, mode: cut ? "sub" : "add", group });
    this.save(this.picks);
    if (!this.canAutoAnalyze()) this.redraw();
    else if (this.analyzing) this.again = true;
    else this.analyze();
  }

  // Press, move, release. Moving up to DRAG px is a click, decided on release: on a mask it toggles it
  // (Shift adds only, Alt cuts it out of the selection), on nothing it forces a point. A drag that starts on a
  // mask picks every mask it hovers (Alt: cuts them out); one that starts on nothing collects points for one
  // forced pick.
  press(px: number, py: number, cut: boolean, keep: boolean) {
    this.hoverAt(px, py);
    this.stroke = { x: px, y: py, hover: this.hover, cut, keep, group: this.nextGroup(), dragging: false, points: [],
      before: this.picks.slice(), seen: new Set() };
  }

  move(px: number, py: number) {
    this.hoverAt(px, py);
    const st = this.stroke;
    if (!st) return;
    if (!st.dragging) {
      if (Math.hypot(px - st.x, py - st.y) <= DRAG) return;
      st.dragging = true;
      if (st.hover < 0) st.points.push([st.x, st.y]);
      else if (this.take(st.hover, st)) this.save(this.picks);
    }
    if (st.hover >= 0) {
      if (this.hover >= 0 && this.take(this.hover, st)) this.save(this.picks);
    } else {
      const last = st.points[st.points.length - 1];
      if (st.points.length < MAX_POINTS && Math.hypot(px - last[0], py - last[1]) >= POINT_STEP) st.points.push([px, py]);
    }
    this.redraw();
  }

  /** Drop the stroke and the picks it added so far. */
  abort() {
    if (!this.stroke) return;
    this.picks = this.stroke.before;
    this.stroke = null;
    this.save(this.picks);
    this.redraw();
  }

  release() {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const p = this.payload!;
    const norm = (q: number[]) => [+((q[0] + 0.5) / p.w).toFixed(5), +((q[1] + 0.5) / p.h).toFixed(5)];
    if (st.hover < 0) {
      // Alt on nothing points SAM at something to cut, so only inside what is picked
      if (!st.cut || this.selectedAt(st.x, st.y))
        this.force((st.dragging ? st.points : [[st.x, st.y]]).map(norm), st.cut, st.group);
    } else if (!st.dragging) {
      const at = this.picks.findIndex((pk) => samePick(pk, p.masks[st.hover]));
      if (st.cut) this.cutOut(st.hover, st.group);
      else if (at >= 0 && !st.keep) this.picks.splice(at, 1);
      else this.add(st.hover, false, st.group);
      this.save(this.picks);
    }
    this.redraw();
  }

  clear() { this.picks = []; this.save(this.picks); this.redraw(); }

  tint(k: number, rgb: RGB, alpha: number): HTMLCanvasElement {
    const key = `${k}/${rgb}/${alpha}`;
    let c = this.tints.get(key);
    if (c) return c;
    const p = this.payload!;
    c = document.createElement("canvas");
    c.width = p.w; c.height = p.h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(p.w, p.h);
    const a = Math.round(alpha * 255);
    this.bits[k].forEach((on, i) => {
      if (!on) return;
      img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = a;
    });
    ctx.putImageData(img, 0, 0);
    this.tints.set(key, c);
    return c;
  }

  /** Listed masks for the current picks, in order. */
  pickedSegs(): Array<{ k: number; mode: "add" | "sub" }> {
    const masks = this.payload?.masks ?? [];
    return this.picks.map((p) => ({ k: masks.findIndex((s) => samePick(p, s)), mode: p.mode }))
      .filter((x) => x.k >= 0);
  }

  status(): string {
    if (this.analyzing) return "Analyzing…";
    if (!this.payload) return "Press Analyze to find the objects";
    if (this.picks.some((pk) => pk.points && !this.payload!.masks.some((s) => samePick(pk, s))))
      return "Press Analyze to look at the new spots";
    return `${this.payload.masks.length} objects · ${this.picks.length} picked`;
  }
}

const BTN = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;border-radius:4px;" +
  "font:11px sans-serif;padding:2px 8px;cursor:pointer;height:22px;display:inline-flex;" +
  "align-items:center;gap:4px;";
const ON = "border-color:#4ab4ff;color:#4ab4ff;";

function button(icon: string, label: string, onClick: () => void, title = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.style.cssText = BTN;
  b.innerHTML = `<i class="pi ${icon}" style="font-size:11px"></i>${label}`;
  b.title = title;
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.onclick = (e) => { e.stopPropagation(); onClick(); };
  return b;
}

/** A preview + toolbar on `state`. Returns its root and an unsubscribe. */
function makeView(state: PickerState, actions: { analyze: () => void; expand?: () => void }, fit?: HTMLElement) {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;" + (fit ? "align-items:center;" : "");
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:4px;align-items:center;flex-wrap:nowrap;";
  const imgBtn = button("pi-image", "Image", () => { state.showMask = false; state.redraw(); });
  const maskBtn = button("pi-circle-fill", "Mask", () => { state.showMask = true; state.redraw(); });
  const status = document.createElement("span");
  status.style.cssText = "flex:1;font:11px sans-serif;color:rgba(255,255,255,0.45);white-space:nowrap;" +
    "overflow:hidden;text-overflow:ellipsis;";
  bar.append(imgBtn, maskBtn, status,
    button("pi-refresh", "Analyze", actions.analyze, "Find every object in the image"),
    button("pi-times", "", () => state.clear(), "Clear the selection"));
  if (actions.expand) bar.append(button("pi-expand", "", actions.expand, "Open full screen"));

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;display:block;border-radius:6px;background:#111318;cursor:crosshair;outline:none;";
  root.append(bar, canvas);
  // Vue nodes forward wheel to the graph unless the target sits in data-capture-wheel AND holds focus
  canvas.dataset.captureWheel = "true";
  canvas.tabIndex = -1;
  canvas.addEventListener("pointerenter", () => {
    const a = document.activeElement as HTMLElement | null;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    canvas.focus({ preventScroll: true });
  });

  const toPreview = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const p = state.payload!;
    return [Math.floor(((e.clientX - r.left) / r.width) * p.w), Math.floor(((e.clientY - r.top) / r.height) * p.h)];
  };
  canvas.addEventListener("pointermove", (e) => {
    if (!state.payload) return;
    if (state.stroke) {
      e.stopPropagation();
      if (!(e.buttons & 1)) state.abort();   // its release went elsewhere, e.g. the modal closed mid-drag
    }
    state.move(...toPreview(e));
  });
  canvas.addEventListener("pointerleave", () => {
    if (state.stroke) return;
    state.hover = -1; state.under = []; state.redraw();
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();                       // or LiteGraph starts dragging the node
    if (!state.payload) return;
    canvas.setPointerCapture(e.pointerId);     // the stroke gets its moves and release outside the canvas too
    state.press(...toPreview(e), e.altKey, e.shiftKey);
  });
  const end = (e: PointerEvent) => { if (state.stroke) { e.stopPropagation(); state.release(); } };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => state.abort());
  canvas.addEventListener("lostpointercapture", () => state.abort());   // after pointerup the stroke is already gone
  canvas.addEventListener("wheel", (e) => {
    if (!state.payload || !state.under.length) return;
    state.step(e.deltaY < 0 ? 1 : -1);
    e.preventDefault(); e.stopPropagation();
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const layer = document.createElement("canvas");
  const draw = () => {
    status.textContent = status.title = state.status();
    imgBtn.style.cssText = BTN + (state.showMask ? "" : ON);
    maskBtn.style.cssText = BTN + (state.showMask ? ON : "");
    const p = state.payload;
    const b = state.backdrop, k = b ? Math.min(1, 512 / Math.max(b.naturalWidth, b.naturalHeight)) : 1;
    const w = p?.w ?? Math.round((b?.naturalWidth ?? 512) * k), h = p?.h ?? Math.round((b?.naturalHeight ?? 288) * k);
    // the node draws at preview size; full screen draws at screen size, up to the photo's own (2048 px at most)
    let z = 1, dot = 3.5;
    if (fit) {
      const s = Math.min(fit.clientWidth / w, (fit.clientHeight - bar.offsetHeight - 6) / h);
      dot = 7 / s;   // 7 screen px
      canvas.style.width = Math.floor(w * s) + "px";
      z = Math.max(1, Math.min(s * devicePixelRatio, (b?.naturalWidth ?? w) / w));
    }
    const cw = Math.round(w * z), ch = Math.round(h * z);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    canvas.style.aspectRatio = `${w} / ${h}`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(z, 0, 0, z, 0, 0);   // everything below is drawn in preview pixels
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    const picked = state.pickedSegs();
    if (state.showMask && p) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      for (const { k, mode } of picked) {
        ctx.globalCompositeOperation = mode === "add" ? "source-over" : "destination-out";
        ctx.drawImage(state.tint(k, [255, 255, 255], 1), 0, 0);
      }
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      if (state.backdrop) ctx.drawImage(state.backdrop, 0, 0, w, h);
      // the selection as one green layer, cuts as holes in it
      if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
      const lc = layer.getContext("2d")!;
      lc.clearRect(0, 0, w, h);
      for (const { k, mode } of picked) {
        lc.globalCompositeOperation = mode === "add" ? "source-over" : "destination-out";
        lc.drawImage(state.tint(k, PICKED, 1), 0, 0);
      }
      ctx.globalAlpha = 0.45; ctx.drawImage(layer, 0, 0); ctx.globalAlpha = 1;
    }
    if (state.hover >= 0) ctx.drawImage(state.tint(state.hover, HOVER, 0.4), 0, 0);
    // forced points, and the ones a stroke on nothing is collecting
    const dots: Array<[number, number, boolean]> = state.picks.flatMap((pk) =>
      (pk.points ?? []).map((q): [number, number, boolean] => [q[0] * w, q[1] * h, pk.mode === "add"]));
    const st = state.stroke;
    if (st && st.hover < 0) for (const q of st.points) dots.push([q[0] + 0.5, q[1] + 0.5, !st.cut]);
    ctx.lineWidth = dot * 0.4; ctx.strokeStyle = "#000";
    for (const [x, y, add] of dots) {
      ctx.fillStyle = `rgb(${add ? PICKED : CUT})`;
      ctx.beginPath(); ctx.arc(x, y, dot, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
  };
  state.views.add(draw);
  const ro = fit ? new ResizeObserver(draw) : null;
  ro?.observe(fit!);
  draw();
  return { root, release: () => { state.views.delete(draw); ro?.disconnect(); } };
}

export function registerMaskPicker(): void {
  comfyApp.registerExtension({
    name: EXT_NAME,
    onNodeOutputsUpdated(outputs: Record<string, any>) {
      for (const [id, out] of Object.entries(outputs)) {
        const p = out?.nkd_picker?.[0];
        if (p && !id.includes(":")) comfyApp.rootGraph?.getNodeById(id)?.__nkdPicker?.setPayload(p);
      }
    },
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdMaskPickerWrapped) return;
      nodeType.prototype.__nkdMaskPickerWrapped = true;

      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setup(this);
        return r;
      };
      const origExecuted = nodeType.prototype.onExecuted;
      nodeType.prototype.onExecuted = function (this: any, output: any) {
        origExecuted?.apply(this, arguments);
        const p = output?.nkd_picker?.[0];
        if (p) this.__nkdPicker?.setPayload(p);
      };
    },
  });
}

function setup(node: any): void {
  const selW = findW(node, "selection");
  if (!selW) return;
  hideWidget(selW);
  const state = new PickerState((picks) => {
    selW.value = picks.length ? JSON.stringify({ picks }) : "";
    comfyApp.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.();
  });
  node.__nkdPicker = state;

  const load = () => {
    try { state.picks = selW.value ? JSON.parse(selW.value).picks ?? [] : []; } catch { state.picks = []; }
    const ref = resolveSource(node, "image");
    if (ref) state.setBackdropUrl(viewUrl(ref));
    state.redraw();
  };

  const analyze = () => {
    state.analyzing = true;
    state.redraw();
    // execution ids inside a subgraph are paths, so queueNodeIds can't name this node there
    const queued = node.graph === comfyApp.rootGraph
      ? comfyApp.queuePrompt(0, 1, { queueNodeIds: [String(node.id)] })
      : comfyApp.queuePrompt(0, 1);
    queued.then((ok: boolean) => { if (!ok) stopAnalyzing(); });
  };
  const stopAnalyzing = () => { state.analyzing = false; state.again = false; state.redraw(); };
  state.analyze = analyze;
  state.canAutoAnalyze = () => node.graph === comfyApp.rootGraph;
  api.addEventListener("execution_error", stopAnalyzing);
  api.addEventListener("execution_interrupted", stopAnalyzing);

  let modal: any = null;
  const expand = () => {
    let big: ReturnType<typeof makeView>;
    modal = openNkdModal({
      title: "😺 Mask Picker",
      hint: "hover to see objects · click to pick · drag to pick several as one · Shift+click adds only · " +
        "Alt cuts holes · click or drag on nothing to make SAM look there · wheel: bigger / smaller",
      onClose: () => { big.release(); modal = null; },
    });
    big = makeView(state, { analyze }, modal.body);
    big.root.style.cssText += "height:100%;justify-content:center;";
    modal.body.appendChild(big.root);
    modal.addPrimary("Done");
  };

  const view = makeView(state, { analyze, expand });
  const mounted = mountDomWidget(node, {
    name: "picker", type: "NKD_MASK_PICKER", root: view.root, minWidth: 240,
    estimate: () => Math.round(((node.size?.[0] || 360) - 20) * 0.56) + 30,
  });

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any) { const r = origConfigure?.apply(this, arguments); load(); return r; };
  const origConn = node.onConnectionsChange;
  node.onConnectionsChange = function (this: any) { const r = origConn?.apply(this, arguments); load(); return r; };
  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any) {
    modal?.close();
    api.removeEventListener("execution_error", stopAnalyzing);
    api.removeEventListener("execution_interrupted", stopAnalyzing);
    view.release();
    mounted.release();
    return origRemoved?.apply(this, arguments);
  };
  load();
}
