// 😺NKD Prompt Variables — chips editor widget.
// Hides the raw `text` string widget and mounts a Vue contenteditable editor
// that renders {variable_N} tokens as chips, one insert button per socket.
import { app as comfyApp } from "../../scripts/app.js";
import { createApp } from "vue";
import PromptVariablesWidget from "./PromptVariablesWidget.vue";
import ColorRampWidget from "./ColorRampWidget.vue";
import GradientPreviewWidget from "./GradientPreviewWidget.vue";
import GradientMapPreviewWidget from "./GradientMapPreviewWidget.vue";

const NODE_NAME = "NKDPromptVariables";
const EXT_NAME = "NKD.BasicTools.PromptVariables.Vue";

const MIN_W = 300;
const MIN_EDITOR_H = 190;

// ComfyUI wraps every DOM widget in an element with ~20px of its own
// margin/padding, so the content box our `height:100%` root fills is that
// much shorter than the height we reserve via getHeight. Add it back or the
// bottom bar of every widget clips. Measured at 20px; 24 leaves a cushion.
const DOM_WIDGET_CHROME = 24;

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

      this.addDOMWidget("prompt_editor", "NKD_PROMPT_EDITOR", container, {
        getValue: () => textWidget.value,
        setValue: (v: string) => {
          textWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => MIN_EDITOR_H + DOM_WIDGET_CHROME,
        getHeight: () => MIN_EDITOR_H + DOM_WIDGET_CHROME,
      });

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < MIN_W) size[0] = MIN_W;
      };

      // First render once widget values exist + keep chips/sockets in sync.
      requestAnimationFrame(() => {
        instance?.deserialise(textWidget.value ?? "");
        instance?.setVariables(readVariables(this));
        // Grow-only, finite-only: never shrink a restored size, never feed
        // NaN into setSize (runaway node growth).
        const sz = this.computeSize();
        if (Number.isFinite(sz[0]) && Number.isFinite(sz[1])) {
          this.setSize([Math.max(sz[0], this.size[0]), Math.max(sz[1], this.size[1])]);
        }
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
function findSourceImg(node: any): HTMLImageElement | null {
  const inp = node.inputs?.find((i: any) => i.name === "image");
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
      let barH = 30;

      const getRamp = () => this.widgets?.find((w: any) => w.name === "ramp")?.value ?? "{}";
      const getInvert = () => !!this.widgets?.find((w: any) => w.name === "invert")?.value;
      const getStrength = () => Number(this.widgets?.find((w: any) => w.name === "strength")?.value) || 0;

      let instance: any = null;
      const vueApp = createApp(GradientMapPreviewWidget, {
        getRamp, getInvert, getStrength,
        getSourceImg: () => findSourceImg(this),
      });
      instance = vueApp.mount(container) as any;

      const PREVIEW_AR = 200 / 320;
      const heightFor = (width: number) =>
        Math.round(width * PREVIEW_AR) + barH + DOM_WIDGET_CHROME;

      this.addDOMWidget("gradmap_preview", "NKD_GRADIENT_MAP_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {},
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => heightFor(this.size?.[0] || 320),
        getMaxHeight: () => heightFor(this.size?.[0] || 320),
        getHeight: () => heightFor(this.size?.[0] || 320),
      });

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
        size[1] = this.computeSize(size[0])[1];
      };

      const origComputeSize = this.computeSize.bind(this);
      this.computeSize = function (_w?: number) {
        const sz = origComputeSize();
        const width = sz[0] || this.size[0];
        const needed = heightFor(width);
        if (sz[1] < needed) sz[1] = needed;
        return sz;
      };

      let v1NeedsInit = true;
      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
        origDrawBg?.apply(this, arguments);
        if (v1NeedsInit && instance?.forceResize?.()) v1NeedsInit = false;
      };
      // Poll: catches ramp/invert/strength edits (other widgets) and the
      // upstream image changing (new file picked, link rewired, or the
      // graph finishing a run that populates node.imgs for the first time).
      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 300);

      requestAnimationFrame(() => {
        const barEl = container.querySelector(".nkd-bar");
        const measured = barEl ? Math.ceil((barEl as HTMLElement).getBoundingClientRect().height) : 0;
        if (measured > 0) barH = measured;
        if (instance?.forceResize?.()) v1NeedsInit = false;
        const sz = this.computeSize(this.size[0]);
        this.setSize(sz);
        this.setDirtyCanvas(true, true);
      });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => { if (instance?.forceResize?.()) v1NeedsInit = false; });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
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
      let barH = 34;

      const getRamp = () => this.widgets?.find((w: any) => w.name === "ramp")?.value ?? "{}";
      const getShape = () => this.widgets?.find((w: any) => w.name === "shape")?.value ?? "Linear";
      const getSize = (): [number, number] => [
        Number(this.widgets?.find((w: any) => w.name === "width")?.value) || 1024,
        Number(this.widgets?.find((w: any) => w.name === "height")?.value) || 1024,
      ];

      let instance: any = null;
      const vueApp = createApp(GradientPreviewWidget, {
        onChange: (json: string) => {
          if (handlesWidget.value !== json) handlesWidget.value = json;
        },
        getRamp,
        getShape,
        getSize,
      });
      instance = vueApp.mount(container) as any;

      const PREVIEW_AR = 210 / 320;
      const heightFor = (width: number) =>
        Math.round(width * PREVIEW_AR) + barH + DOM_WIDGET_CHROME;

      this.addDOMWidget("preview_editor", "NKD_GRADIENT_PREVIEW", container, {
        getValue: () => handlesWidget.value,
        setValue: (v: string) => {
          handlesWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => heightFor(this.size?.[0] || 320),
        getMaxHeight: () => heightFor(this.size?.[0] || 320),
        getHeight: () => heightFor(this.size?.[0] || 320),
      });

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
        size[1] = this.computeSize(size[0])[1];
      };

      const origComputeSize = this.computeSize.bind(this);
      this.computeSize = function (_w?: number) {
        const sz = origComputeSize();
        const width = sz[0] || this.size[0];
        const needed = heightFor(width);
        if (sz[1] < needed) sz[1] = needed;
        return sz;
      };

      let v1NeedsInit = true;
      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
        origDrawBg?.apply(this, arguments);
        if (v1NeedsInit && instance?.forceResize?.()) v1NeedsInit = false;
      };
      // Poll for ramp edits (other widget) and shape-combo changes.
      const refreshTimer = window.setInterval(() => instance?.refreshExternal?.(), 400);

      requestAnimationFrame(() => {
        const barEl = container.querySelector(".nkd-bar");
        const measured = barEl ? Math.ceil((barEl as HTMLElement).getBoundingClientRect().height) : 0;
        if (measured > 0) barH = measured;
        instance?.deserialise(handlesWidget.value ?? "");
        if (instance?.forceResize?.()) v1NeedsInit = false;
        const sz = this.computeSize(this.size[0]);
        this.setSize(sz);
        this.setDirtyCanvas(true, true);
      });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => {
          instance?.deserialise(handlesWidget.value ?? "");
          if (instance?.forceResize?.()) v1NeedsInit = false;
        });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        window.clearInterval(refreshTimer);
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
      let barH = 70; // overestimate until measured

      let instance: any = null;
      const vueApp = createApp(ColorRampWidget, {
        onChange: (json: string) => {
          if (rampWidget.value !== json) rampWidget.value = json;
        },
      });
      instance = vueApp.mount(container) as any;

      const heightFor = (width: number) =>
        Math.round(width * RAMP_CANVAS_AR) + barH + DOM_WIDGET_CHROME;

      this.addDOMWidget("ramp_editor", "NKD_RAMP_EDITOR", container, {
        getValue: () => rampWidget.value,
        setValue: (v: string) => {
          rampWidget.value = v;
          instance?.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => heightFor(this.size?.[0] || RAMP_CANVAS_W),
        getMaxHeight: () => heightFor(this.size?.[0] || RAMP_CANVAS_W),
        getHeight: () => heightFor(this.size?.[0] || RAMP_CANVAS_W),
      });

      const origResize = this.onResize;
      this.onResize = function (size: [number, number]) {
        origResize?.apply(this, arguments);
        if (size[0] < RAMP_MIN_W) size[0] = RAMP_MIN_W;
        size[1] = this.computeSize(size[0])[1];
      };

      const origComputeSize = this.computeSize.bind(this);
      this.computeSize = function (_w?: number) {
        const sz = origComputeSize();
        const width = sz[0] || this.size[0];
        const needed = heightFor(width);
        if (sz[1] < needed) sz[1] = needed;
        return sz;
      };

      let v1NeedsInit = true;
      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
        origDrawBg?.apply(this, arguments);
        if (v1NeedsInit && instance?.forceResize?.()) v1NeedsInit = false;
      };

      requestAnimationFrame(() => {
        const barEl = container.querySelector(".nkd-bar");
        const measured = barEl ? Math.ceil((barEl as HTMLElement).getBoundingClientRect().height) : 0;
        if (measured > 0) barH = measured;
        instance?.deserialise(rampWidget.value ?? "");
        if (instance?.forceResize?.()) v1NeedsInit = false;
        const sz = this.computeSize(this.size[0]);
        this.setSize(sz);
        this.setDirtyCanvas(true, true);
      });

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        requestAnimationFrame(() => {
          instance?.deserialise(rampWidget.value ?? "");
          if (instance?.forceResize?.()) v1NeedsInit = false;
        });
        return r;
      };

      const origRemoved = this.onRemoved;
      this.onRemoved = function () {
        instance?.cleanup?.();
        vueApp.unmount();
        origRemoved?.apply(this, arguments);
      };

      return result;
    };
  },
});
