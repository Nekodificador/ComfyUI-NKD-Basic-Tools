/**
 * Widget-order guard — makes a node's saved values survive a widget reorder.
 *
 * Copied from ComfyUI-NKD-Preview-Tools (the canonical source, see the nkd-node skill);
 * self-contained on purpose so any pack can carry it.
 *
 * `widgets_values` is POSITIONAL: reordering a node's widgets silently loads every saved
 * workflow's values into the wrong widgets, with no error anywhere. Two levels, both at
 * load time (the only honest moment):
 *
 * 1. REPAIR. Frontend ≥1.49.6 (PR #10392) always SAVES `widgets_values_named`, a
 *    name→value map — only the core's restore-from-it sits behind
 *    `Comfy.Workflow.NamedValuesRestore`, which ships disabled. When the map is present,
 *    values are re-applied BY NAME, so the positional order stops mattering entirely.
 *    Idempotent when the core setting is on.
 * 2. WARN. No map (older frontend) and no current schema stamp → the positional restore
 *    just mis-assigned everything, so say it in a toast. Only fires for `version > 1`:
 *    at version 1 no reorder has happened under the stamp regime, and an absent stamp
 *    only means "saved before stamping existed".
 *
 * The version is bumped ONLY on a deliberate breaking reorder, which also belongs in the
 * release notes.
 */
import { app as comfyApp } from "../../scripts/app.js";

const PROP = "nkdSchema";

const findW = (node: any, name: string) =>
  node.widgets?.find((w: any) => w.name === name);

export function guardWidgetOrder(nodeType: any, nodeName: string, version: number): void {
  const origCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function (this: any) {
    const r = origCreated?.apply(this, arguments as any);
    this.properties = this.properties || {};
    this.properties[PROP] = version;
    return r;
  };

  const origConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (this: any, info: any) {
    const r = origConfigure?.apply(this, arguments as any);
    const named = info?.widgets_values_named;
    if (named && typeof named === "object" && !Array.isArray(named)) {
      // Map order is serialize order, so a DynamicCombo parent lands before the
      // sub-widgets its callback creates, and findW then sees them.
      for (const [name, val] of Object.entries(named)) {
        const w = findW(this, name);
        if (w && w.value !== val) {
          w.value = val;
          w.callback?.(val);
        }
      }
    } else if (version > 1
        && info?.properties?.[PROP] !== version
        && Array.isArray(info?.widgets_values) && info.widgets_values.length) {
      // Checked on the SAVED payload, never `this.properties`: configure MERGES
      // properties, so the stamp written at creation would mask an old save.
      (comfyApp as any).extensionManager?.toast?.add?.({
        severity: "warn",
        summary: `😺${nodeName}`,
        detail: `"${this.title ?? nodeName}" was saved before a widget reorder: its `
          + "values may have loaded into the wrong widgets. Delete and re-add the "
          + "node, then re-check its settings.",
        life: 12000,
      });
    }
    return r;
  };
}

/** Register the guard for a whole pack in one go. */
export function guardPackWidgetOrder(
  extName: string, versions: Record<string, number>,
): void {
  comfyApp.registerExtension({
    name: extName,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      const version = versions[nodeData?.name];
      if (!version) return;
      if (nodeType.prototype.__nkdSchemaGuarded) return;   // "Refresh node definitions"
      nodeType.prototype.__nkdSchemaGuarded = true;
      guardWidgetOrder(nodeType, nodeData.name, version);
    },
  });
}
