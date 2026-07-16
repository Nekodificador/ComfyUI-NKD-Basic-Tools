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
function resolveDim(node: any, name: string, fallback: number): number {
  const slot = node.inputs?.find((i: any) => i.name === name);
  if (slot && slot.link != null) {
    const link = node.graph?.links?.[slot.link];
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
function findSourceImg(node: any, inputName = "image"): HTMLImageElement | null {
  const inp = node.inputs?.find((i: any) => i.name === inputName);
  const linkId = inp?.link;
  if (linkId == null) return null;
  const link = node.graph?.links?.[linkId];
  if (!link) return null;
  const srcNode = node.graph?.getNodeById(link.origin_id);
  return srcNode?.imgs?.[0] ?? null;
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
