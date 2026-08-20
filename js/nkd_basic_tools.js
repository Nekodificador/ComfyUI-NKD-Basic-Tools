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
  // Block coverage is meaningless until there are blocks. Feather is NOT hidden
  // alongside it: a small feather on a blockified mask is what keeps the block
  // edges from showing as a staircase on composite.
  NKDMaskOps: {
    watch: ["blockify"],
    apply(node) {
      const w = (n) => node.widgets?.find((x) => x.name === n);
      const size = w("blockify");
      const cover = w("blockify_threshold");
      if (!size || !cover) return;
      // A connected VAE both turns Blockify on and supplies the grid, so the
      // number stops meaning anything — hiding it is only safe *because* the
      // connection is the switch.
      const fromVae = node.inputs?.find((i) => i.name === "vae")?.link != null;
      if (fromVae) hideWidget(size);
      else showWidget(size);
      if (fromVae || size.value > 0) showWidget(cover);
      else hideWidget(cover);
      refreshNode(node);
    },
  },
  // edge_threshold only matters for the edge-preserving methods.
  NKDFrequencySeparate: {
    watch: ["method"],
    apply(node) {
      const method = node.widgets?.find((w) => w.name === "method")?.value;
      const edge = node.widgets?.find((w) => w.name === "edge_threshold");
      if (!edge) return;
      if (method === "Guided" || method === "Rolling Guidance") showWidget(edge);
      else hideWidget(edge);
      refreshNode(node);
    },
  },
  // The guide sockets grow on their own (autogrow); the position widget of a slot
  // only means something once something is plugged into that slot, so it rides along.
  NKDMiniMaxGuides: {
    watch: [],
    apply(node) {
      // Deferred: autogrow adds and removes the guide sockets from its own
      // connection handler, and ours may run before it has done so.
      requestAnimationFrame(() => RULES.NKDMiniMaxGuides.sync(node));
    },
    sync(node) {
      let found = false;
      for (const w of node.widgets ?? []) {
        if (!w.name?.startsWith("position_")) continue;
        found = true;
        const slot = `guide_${w.name.slice("position_".length)}`;
        // endsWith, not ===: a dynamic input can arrive namespaced (guides.guide_3).
        const input = node.inputs?.find((i) => i.name === slot || i.name?.endsWith(`.${slot}`));
        if (input && input.link != null) showWidget(w);
        else hideWidget(w);
      }
      if (found) refreshNode(node);
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
      // Rules that read an input's link need this: plugging a cable is not a
      // widget edit, so no callback fires and the node would keep the stale layout.
      const origConnections = this.onConnectionsChange;
      this.onConnectionsChange = function () {
        const r2 = origConnections?.apply(this, arguments);
        rule.apply(this);
        return r2;
      };
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
