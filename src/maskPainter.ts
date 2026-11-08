/**
 * 😺NKD Mask Painter — 😺NKD Paint's canvas in mask mode (paint.ts does the editing).
 *
 * This file is only what the node adds on top: what execute() sends back (a layer it baked
 * from the upstream mask, and the upstream mask itself for the combined display), Reseed,
 * re-running on Clear, and the green node while it carries a mask.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { viewUrl, type MediaRef } from "./mediaProbe";
import { greyToAlpha, setupPaintWidget } from "./paint";

const NODE_NAME = "NKDMaskPainter";
const MASK_COLOR = "#1e3a1e", MASK_BG = "#0f1f0f";

function runNode(node: any) {
  // queueNodeIds only resolves on the root graph; inside a subgraph run the whole thing.
  if (node.graph === comfyApp.rootGraph) comfyApp.queuePrompt(0, 1, { queueNodeIds: [String(node.id)] });
  else comfyApp.queuePrompt(0, 1);
}

function setup(node: any) {
  const h = setupPaintWidget(node, {
    widget: "image", input: "images", subfolder: "nkd_masks", prefix: "nkd_mask_",
    title: "😺 Mask Painter", mask: true, onClear: () => runNode(node),
  });
  if (!h) return;
  const layerW = node.widgets.find((w: any) => w.name === "image");

  const reseed = document.createElement("button");
  reseed.title = "Copy the upstream mask into the canvas, on top of what you painted (undoable)";
  reseed.textContent = "Reseed";
  reseed.style.cssText = "background:#252830;color:#c8d0e0;border:1px solid #3a3d46;border-radius:4px;" +
    "font:11px sans-serif;padding:2px 7px;cursor:pointer;flex:0 0 auto;height:22px;";
  reseed.addEventListener("click", () => {
    const up = h.upstream();
    if (up) { h.L.paste(up); return; }
    comfyApp.extensionManager?.toast?.add?.({ severity: "info", summary: "NKD Mask Painter",
      detail: "Run the node once with a mask connected first.", life: 4000 });
  });
  h.row1.insertBefore(reseed, h.row1.querySelector("button[title='Clear the layer']"));

  const origExecuted = node.onExecuted;
  node.onExecuted = function (this: any, out: any) {
    origExecuted?.apply(this, arguments);
    if (out?.nkd_layer) h.adopt(String(out.nkd_layer[0] ?? ""));
    const ref: MediaRef | undefined = out?.nkd_upstream?.[0];
    if (!ref) { h.setUpstream(null); return; }
    const img = new Image();
    img.onload = () => h.setUpstream(greyToAlpha(img, img.naturalWidth, img.naturalHeight));
    img.src = `${viewUrl(ref)}&t=${Date.now()}`;
  };

  const origBg = node.onDrawBackground;
  node.onDrawBackground = function (this: any, ...args: any[]) {
    origBg?.apply(this, args);
    if (layerW?.value) { node.color = MASK_COLOR; node.bgcolor = MASK_BG; }
    else if (node.color === MASK_COLOR) { delete node.color; delete node.bgcolor; }
  };
}

export function registerMaskPainter(): void {
  comfyApp.registerExtension({
    name: "NKD.BasicTools.MaskPainter",
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME || nodeType.prototype.__nkdMaskPainterWrapped) return;
      nodeType.prototype.__nkdMaskPainterWrapped = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any) {
        const r = origCreated?.apply(this, arguments);
        setup(this);
        return r;
      };
    },
  });
}
