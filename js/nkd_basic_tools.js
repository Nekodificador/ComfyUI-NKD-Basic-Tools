import { app } from "../../scripts/app.js";

function hideWidget(w) {
  w.hidden = true;                         // canvas (1.0)
  if (w.options) w.options.hidden = true;  // Vue layout (2.0)
  w.computeSize = () => [0, -4];           // collapse the row on canvas
}

function showWidget(w) {
  w.hidden = false;
  if (w.options) w.options.hidden = false;
  delete w.computeSize;
}

// Push the change to BOTH renderers.
function refreshNode(node) {
  if (Array.isArray(node.widgets)) node.widgets = [...node.widgets];  // invalidate 2.0 snapshot
  node.graph?.trigger?.("node:property:changed", {
    type: "node:property:changed", nodeId: node.id,
    property: "bgcolor", oldValue: node.bgcolor, newValue: node.bgcolor,
  });
  node.setSize(node.computeSize());
  node.setDirtyCanvas(true, true);
}

const MODE_WIDGETS = {
  "Automatic": ["min_resolution", "max_resolution"],
  "Megapixels": ["megapixels"],
  "Longest Side": ["longest_side"],
};
const ALL_MODE_WIDGETS = [...new Set(Object.values(MODE_WIDGETS).flat())];

const REGION_WIDGETS = ["region_min_area", "max_regions", "region_order"];

// Per-node visibility rules: watch = widgets whose edits re-run apply(node).
const RULES = {
  NKDInpaintCrop: {
    watch: ["resize_mode", "separate_regions"],
    apply(node) {
      const mode = node.widgets?.find((w) => w.name === "resize_mode")?.value;
      const visible = MODE_WIDGETS[mode] ?? MODE_WIDGETS["Automatic"];
      const separate = node.widgets?.find((w) => w.name === "separate_regions")?.value;
      let found = false;
      for (const name of ALL_MODE_WIDGETS) {
        const w = node.widgets?.find((x) => x.name === name);
        if (!w) continue;
        found = true;
        if (visible.includes(name)) showWidget(w);
        else hideWidget(w);
      }
      for (const name of REGION_WIDGETS) {
        const w = node.widgets?.find((x) => x.name === name);
        if (!w) continue;
        found = true;
        if (separate) showWidget(w);
        else hideWidget(w);
      }
      if (found) refreshNode(node);
    },
  },
  NKDStringSplit: {
    watch: ["delimiter"],
    apply(node) {
      const mode = node.widgets?.find((w) => w.name === "delimiter")?.value;
      const custom = node.widgets?.find((w) => w.name === "custom_delimiter");
      if (!custom) return;
      if (mode === "Custom") showWidget(custom);
      else hideWidget(custom);
      refreshNode(node);
    },
  },
};

// widget.callback is the ONLY hook that fires in both renderers.
function wrapCb(node, name, handler) {
  const w = node.widgets?.find((x) => x.name === name);
  if (!w || w._nkdCb) return;
  const orig = w.callback;
  w.callback = function () {
    const r = orig?.apply(this, arguments);
    handler(node);
    return r;
  };
  w._nkdCb = true;
}

app.registerExtension({
  name: "NKD.BasicTools.Widgets",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    const rule = RULES[nodeData.name];
    if (!rule) return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      for (const name of rule.watch) wrapCb(this, name, rule.apply);
      requestAnimationFrame(() => rule.apply(this));
      const origConfigure = this.onConfigure;
      // Saved workflows restore widget values after creation — re-apply there.
      this.onConfigure = function () {
        const r2 = origConfigure?.apply(this, arguments);
        rule.apply(this);
        return r2;
      };
      return r;
    };
  },
});
