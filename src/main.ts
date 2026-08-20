// 😺NKD Prompt Variables — chips editor widget.
// Hides the raw `text` string widget and mounts a Vue contenteditable editor
// that renders {variable_N} tokens as chips, one insert button per socket.
import { app as comfyApp } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createApp } from "vue";
import PromptVariablesWidget from "./PromptVariablesWidget.vue";
import ColorRampWidget from "./ColorRampWidget.vue";
import GradientPreviewWidget from "./GradientPreviewWidget.vue";
import GradientMapPreviewWidget from "./GradientMapPreviewWidget.vue";
import NoisePreviewWidget from "./NoisePreviewWidget.vue";
import FrequencyPreviewWidget from "./FrequencyPreviewWidget.vue";
import { openColorWarpViewer, ColorWarpViewerHandle } from "./colorWarpViewer";
import { openSplineOverlay, type SplineOverlayHandle } from "./splineOverlay";
import { mountFaceRig } from "./faceRig";
import type { EditorMode } from "./splineEditor";
import { guardPackWidgetOrder } from "./schemaGuard";

// Widget-order guard for EVERY node in the pack (see schemaGuard.ts / the nkd-node
// skill). v1 = restore-by-name only, never toasts; bump a node's version ONLY on a
// deliberate breaking reorder of its widgets.
guardPackWidgetOrder("NKD.BasicTools.SchemaGuard", {
  NKDInpaintCrop: 1, NKDInpaintStitch: 1, NKDStringSplit: 1, NKDPromptVariables: 1,
  NKDGradientMap: 1, NKDGradientGenerate: 1, NKDFilmGrain: 1, NKDNoise: 1,
  NKDFrequencySeparate: 1, NKDFrequencyCombine: 1, NKDColorWarp: 1,
  NKDMaskOps: 1, NKDMaskOpsLean: 1, NKDAudioMask: 1, NKDAVLatent: 1,
  NKDMaskPainter: 1, NKDVectorMask: 1, NKDFieldBlur: 1, NKDPathBlur: 1,
  NKDFaceRig: 1,
});

const NODE_NAME = "NKDPromptVariables";
const EXT_NAME = "NKD.BasicTools.PromptVariables.Vue";

const MIN_W = 300;
const MIN_EDITOR_H = 190;

// Content-driven DOM-widget sizing (the NKD Relight / Lens Blur pattern).
// The Vue root is NOT height:100% — it sizes to its content — so we measure
// the real rendered height and report THAT as the widget height, resizing the
// node to match. No fixed-formula reservation, so no clipping and no empty
// space regardless of ComfyUI's wrapper margins or the content's aspect.
const ROW_SAFETY = 8;

function sizeDomWidgetToContent(
  node: any, domWidget: any, container: HTMLElement, minW: number,
  estimate: (width: number) => number,
): ResizeObserver {
  let measuredH = 0;
  let raf = 0;         // coalesce: at most one resize scheduled at a time
  let settling = false; // ignore the RO fire our own setSize may provoke
  const inner = (container.firstElementChild as HTMLElement | null) ?? container;
  // ComfyUI's CLASSIC (LiteGraph) DOM-widget host mis-sizes on selection /
  // re-layout in current frontends — the widget either balloons to the full
  // graph-canvas width or collapses to ~half — while node.size[0] (the logical
  // width) stays correct. Nodes 2.0 (Vue) lays out fine. Community diagnosis:
  // Banodoco dev-chatter + ComfyUI-qwenmultiangle. Fix: in classic mode pin the
  // container back to node.size[0] (the host is zoom-scaled by a CSS transform,
  // so inside it CSS px == LiteGraph units). Two-directional so it follows both
  // the collapse (too narrow) and legit node resizes (too wide). The margin is
  // self-calibrated from the widest good sample and capped, so a node that
  // loads already-collapsed still recovers. Fixes every NKD DOM widget at once.
  const MAX_MARGIN = 40; // widest plausible horizontal inset of the widget
  const vueMode = () => !!(window as any).LiteGraph?.vueNodesMode; // Kijai: the mode flag
  let enforcingW = false;
  let goodMargin = 15; // widget's horizontal inset; refined from clean samples
  // Use the PARENT host (ComfyUI's div.dom-widget) width as an INDEPENDENT
  // broken-state detector — independent of whatever width we force on our own
  // container, so there is no observe/override oscillation.
  //   host healthy  -> let width:100% ride (adapts to resize) AND read the
  //                    natural width to calibrate `goodMargin`.
  //   host ballooned or collapsed -> pin our container to node.size[0] − margin
  //                    (the correct width, tracks resize, no ~15px overshoot).
  const clampWidth = () => {
    if (enforcingW) return;
    if (vueMode()) { if (container.style.width) container.style.width = ""; return; }
    const nodeW = node.size?.[0];
    if (!nodeW) return;
    const host = container.parentElement;
    const hostW = host ? host.clientWidth : 0;
    const broken = hostW > 0 && (hostW > nodeW * 1.2 || hostW < nodeW * 0.7);
    if (!broken) {
      if (container.style.width) { enforcingW = true; container.style.width = ""; requestAnimationFrame(() => { enforcingW = false; }); }
      const cw = container.clientWidth; // natural width — calibrate the inset
      if (cw > 0 && cw <= nodeW && cw >= nodeW - MAX_MARGIN) goodMargin = nodeW - cw;
      return;
    }
    const ref = Math.round(nodeW - goodMargin);
    if (ref > 0 && Math.abs(container.clientWidth - ref) > 2) {
      enforcingW = true;
      container.style.boxSizing = "border-box";
      container.style.width = ref + "px";
      requestAnimationFrame(() => { enforcingW = false; });
    }
  };
  clampWidth();
  domWidget.computeSize = (width: number) => {
    const w = Math.max(width ?? minW, minW);
    const h = (measuredH > 0 ? measuredH : estimate(w)) + ROW_SAFETY;
    return [w, h];
  };
  const apply = () => {
    raf = 0;
    if (!node.size) return;
    clampWidth();  // node may have been resized wider — track it
    const needed = node.computeSize();
    if (Math.abs(needed[1] - node.size[1]) > 1) {
      settling = true;
      node.setSize([node.size[0], needed[1]]);
      node.setDirtyCanvas(true, true);
      requestAnimationFrame(() => { settling = false; });
    }
  };
  const ro = new ResizeObserver(() => {
    clampWidth();                    // width bracket is independent of the
                                     // height-settling guard below — always run it
    if (settling) return;                       // don't chase our own (height) resize
    const h = inner.offsetHeight;
    if (h < 1) return;                           // collapsed/hidden — keep last size
    if (Math.abs(h - measuredH) <= 1) return;    // sub-pixel jitter — ignore
    measuredH = h;
    if (!raf) raf = requestAnimationFrame(apply); // coalesce bursts into one pass
  });
  ro.observe(inner);
  // Also watch the host container: ComfyUI's mis-size changes ITS width, which
  // must trigger the width clamp even if inner's height didn't change.
  if (container !== inner) ro.observe(container);
  // Re-run the clamp on node resize — node.size[0] changed and the container
  // may not resize on its own, so the ResizeObserver wouldn't fire.
  const origOnResize = node.onResize;
  node.onResize = function () {
    origOnResize?.apply(this, arguments);
    clampWidth();
  };
  // Low-rate poll as a backstop: the ResizeObserver is the primary trigger, but
  // it can miss host mis-sizes that don't change OUR observed boxes (ComfyUI
  // re-lays-out the host on selection/DOM interaction). Cheap — a couple of
  // reads and, only when actually broken, one style write. Cleared on removal.
  const iv = window.setInterval(clampWidth, 250);
  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    clearInterval(iv);
    origRemoved?.apply(this, arguments);
  };
  return ro;
}

// Resolve a numeric widget that may have been converted to an input socket and
// wired from another node (e.g. a resolution node → width/height). When
// connected, read the value from the source node's matching widget; otherwise
// use this node's own widget value. A value COMPUTED at runtime upstream can't
// be known before the graph runs — the render is still correct, only this
// pre-run preview falls back to the widget default until the first run.
// graph.links is a Map since frontend 1.16 and a plain object before it — read
// through this or the lookup silently returns undefined and every upstream
// thumbnail/dimension probe in this file goes blank.
function getLink(node: any, linkId: number | null | undefined): any {
  if (linkId == null) return null;
  const links: any = node.graph?.links;
  if (!links) return null;
  return (links instanceof Map ? links.get(linkId) : links[linkId]) ?? null;
}

function resolveDim(node: any, name: string, fallback: number): number {
  const slot = node.inputs?.find((i: any) => i.name === name);
  if (slot && slot.link != null) {
    const link = getLink(node, slot.link);
    const src = link && node.graph?.getNodeById(link.origin_id);
    if (src) {
      const sw = src.widgets?.find((w: any) => w.name === name && Number.isFinite(Number(w.value)))
        ?? src.widgets?.find((w: any) => Number.isFinite(Number(w.value)));
      if (sw) return Number(sw.value);
    }
  }
  const w = node.widgets?.find((w: any) => w.name === name);
  if (w && Number.isFinite(Number(w.value))) return Number(w.value);
  return fallback;
}

// Autogrow rebuilds its dynamic slots on load, dropping custom labels of every
// socket after the first. Mirror renames into node.properties (which DOES
// serialize with the workflow) and restore them onto rebuilt slots.
function syncLabels(node: any) {
  const props = (node.properties ??= {});
  const store = (props.nkd_var_labels ??= {});
  for (const inp of node.inputs ?? []) {
    const m = /(?:^|\.)variable_(\d+)$/.exec(inp.name);
    if (!m) continue;
    const local = `variable_${m[1]}`;
    const isDefault = !inp.label || inp.label === local || inp.label === inp.name;
    if (!isDefault) store[local] = inp.label;         // user renamed → remember
    else if (store[local]) inp.label = store[local];  // rebuilt slot → restore
  }
}

function readVariables(node: any) {
  const list: { name: string; label: string; connected: boolean }[] = [];
  for (const inp of node.inputs ?? []) {
    // Autogrow sockets are namespaced ("variables.variable_0"); tokens use the
    // local name, which is also what the backend receives as dict keys.
    const m = /(?:^|\.)variable_(\d+)$/.exec(inp.name);
    if (!m) continue;
    const local = `variable_${m[1]}`;
    // A renamed socket keeps its canonical name and gets a label — chips and
    // buttons adopt it. Unrenamed sockets carry a default label equal to the
    // raw name, which we swap for the friendly form.
    const renamed = inp.label && inp.label !== local && inp.label !== inp.name;
    list.push({
      name: local,
      label: renamed ? inp.label : `Variable ${Number(m[1]) + 1}`,
      connected: inp.link != null,
    });
  }
  return list;
}

comfyApp.registerExtension({
  name: EXT_NAME,
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== NODE_NAME) return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const textWidget = this.widgets?.find((w: any) => w.name === "text");
      if (!textWidget) return result;
      // Hide in BOTH renderers: canvas (1.0) reads type/computeSize, Vue
      // Nodes (2.0) reads hidden/options.hidden.
      textWidget.type = "hidden";
      textWidget.hidden = true;
      if (textWidget.options) textWidget.options.hidden = true;
      textWidget.computedHeight = 0;
      textWidget.computeSize = () => [0, -4];

      const container = document.createElement("div");

      let instance: any = null;
      const vueApp = createApp(PromptVariablesWidget, {
        onChange: (text: string) => {
          if (textWidget.value !== text) {
            textWidget.value = text;
          }
        },
      });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("prompt_editor", "NKD_PROMPT_EDITOR", container, {
        getValue: () => textWidget.value,
        setValue: (v: string) => {
          textWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
      });
      const promptRo = sizeDomWidgetToContent(this, domWidget, container, MIN_W,
        () => MIN_EDITOR_H);

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < MIN_W) size[0] = MIN_W;
      };

      // First render once widget values exist + keep chips/sockets in sync.
      requestAnimationFrame(() => {
        instance?.deserialise(textWidget.value ?? "");
        instance?.setVariables(readVariables(this));
        this.setDirtyCanvas(true, true);
      });

      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
        origDrawBg?.apply(this, arguments);
        syncLabels(this);
        instance?.setVariables(readVariables(this));
      };
      // Vue Nodes (2.0) never calls onDrawBackground — poll instead.
      const varsTimer = window.setInterval(() => {
        syncLabels(this);
        instance?.setVariables(readVariables(this));
      }, 800);

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        // Widget values are restored after creation — re-render the chips.
        requestAnimationFrame(() => {
          syncLabels(this);
          instance?.deserialise(textWidget.value ?? "");
          instance?.setVariables(readVariables(this));
        });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(varsTimer);
        promptRo.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Gradient Map — live client-side recolor preview. Reads the already-
// decoded thumbnail of whatever node feeds the `image` input (works even
// before the graph has ever run, e.g. a Load Image with a file picked), so
// ramp/invert/strength edits redraw instantly with zero backend round-trip.
// Registered BEFORE the color-ramp extension (same ordering trick as
// Gradient Generate) so the preview sits above the ramp bar.
// Frontend 1.42 dropped `node.imgs` (the decoded thumbnail litegraph used to
// hang on the node) — previews now live in a Vue store. What survives is the
// *address* of the picture, so resolve that instead and decode it here:
//   · app.nodeOutputs[id] — what the node produced on the last run, any node
//   · a Load Image-style `image` widget — a file in /input, no run needed
function viewUrl(f: { filename: string; type?: string; subfolder?: string }): string {
  const q = new URLSearchParams({
    filename: f.filename, type: f.type || "input", subfolder: f.subfolder || "",
  });
  return (api as any).apiURL ? (api as any).apiURL(`/view?${q}`) : `/view?${q}`;
}

// Off unless asked for: `window.NKD_DEBUG = true` in the console traces how the
// editors resolve their source frame, which is the thing that goes wrong.
function dbg(...args: any[]): void {
  if ((window as any).NKD_DEBUG) console.log("[NKD]", ...args);
}

function upstreamImageUrl(node: any, inputName = "image"): string {
  const inp = node.inputs?.find((i: any) => i.name === inputName);
  const link = getLink(node, inp?.link);
  if (!link) { dbg("no link on input", inputName, "of node", node.id, "slot:", inp); return ""; }
  const src = node.graph?.getNodeById(link.origin_id);
  if (!src) { dbg("link origin", link.origin_id, "not in graph"); return ""; }
  const outs = (comfyApp as any).nodeOutputs?.[String(src.id)];
  const out = outs?.images?.[0];
  if (out?.filename) { dbg("source", src.type, src.id, "→ run output", out); return viewUrl(out); }
  const w = src.widgets?.find((x: any) => x?.name === "image");
  if (typeof w?.value === "string" && w.value) {
    dbg("source", src.type, src.id, "→ input file", w.value);
    return viewUrl({ filename: w.value });
  }
  dbg("source", src.type, src.id, "has no image address (outputs:", outs,
      "widgets:", src.widgets?.map((x: any) => x?.name), ")");
  return "";
}

// One <img> per URL, shared by every caller — the sync probes below poll on
// every redraw and must not queue a fresh decode each time.
const srcImgCache = new Map<string, HTMLImageElement>();
function imgFor(url: string): HTMLImageElement {
  let img = srcImgCache.get(url);
  if (!img) { img = new Image(); img.src = url; srcImgCache.set(url, img); }
  return img;
}

/** Decoded upstream frame, or null while it loads (the in-node previews poll). */
function findSourceImg(node: any, inputName = "image"): HTMLImageElement | null {
  const url = upstreamImageUrl(node, inputName);
  if (!url) return null;
  const img = imgFor(url);
  return img.complete && img.naturalWidth ? img : null;
}

/** Same, but waits for the decode — for the editors, which open once. */
function findSourceImgAsync(node: any, inputName = "image"): Promise<HTMLImageElement | null> {
  const url = upstreamImageUrl(node, inputName);
  if (!url) return Promise.resolve(null);
  const img = imgFor(url);
  if (img.complete) {
    dbg("cached decode", url, img.naturalWidth + "x" + img.naturalHeight);
    return Promise.resolve(img.naturalWidth ? img : null);
  }
  return new Promise((resolve) => {
    img.addEventListener("load", () => {
      dbg("decoded", url, img.naturalWidth + "x" + img.naturalHeight);
      resolve(img);
    }, { once: true });
    img.addEventListener("error", () => { dbg("decode FAILED", url); resolve(null); }, { once: true });
  });
}

comfyApp.registerExtension({
  name: "NKD.BasicTools.GradientMapPreview.Vue",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDGradientMap") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const container = document.createElement("div");
      const getRamp = () => this.widgets?.find((w: any) => w.name === "ramp")?.value ?? "{}";
      const getInvert = () => !!this.widgets?.find((w: any) => w.name === "invert")?.value;
      const getStrength = () => Number(this.widgets?.find((w: any) => w.name === "strength")?.value) || 0;

      let instance: any = null;
      const vueApp = createApp(GradientMapPreviewWidget, {
        getRamp, getInvert, getStrength,
        getSourceImg: () => findSourceImg(this),
        getMaskImg: () => findSourceImg(this, "mask"),
      });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("gradmap_preview", "NKD_GRADIENT_MAP_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {},
        serialize: false,
        hideOnZoom: false,
      });
      // Estimate before first measure: the preview + a one-row bar.
      const ro = sizeDomWidgetToContent(this, domWidget, container, 320,
        (w) => Math.round(w * (200 / 320)) + 30);

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };

      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 300);
      requestAnimationFrame(() => { instance?.forceResize?.(); });

      // Backend pushes the resolved input on partial-execution (handles sources
      // behind a resize/subgraph). node.id is -1 until assigned → read lazily.
      const node = this;
      const onSource = (e: any) => {
        const d = e?.detail;
        if (!d || String(d.node_id) !== String(node.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          instance?.setSentImage?.(bytes, d.width, d.height);
        } catch { /* ignore malformed */ }
      };
      api.addEventListener("nkd-gradmap-source", onSource);

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => { instance?.forceResize?.(); });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-gradmap-source", onSource);
        ro.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Frequency Separate — live preview of the high-frequency layer, computed
// client-side from the connected source image (no execution needed), reacting
// to method/radius/edge/mode/detail/linear as you scrub.
comfyApp.registerExtension({
  name: "NKD.BasicTools.FrequencyPreview.Vue",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDFrequencySeparate") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const container = document.createElement("div");
      const wv = (n: string) => this.widgets?.find((w: any) => w.name === n)?.value;
      let instance: any = null;
      const vueApp = createApp(FrequencyPreviewWidget, {
        getSourceImg: () => findSourceImg(this, "image"),
        getMethod: () => wv("method") ?? "Guided",
        getRadius: () => Number(wv("radius")) || 8,
        getEdge: () => Number(wv("edge_threshold")) || 0.1,
        getMode: () => wv("mode") ?? "Divide",
        getDetail: () => wv("detail") ?? "Luminance",
        getLinear: () => !!wv("linear"),
      });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("freq_preview", "NKD_FREQUENCY_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {},
        serialize: false,
        hideOnZoom: false,
      });
      const ro = sizeDomWidgetToContent(this, domWidget, container, 320,
        (w) => Math.round(w * (200 / 320)) + 52); // preview + two-row bar

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };

      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 300);
      requestAnimationFrame(() => { instance?.forceResize?.(); });

      // Backend pushes the resolved input image on partial-execution (handles
      // sources behind a resize/subgraph). node.id is -1 until assigned, so read
      // it lazily at event time.
      const node = this;
      const onSource = (e: any) => {
        const d = e?.detail;
        if (!d || String(d.node_id) !== String(node.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          // src_width/src_height = the node's real render size (the bytes come
          // downscaled), so the preview can scale radius to its own cache.
          instance?.setSentImage?.(bytes, d.width, d.height, d.src_width, d.src_height);
        } catch { /* ignore malformed */ }
      };
      api.addEventListener("nkd-freq-source", onSource);

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => { instance?.forceResize?.(); });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-freq-source", onSource);
        ro.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Gradient Generate — interactive on-canvas gradient handles (Photoshop-
// style drag), registered BEFORE the color-ramp extension below so its widget
// ends up wrapping the raw onNodeCreated first — the ramp bar's addDOMWidget
// call then runs after, placing the preview visually ABOVE the ramp bar.
comfyApp.registerExtension({
  name: "NKD.BasicTools.GradientPreview.Vue",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDGradientGenerate") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const handlesWidget = this.widgets?.find((w: any) => w.name === "handles");
      if (!handlesWidget) return result;
      handlesWidget.type = "hidden";
      handlesWidget.hidden = true;
      if (handlesWidget.options) handlesWidget.options.hidden = true;
      handlesWidget.computedHeight = 0;
      handlesWidget.computeSize = () => [0, -4];

      const container = document.createElement("div");

      const getRamp = () => this.widgets?.find((w: any) => w.name === "ramp")?.value ?? "{}";
      const getShape = () => this.widgets?.find((w: any) => w.name === "shape")?.value ?? "Linear";
      // Prefer the backend-reported resolved size (works for computed/constrained
      // width·height that resolveDim can't read pre-execution); else read the
      // connected inputs / widgets.
      let knownSize: [number, number] | null = null;
      const getSize = (): [number, number] => {
        // A connected image dictates the output size (see execute()), and its
        // own dims are readable before any run — so they win over both.
        const img = findSourceImg(this, "image");
        if (img?.naturalWidth) return [img.naturalWidth, img.naturalHeight];
        return knownSize ?? [resolveDim(this, "width", 1024), resolveDim(this, "height", 1024)];
      };

      let instance: any = null;
      const vueApp = createApp(GradientPreviewWidget, {
        onChange: (json: string) => {
          if (handlesWidget.value !== json) handlesWidget.value = json;
        },
        getRamp,
        getShape,
        getSize,
        getSourceImg: () => findSourceImg(this, "image"),
        getBlendMode: () => this.widgets?.find((w: any) => w.name === "blend_mode")?.value ?? "none",
        getOpacity: () => {
          const v = Number(this.widgets?.find((w: any) => w.name === "opacity")?.value);
          return Number.isFinite(v) ? v : 1;
        },
      });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("preview_editor", "NKD_GRADIENT_PREVIEW", container, {
        getValue: () => handlesWidget.value,
        setValue: (v: string) => {
          handlesWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
      });
      const ro = sizeDomWidgetToContent(this, domWidget, container, 320,
        (w) => Math.round(w * (210 / 320)) + 34);

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };

      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 400);

      // Backend reports the resolved output size on execution → gizmo matches
      // the real aspect even when width/height are computed upstream.
      const gnode = this;
      const onSize = (e: any) => {
        const d = e?.detail;
        if (!d || String(d.node_id) !== String(gnode.id)) return;
        if (d.width > 0 && d.height > 0) { knownSize = [d.width, d.height]; instance?.refreshExternal?.(); }
      };
      api.addEventListener("nkd-gradient-size", onSize);

      // Resolved input image pushed on execution — the only route when the
      // source sits behind a resize/subgraph (a plain link is read live above).
      const onSource = (e: any) => {
        const d = e?.detail;
        if (!d || String(d.node_id) !== String(gnode.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          instance?.setSentImage?.(bytes, d.width, d.height);
        } catch { /* ignore malformed */ }
      };
      api.addEventListener("nkd-gradgen-source", onSource);

      requestAnimationFrame(() => {
        instance?.deserialise(handlesWidget.value ?? "");
        instance?.forceResize?.();
      });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => {
          instance?.deserialise(handlesWidget.value ?? "");
          instance?.forceResize?.();
        });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-gradient-size", onSize);
        api.removeEventListener("nkd-gradgen-source", onSource);
        ro.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Gradient Map / 😺NKD Gradient Generate — shared color-ramp editor.
// Hides the raw `ramp` string widget and mounts the same Vue canvas widget on
// both node types, so a ramp built in one works pasted/loaded into the other.
const RAMP_NODES = ["NKDGradientMap", "NKDGradientGenerate"];
const RAMP_CANVAS_W = 380;
const RAMP_CANVAS_AR = 64 / RAMP_CANVAS_W;
const RAMP_MIN_W = 380;
const RAMP_BAR_EST = 56; // two-row control/preset bar

comfyApp.registerExtension({
  name: "NKD.BasicTools.ColorRamp.Vue",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (!RAMP_NODES.includes(nodeData.name)) return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const rampWidget = this.widgets?.find((w: any) => w.name === "ramp");
      if (!rampWidget) return result;
      rampWidget.type = "hidden";
      rampWidget.hidden = true;
      if (rampWidget.options) rampWidget.options.hidden = true;
      rampWidget.computedHeight = 0;
      rampWidget.computeSize = () => [0, -4];

      const container = document.createElement("div");

      let instance: any = null;
      const vueApp = createApp(ColorRampWidget, {
        onChange: (json: string) => {
          if (rampWidget.value !== json) rampWidget.value = json;
        },
      });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("ramp_editor", "NKD_RAMP_EDITOR", container, {
        getValue: () => rampWidget.value,
        setValue: (v: string) => {
          rampWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
      });
      const ro = sizeDomWidgetToContent(this, domWidget, container, RAMP_MIN_W,
        (w) => Math.round(w * RAMP_CANVAS_AR) + RAMP_BAR_EST);

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < RAMP_MIN_W) size[0] = RAMP_MIN_W;
      };

      requestAnimationFrame(() => {
        instance?.deserialise(rampWidget.value ?? "");
        instance?.forceResize?.();
      });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => {
          instance?.deserialise(rampWidget.value ?? "");
          instance?.forceResize?.();
        });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        ro.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Noise — live client-side preview of the fractal noise (frame 0),
// mirroring the exact integer hash so it equals the render.
const NOISE_MIN_W = 260;

comfyApp.registerExtension({
  name: "NKD.BasicTools.Noise.Vue",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDNoise") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const num = (name: string, def: number) =>
        Number(this.widgets?.find((w: any) => w.name === name)?.value ?? def);
      const getParams = () => ({
        width: resolveDim(this, "width", 1024), height: resolveDim(this, "height", 1024),
        scale: num("scale", 6), detail: num("detail", 4),
        roughness: num("roughness", 0.5), lacunarity: num("lacunarity", 2),
        distortion: num("distortion", 0), contrast: num("contrast", 1),
        brightness: num("brightness", 0), evolution: num("evolution", 0),
        loop: !!this.widgets?.find((w: any) => w.name === "loop")?.value,
        offset_x: num("offset_x", 0), offset_y: num("offset_y", 0),
        seed: num("seed", 0),
      });

      const container = document.createElement("div");
      let instance: any = null;
      const vueApp = createApp(NoisePreviewWidget, { getParams });
      instance = vueApp.mount(container) as any;

      const domWidget = this.addDOMWidget("noise_preview", "NKD_NOISE_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {},
        serialize: false,
        hideOnZoom: false,
      });
      const ro = sizeDomWidgetToContent(this, domWidget, container, NOISE_MIN_W,
        (w) => Math.round(w) + 26);

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < NOISE_MIN_W) size[0] = NOISE_MIN_W;
      };

      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 300);
      requestAnimationFrame(() => { instance?.forceResize?.(); });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => { instance?.forceResize?.(); });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
        ro.disconnect();
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// 😺NKD Color Warp — opens a fullscreen RYB polar-net editor + live LUT preview.
// The node's hidden `mesh` string widget is the single source of truth; a button
// widget launches the vanilla-TS overlay (src/colorWarpViewer.ts). The resolved
// source frame is read live via findSourceImg, with the backend
// `nkd-colorwarp-source` push as a fallback for sources behind resizes/subgraphs.
let activeColorWarp: { nodeId: string; handle: ColorWarpViewerHandle } | null = null;

// Last frame the backend resolved for each node, kept whether or not the editor
// is open. findSourceImg only finds a thumbnail on nodes that draw one (Load
// Image does; VAE Decode and most generators do not), and a generated image
// simply does not exist until the graph runs — which nobody does with the
// editor already open. Caching the push means opening the editor after a run
// shows that run's frame.
type CachedFrame = {
  canvas: HTMLCanvasElement; w: number; h: number;
  s16?: { data: Uint16Array; width: number; height: number };
};
const colorWarpFrames = new Map<string, CachedFrame>();

// Build a canvas from the pushed RGB (uint8, 3 bytes/px) frame.
function rgbBytesToCanvas(bytes: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0, k = 0; i < w * h; i++, j += 3, k += 4) {
    img.data[k] = bytes[j];
    img.data[k + 1] = bytes[j + 1];
    img.data[k + 2] = bytes[j + 2];
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function b64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// The {node,width,height,data,scatter16} payload — same shape whether it
// arrived over the websocket or from /nkd/colorwarp/source.
function framePayload(d: any): CachedFrame | null {
  try {
    const canvas = rgbBytesToCanvas(b64Bytes(d.data), d.width, d.height);
    // Optional 16-bit RGB companion (little-endian uint16) for the viewer's
    // scatter cloud — quantization-free vectorscope.
    const s16 = d.scatter16 && d.s16_width && d.s16_height
      ? { data: new Uint16Array(b64Bytes(d.scatter16).buffer), width: d.s16_width, height: d.s16_height }
      : undefined;
    return { canvas, w: d.width, h: d.height, s16 };
  } catch (err) {
    dbg("frame decode FAILED", err);
    return null;
  }
}

/** The frame the backend resolved last time this node ran, if it still has it. */
async function fetchPushedFrame(nodeId: string): Promise<CachedFrame | null> {
  try {
    const res = await api.fetchApi(`/nkd/colorwarp/source?node_id=${encodeURIComponent(nodeId)}`,
                                   { cache: "no-store" });
    if (!res.ok) { dbg("no stored frame for node", nodeId, "(", res.status, ")"); return null; }
    const frame = framePayload(await res.json());
    dbg("stored frame for node", nodeId, frame ? `${frame.w}x${frame.h}` : "undecodable");
    return frame;
  } catch (err) {
    dbg("stored-frame fetch failed", err);
    return null;
  }
}

comfyApp.registerExtension({
  name: "NKD.ColorWarp",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDColorWarp") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);

      const meshW = this.widgets?.find((w: any) => w.name === "mesh");
      if (meshW) {
        meshW.type = "hidden";
        meshW.hidden = true;
        if (meshW.options) meshW.options.hidden = true;
        meshW.computedHeight = 0;
        meshW.computeSize = () => [0, -4];
      }

      const node = this;
      const btn = this.addWidget("button", "🎨 Open Color Warper", null, () => {
        // Live upstream thumbnail first (it tracks edits with no run — e.g.
        // picking a new file in Load Image), then the last frame the backend
        // pushed, which is all a generated image can offer.
        const img = findSourceImg(node, "image");
        const cached = colorWarpFrames.get(String(node.id));
        const meshAtOpen = meshW?.value ?? "";
        dbg("ColorWarp open — node", node.id, "sync img:", !!img, "cached push:", !!cached);
        const handle = openColorWarpViewer({
          image: img,
          mesh: meshW?.value || "",
          onChange: (json: string) => {
            if (meshW) meshW.value = json;
            node.setDirtyCanvas(true, true);
          },
          onClose: (json: string) => {
            if (json && meshW) meshW.value = json;
            node.setDirtyCanvas(true, true);
            if (activeColorWarp?.handle === handle) activeColorWarp = null;
            // Run the node so the in-node preview and everything downstream show
            // the grade that was just dialled in. Only when the mesh actually
            // moved — closing without touching anything runs nothing.
            if (json && json !== meshAtOpen) {
              dbg("ColorWarp mesh changed on close — running node", node.id);
              void queueNode(node);
            }
          },
        });
        activeColorWarp = { nodeId: String(node.id), handle };
        // setImage rather than passing it as `image`: it carries the 16-bit
        // companion the scatter cloud wants.
        if (!img && cached) handle.setImage(cached.canvas, cached.w, cached.h, cached.s16);
        // The upstream picture usually needs a decode — hand it over when it
        // lands, and if there is none at all, run this node (upstream stays
        // cached) so the backend pushes the frame the listener below feeds in.
        // ponytail: if the backend already has THIS node cached it won't
        // re-execute and no push arrives (page reload after a run). Re-open
        // after any mesh edit, or add a source route if it becomes a nuisance.
        void (async () => {
          const live = () => activeColorWarp?.handle === handle;
          const loaded = await findSourceImgAsync(node, "image");
          if (loaded) {
            dbg("ColorWarp source ready", loaded.naturalWidth + "x" + loaded.naturalHeight,
                live() ? "→ setImage" : "(editor already closed)");
            if (live()) handle.setImage(loaded, loaded.naturalWidth, loaded.naturalHeight);
            return;
          }
          if (cached) return;                       // already showing the push
          // Generated source: ask the backend for the frame it resolved last
          // run. Only if it has none is a run worth forcing.
          const stored = await fetchPushedFrame(String(node.id));
          if (stored) {
            colorWarpFrames.set(String(node.id), stored);
            if (live()) handle.setImage(stored.canvas, stored.w, stored.h, stored.s16);
            return;
          }
          dbg("ColorWarp has no source anywhere — queueing node", node.id);
          void queueNode(node);
        })();
      });
      btn.serialize = false;

      // Backend push of the resolved input frame (handles sources behind a
      // resize/subgraph). Payload: {node,width,height,data} — RGB uint8 base64.
      const onSource = (e: any) => {
        const d = e?.detail;
        dbg("colorwarp-source push for node", d?.node, "(this node:", node.id, ")",
            d ? `${d.width}x${d.height}` : "no detail");
        if (!d || String(d.node) !== String(node.id)) return;
        const frame = framePayload(d);
        if (!frame) return;
        colorWarpFrames.set(String(node.id), frame);
        const live = activeColorWarp?.nodeId === String(node.id);
        dbg("push decoded", frame.w + "x" + frame.h, live ? "→ setImage" : "(editor not open)");
        if (live) activeColorWarp!.handle.setImage(frame.canvas, frame.w, frame.h, frame.s16);
      };
      api.addEventListener("nkd-colorwarp-source", onSource);

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        api.removeEventListener("nkd-colorwarp-source", onSource);
        if (activeColorWarp?.nodeId === String(node.id)) {
          activeColorWarp.handle.close();
          activeColorWarp = null;
        }
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

// ---------------------------------------------------------------------------
// 😺NKD Vector Mask / Path Blur / Field Blur — the spline editor nodes.
//
// All three are the same wiring: a hidden STRING widget holding the geometry, a
// button that opens the shared overlay, and a backdrop frame that arrives one
// of two ways. The upstream thumbnail is instant and tracks edits with no run,
// but only Load Image has one — a VAE Decode has no thumbnail until the graph
// runs, so the node also pushes its resolved input frame over the websocket and
// that frame is cached per node id. Opening the editor after a run therefore
// still shows that run.
// ---------------------------------------------------------------------------

const splineFrames = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }>();
let openSpline: { nodeId: string; handle: SplineOverlayHandle } | null = null;

api.addEventListener("nkd-source", (e: any) => {
  const d = e?.detail;
  if (!d?.data) return;
  try {
    const bin = atob(d.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const canvas = rgbBytesToCanvas(bytes, d.width, d.height);
    const id = String(d.node);
    splineFrames.set(id, { canvas, w: d.width, h: d.height });
    if (openSpline?.nodeId === id) openSpline.handle.setImage(canvas, d.width, d.height);
  } catch { /* ignore malformed */ }
});

/**
 * Run one node and its upstream dependencies, nothing else.
 *
 * `app.queuePrompt` has no "just this node" form, so the serialised graph is
 * intercepted for a single call and trimmed to the node plus whatever feeds it.
 * The same trick as `js/mask_painter.js`, which cannot be imported from here —
 * it is a hand-written vanilla extension outside the Vite bundle, and wiring a
 * runtime import across that boundary is more fragile than the duplication.
 */
function collectUpstream(nodeId: string, output: any, into: any): void {
  if (into[nodeId] || !output[nodeId]) return;
  into[nodeId] = output[nodeId];
  for (const value of Object.values(output[nodeId].inputs ?? {})) {
    if (Array.isArray(value)) collectUpstream(String(value[0]), output, into);
  }
}

async function queueNode(node: any): Promise<void> {
  // The original method, not a bound copy, so it can be restored and still
  // called with the right receiver.
  const origQueue = (api as any).queuePrompt;
  try {
    (api as any).queuePrompt = async function (index: number, prompt: any) {
      (api as any).queuePrompt = origQueue;          // one call only
      if (prompt?.output) {
        const filtered = {};
        collectUpstream(String(node.id), prompt.output, filtered);
        dbg("queueNode", node.id, "→ trimmed prompt to", Object.keys(filtered).length,
            "of", Object.keys(prompt.output).length, "nodes:", Object.keys(filtered));
        prompt = { ...prompt, output: filtered };
      } else {
        dbg("queueNode", node.id, "— prompt has no .output, sending whole graph", prompt);
      }
      return origQueue.call(api, index, prompt);
    };
    await comfyApp.queuePrompt(0, 1);
    dbg("queueNode", node.id, "submitted");
  } catch (err) {
    (api as any).queuePrompt = origQueue;
    console.error("[NKD Basic Tools] queue failed:", err);
    (comfyApp as any).extensionManager?.toast?.add?.({
      severity: "error", summary: "Queue Failed", detail: String(err), life: 6000,
    });
  }
}

/** The node settings the backend preview needs, read fresh so it tracks edits. */
function widgetValues(node: any, names: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of names) {
    const w = node.widgets?.find((x: any) => x.name === n);
    if (w) out[n] = w.value;
  }
  return out;
}

function registerSplineNode(nodeName: string, widgetName: string, mode: EditorMode,
                            title: string, buttonLabel: string,
                            preview?: { kind: "field" | "path"; params: string[] }) {
  comfyApp.registerExtension({
    name: `NKD.BasicTools.${nodeName}`,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== nodeName) return;
      // "Refresh node definitions" re-runs this hook on the SAME prototype;
      // without the guard the onNodeCreated wraps stack and every node ends up
      // with duplicated, permanently-mounted widgets.
      if (nodeType.prototype[`__nkd_${nodeName}`]) return;
      nodeType.prototype[`__nkd_${nodeName}`] = true;

      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const result = origCreated?.apply(this, arguments);
        const node = this;

        const dataW = this.widgets?.find((w: any) => w.name === widgetName);
        if (dataW) {
          dataW.type = "hidden";
          dataW.hidden = true;
          if (dataW.options) dataW.options.hidden = true;
          dataW.computedHeight = 0;
          dataW.computeSize = () => [0, -4];
        }

        const btn = this.addWidget("button", buttonLabel, null, () => {
          if (openSpline) openSpline.handle.close();
          const img = findSourceImg(node, "image");
          const cached = splineFrames.get(String(node.id));
          const src = img
            ? { el: img as CanvasImageSource, w: img.naturalWidth, h: img.naturalHeight }
            : cached
              ? { el: cached.canvas as CanvasImageSource, w: cached.w, h: cached.h }
              : { el: null, w: 1024, h: 1024 };

          const handle = openSplineOverlay({
            mode, title,
            image: src.el, imageW: src.w, imageH: src.h,
            json: dataW?.value || "",
            nodeId: String(node.id),
            previewKind: preview?.kind,
            previewKey: widgetName as "pins" | "paths",
            previewParams: preview ? () => widgetValues(node, preview.params) : undefined,
            onSetting: (name: string, value: number) => {
              const w = node.widgets?.find((x: any) => x.name === name);
              if (!w) return;
              w.value = value;
              w.callback?.(value);            // the only hook both renderers fire
              node.setDirtyCanvas(true, true);
            },
            onChange: (json: string) => {
              if (dataW) dataW.value = json;
              node.setDirtyCanvas(true, true);
            },
            onClose: (json: string, save: boolean) => {
              if (json && dataW) dataW.value = json;
              node.setDirtyCanvas(true, true);
              if (openSpline?.handle === handle) openSpline = null;
              // Save & close runs the node, so the in-node preview shows what
              // was just drawn instead of the previous run. Dismissing does not.
              if (save) void queueNode(node);
            },
          });
          openSpline = { nodeId: String(node.id), handle };
          // The upstream frame is a URL until it decodes; hand it over then.
          if (!img) {
            void findSourceImgAsync(node, "image").then((loaded) => {
              if (loaded && openSpline?.handle === handle) {
                handle.setImage(loaded, loaded.naturalWidth, loaded.naturalHeight);
              }
            });
          }
        });
        btn.serialize = false;

        const origRemoved = this.onRemoved;
        this.onRemoved = function () {
          if (openSpline?.nodeId === String(node.id)) {
            openSpline.handle.close();
            openSpline = null;
          }
          splineFrames.delete(String(node.id));
          origRemoved?.apply(this, arguments);
        };

        return result;
      };
    },
  });
}

registerSplineNode("NKDVectorMask", "shapes", "shape",
                   "😺 Vector Mask", "Draw mask shapes");
registerSplineNode("NKDPathBlur", "paths", "path",
                   "😺 Path Blur", "Draw motion strokes",
                   { kind: "path", params: ["strength", "spread"] });
registerSplineNode("NKDFieldBlur", "pins", "pin",
                   "😺 Field Blur", "Place blur pins",
                   { kind: "field", params: ["max_blur", "falloff"] });

// ── 😺NKD Face Rig ─────────────────────────────────────────────────────────
// The editor lives inside the node, Relight-style: no modal, no button. The
// pose still lives in the hidden `rig` STRING widget (that is what the graph
// serialises and the backend reads); the DOM widget is presentation only.

comfyApp.registerExtension({
  name: "NKD.BasicTools.NKDFaceRig",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
    if (nodeData.name !== "NKDFaceRig") return;
    if (nodeType.prototype["__nkd_NKDFaceRig"]) return;
    nodeType.prototype["__nkd_NKDFaceRig"] = true;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origCreated?.apply(this, arguments);
      const node = this;

      // Hidden in BOTH renderers (see the comfyui-node-frontend skill): the
      // classic canvas reads `widget.hidden` + the computeSize collapse, the
      // Vue renderer (Nodes 2.0) reads `widget.options.hidden`.
      const dataW = this.widgets?.find((w: any) => w.name === "rig");
      if (dataW) {
        dataW.type = "hidden";              // classic: never mount the textarea
        dataW.hidden = true;
        if (dataW.options) dataW.options.hidden = true;
        dataW.computedHeight = 0;
        dataW.computeSize = () => [0, -4];
      }

      const container = document.createElement("div");
      container.style.cssText = "width:100%;box-sizing:border-box;overflow:hidden;";

      const rig = mountFaceRig(container, {
        nodeId: () => String(node.id),
        json: dataW?.value || "",
        cropFactor: () => Number(widgetValues(node, ["crop_factor"]).crop_factor ?? 2.0),
        srcRatio: () => Number(widgetValues(node, ["src_ratio"]).src_ratio ?? 1.0),
        hasSource: () => node.inputs?.find((i: any) => i.name === "image")?.link != null,
        frame: () => {
          const img = findSourceImg(node, "image");
          if (!img) {
            // Kick off the decode so the next attempt has it.
            void findSourceImgAsync(node, "image");
            return null;
          }
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d")!.drawImage(img, 0, 0);
          try { return c.toDataURL("image/png"); } catch { return null; }
        },
        onChange: (json: string) => {
          if (dataW) dataW.value = json;
          node.setDirtyCanvas(true, true);
        },
        // Nothing to draw with and nothing cached: run this node and its
        // inputs. The node is an output node so a trimmed prompt actually
        // executes, and it pushes its resolved frame when it does — which is
        // the listener below, and what turns the editor back on.
        // ponytail: if ComfyUI decides the node is already up to date it will
        // not re-execute and no push arrives; the editor says so once rather
        // than asking again. Press Run if that ever happens.
        onNeedsSource: () => { void queueNode(node); },
      });

      // The push says the run finished and the backend now holds a prepared
      // source at full resolution. The pixels in it are a downscaled preview,
      // so they are not what gets drawn — the retry is.
      const onPushed = (e: any) => {
        if (String(e?.detail?.node) !== String(node.id)) return;
        rig.retry();
      };
      api.addEventListener("nkd-source", onPushed);

      const domW = this.addDOMWidget("face_rig_editor", "FACE_RIG_EDITOR", container, {
        getValue: () => rig.serialise(),
        setValue: (v: string) => {
          if (dataW) dataW.value = v;
          rig.setJson(v || "");
        },
        serialize: false,             // the `rig` STRING widget is the store
      });
      // The option above is not enough on current frontends — the widget still
      // lands a duplicate copy of the pose in widgets_values without this.
      if (domW) domW.serialize = false;
      // Editor height ≈ canvas (square, node width) + button row + status.
      sizeDomWidgetToContent(node, domW, container, 300, (w) => w + 70);

      // crop_factor and src_ratio are read fresh on every preview request,
      // but a request still has to be *asked for* when they change. A new
      // crop_factor re-prepares (the editor resends the frame on its own
      // when the crop it last sent differs); src_ratio is just a render.
      for (const name of ["crop_factor", "src_ratio"]) {
        const w = this.widgets?.find((x: any) => x.name === name);
        if (!w) continue;
        const orig = w.callback;
        w.callback = function (...args: any[]) {
          const r = orig?.apply(this, args);
          rig.retry();
          return r;
        };
      }
      // Vue Nodes mode applies its own default size after creation, on top of
      // whatever the ResizeObserver already set; a few delayed re-applies win
      // that race without fighting it frame by frame.
      for (const t of [250, 750, 1500]) {
        setTimeout(() => {
          if (!node.size) return;
          const needed = node.computeSize();
          if (Math.abs(needed[1] - node.size[1]) > 2) {
            node.setSize([node.size[0], needed[1]]);
            node.setDirtyCanvas(true, true);
          }
        }, t);
      }

      // When the image input (re)connects, warm the decode and re-render —
      // otherwise the editor sits on "connect an image" until a manual click.
      const origConn = this.onConnectionsChange;
      this.onConnectionsChange = function () {
        origConn?.apply(this, arguments);
        // Connect: warm the decode, then render. Disconnect: retry() hits the
        // hasSource gate and clears the view instead.
        void findSourceImgAsync(node, "image").then(() => rig.retry());
      };

      // The picture behind the same connection can change too — LoadImage
      // switched files, or the upstream node re-ran with a new output. The
      // URL is the cheap tell: poll it, and on a change push the new frame
      // through (the backend fingerprints, so no-changes cost nothing).
      let lastSrcUrl = upstreamImageUrl(node, "image");
      const srcPoll = window.setInterval(() => {
        const url = upstreamImageUrl(node, "image");
        if (url === lastSrcUrl) return;
        lastSrcUrl = url;
        void findSourceImgAsync(node, "image").then(() => rig.refreshSource());
      }, 500);

      // Restore on workflow load: onConfigure runs after widget values land.
      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        origConfigure?.apply(this, arguments);
        // Deferred a tick so the restored widget values have landed first.
        setTimeout(() => {
          if (dataW?.value) rig.setJson(String(dataW.value));
        }, 0);
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        clearInterval(srcPoll);
        api.removeEventListener("nkd-source", onPushed);
        rig.destroy();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});

console.log("[NKD Basic Tools] spline editors + color warp loaded " +
            "(window.NKD_DEBUG=true traces how the editors load their image)");
