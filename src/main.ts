// 😺NKD Prompt Variables — chips editor widget.
// Hides the raw `text` string widget and mounts a Vue contenteditable editor
// that renders {variable_N} tokens as chips, one insert button per socket.
import { app as comfyApp } from "../../scripts/app.js";
import { createApp } from "vue";
import PromptVariablesWidget from "./PromptVariablesWidget.vue";

const NODE_NAME = "NKDPromptVariables";
const EXT_NAME = "NKD.BasicTools.PromptVariables.Vue";

const MIN_W = 300;
const MIN_EDITOR_H = 190;

function readVariables(node: any) {
  const list: { name: string; label: string; connected: boolean }[] = [];
  for (const inp of node.inputs ?? []) {
    const m = /^variable_(\d+)$/.exec(inp.name);
    if (!m) continue;
    list.push({
      name: inp.name,
      label: `Variable ${Number(m[1]) + 1}`,
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
      textWidget.type = "hidden";
      textWidget.computedHeight = 0;
      textWidget.computeSize = () => [0, -4];

      const container = document.createElement("div");
      container.style.height = "100%";

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
        getMinHeight: () => MIN_EDITOR_H,
        getHeight: () => MIN_EDITOR_H,
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
        this.setSize(this.computeSize());
        this.setDirtyCanvas(true, true);
      });

      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
        origDrawBg?.apply(this, arguments);
        instance?.setVariables(readVariables(this));
      };

      const origConfigure = this.onConfigure;
      this.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        // Widget values are restored after creation — re-render the chips.
        requestAnimationFrame(() => {
          instance?.deserialise(textWidget.value ?? "");
          instance?.setVariables(readVariables(this));
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
