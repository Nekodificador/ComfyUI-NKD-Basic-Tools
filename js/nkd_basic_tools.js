import { app } from "../../scripts/app.js";

const CROP_NODE = "NKDInpaintCrop";

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

function updateVisibility(node) {
  const mode = node.widgets?.find((w) => w.name === "resize_mode")?.value;
  const visible = MODE_WIDGETS[mode] ?? MODE_WIDGETS["Automatic"];
  let found = false;
  for (const name of ALL_MODE_WIDGETS) {
    const w = node.widgets?.find((x) => x.name === name);
    if (!w) continue;
    found = true;
    if (visible.includes(name)) showWidget(w);
    else hideWidget(w);
  }
  if (found) refreshNode(node);
}

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
  name: "NKD.BasicTools.CropWidgets",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== CROP_NODE) return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      wrapCb(this, "resize_mode", updateVisibility);
      requestAnimationFrame(() => updateVisibility(this));
      const origConfigure = this.onConfigure;
      // Saved workflows restore widget values after creation — re-apply there.
      this.onConfigure = function () {
        const r2 = origConfigure?.apply(this, arguments);
        updateVisibility(this);
        return r2;
      };
      return r;
    };
  },
});
