/**
 * 😺NKD Loader — presets of loader nodes, captured from the graph.
 *
 * Select some loader nodes → right-click → "Save as NKD Loader preset". The selection is read
 * through graphToPrompt (so converted widgets, primitives and reroutes are already resolved)
 * and stored in the `NKD.Loader.Presets` setting. Picking a preset on the node copies that
 * recipe into its hidden `recipe` widget — the workflow carries the recipe, not the name, so
 * it runs on machines that don't have the preset. nkd_loader.py expands it into the loaders.
 *
 * The backend declares MAX_OUTPUTS `*` outputs; the node keeps only the recipe's, typed and
 * labelled. Outputs are positional, so a link survives a preset switch when its slot keeps
 * the same type (Flux 2 → Flux 3: MODEL / CLIP / VAE stay wired).
 */
import { app as comfyApp } from "../../scripts/app.js";
import { findW, hideWidget } from "./domHost";
import { ensureNkdModalStyles, nkdSelect } from "./nkd_modal";

const NODE_NAME = "NKDLoader";
const SETTING = "NKD.Loader.Presets";
const MAX_OUTPUTS = 10;   // keep in sync with nkd_loader.py

console.log("[NKD Loader] rev 1.0.0");

type Link = { from: number; out: number };
type Recipe = {
  name: string;
  nodes: { class_type: string; inputs: Record<string, unknown> }[];
  outputs: { node: number; out: number; type: string; label: string }[];
};

// Outputs are positional, so every preset lists them in the same order: the usual trio first,
// then by canvas position. That is what keeps links alive across a preset switch.
const TYPE_RANK = ["MODEL", "CLIP", "VAE"];
const rank = (t: string) => { const i = TYPE_RANK.indexOf(t); return i < 0 ? TYPE_RANK.length : i; };

const getPresets = (): Record<string, Recipe> => comfyApp.extensionManager.setting.get(SETTING) ?? {};
const setPresets = (p: Record<string, Recipe>) => comfyApp.extensionManager.setting.set(SETTING, p);
const toast = (severity: string, detail: string) =>
  comfyApp.extensionManager.toast.add({ severity, summary: "NKD Loader", detail, life: 5000 });

// Shared by every node's combo: mutated in place, so a preset saved elsewhere shows up everywhere.
const presetNames: string[] = [];
function refreshNames(): void {
  presetNames.splice(0, presetNames.length, ...Object.keys(getPresets()));
}

const isLink = (v: unknown): v is [string, number] =>
  Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";

type Captured = { recipe: Recipe; sources: string[] };   // sources[i] = "nodeId:slot" behind output i

/** `keep`: "nodeId:slot" outputs to expose even when the selection consumes them itself. */
async function capture(selected: any[], keep = new Set<string>()): Promise<Captured | string> {
  const { output } = await comfyApp.graphToPrompt();
  const ids = new Set(selected.map((n) => String(n.id)));
  const order: string[] = [];
  const visit = (id: string) => {        // dependencies first: the backend links by index
    if (order.includes(id)) return;
    for (const v of Object.values(output[id]?.inputs ?? {}))
      if (isLink(v) && ids.has(v[0])) visit(v[0]);
    order.push(id);
  };
  for (const id of ids) {
    if (!output[id]) return `"${selected.find((n) => String(n.id) === id).title}" is muted, bypassed or inside a subgraph.`;
    visit(id);
  }
  const consumed = new Set<string>();
  const nodes: Recipe["nodes"] = [];
  for (const id of order) {
    const inputs: Record<string, unknown | Link> = {};
    for (const [k, v] of Object.entries(output[id].inputs)) {
      if (!isLink(v)) { inputs[k] = v; continue; }
      if (!ids.has(v[0])) return `"${comfyApp.graph.getNodeById(id).title}" takes "${k}" from a node outside the selection.`;
      inputs[k] = { from: order.indexOf(v[0]), out: v[1] };
      consumed.add(`${v[0]}:${v[1]}`);
    }
    nodes.push({ class_type: output[id].class_type, inputs });
  }
  const outputs: (Recipe["outputs"][number] & { pos: number[]; src: string })[] = [];
  order.forEach((id, i) => {
    const node = comfyApp.graph.getNodeById(id);
    node.outputs?.forEach((o: any, j: number) => {
      const src = `${id}:${j}`;
      if (!consumed.has(src) || keep.has(src))
        outputs.push({ node: i, out: j, type: o.type, label: (o.label || o.localized_name || o.name).toLowerCase(), pos: node.pos, src });
    });
  });
  outputs.sort((a, b) => rank(a.type) - rank(b.type) || a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0] || a.out - b.out);
  if (!outputs.length) return "The selection has no outputs to expose.";
  if (outputs.length > MAX_OUTPUTS) return `A preset can expose at most ${MAX_OUTPUTS} outputs.`;
  return {
    recipe: { name: "", nodes, outputs: outputs.map(({ pos, src, ...o }) => o) },
    sources: outputs.map((o) => o.src),
  };
}

/** A recapture (repack, or saving over a name) keeps the old preset's output order and names:
 *  the n-th output of a type takes the place and name of the old n-th output of that type. */
function keepOutputLayout(recipe: Recipe, old: Recipe): void {
  const seen: Record<string, number> = {};
  const nth = (o: Recipe["outputs"][number]) => old.outputs.filter((p) => p.type === o.type)[seen[o.type] = (seen[o.type] ?? -1) + 1];
  const place = new Map(recipe.outputs.map((o) => {
    const prev = nth(o);
    if (prev) o.label = prev.label;
    return [o, prev ? old.outputs.indexOf(prev) : Infinity];
  }));
  recipe.outputs.sort((a, b) => place.get(a)! - place.get(b)!);
}

/** Asks for the name and stores the preset. Returns the saved name, or null if cancelled. */
async function savePreset(recipe: Recipe, defaultName: string): Promise<string | null> {
  const name = (await comfyApp.extensionManager.dialog.prompt({
    title: "Save NKD Loader preset",
    message: "Preset name (an existing name updates that preset)",
    defaultValue: defaultName,
  }))?.trim();
  if (!name) return null;
  recipe.name = name;
  const presets = getPresets();
  const existed = name in presets;
  if (existed) keepOutputLayout(recipe, presets[name]);
  await setPresets({ ...presets, [name]: recipe });
  if (existed) applyToNodes(name, recipe);
  toast("success", `${existed ? "Updated" : "Saved"} "${name}" — ${recipe.outputs.map((o) => o.label).join(", ")}`);
  return name;
}

async function saveSelection(): Promise<void> {
  const got = await capture(Object.values(comfyApp.canvas.selected_nodes ?? {}));
  if (typeof got === "string") return toast("warn", got);
  const { recipe } = got;
  const firstFile = Object.values(recipe.nodes[recipe.outputs[0].node].inputs)
    .find((v) => typeof v === "string" && /\.(safetensors|gguf|ckpt|pt|pth|bin|sft)$/i.test(v)) as string | undefined;
  await savePreset(recipe, firstFile?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "");
}

const LG = () => (window as any).LiteGraph;
const GROUP_FLAG = "nkdLoader";   // on the group's flags: the preset it was unpacked from

/** Replace the loader node by its real loaders, inside a group, keeping every outgoing link. */
function unpack(node: any): void {
  const recipe = parse(findW(node, "recipe")?.value);
  if (!recipe) return toast("warn", "Choose a preset first.");
  const missing = recipe.nodes.find((n) => !LG().registered_node_types[n.class_type]);
  if (missing) return toast("warn", `${missing.class_type} is not installed.`);
  const graph = node.graph;
  let y = node.pos[1];
  const made = recipe.nodes.map((n) => {
    const m = LG().createNode(n.class_type);
    graph.add(m);
    m.pos = [node.pos[0], y];
    y += m.size[1] + 50;
    for (const [k, v] of Object.entries(n.inputs)) {
      const w = findW(m, k);
      if (w && !(v && typeof v === "object")) w.value = v;
    }
    return m;
  });
  recipe.nodes.forEach((n, i) => {
    for (const [k, v] of Object.entries(n.inputs))
      if (v && typeof v === "object") made[(v as Link).from].connect((v as Link).out, made[i], k);
  });
  node.outputs?.forEach((o: any, i: number) => {
    const ref = recipe.outputs[i];
    for (const id of [...(o.links ?? [])]) {
      const l = graph.getLink(id);
      if (l) made[ref.node].connect(ref.out, graph.getNodeById(l.target_id), l.target_slot);
    }
  });
  graph.remove(node);
  const group = new (LG().LGraphGroup)(`😺 ${recipe.name}`);
  group.flags[GROUP_FLAG] = recipe.name;
  graph.add(group);
  // Not group.resizeTo(): it reads node bounding boxes that are only computed on the next draw.
  const pad = 20, top = LG().NODE_TITLE_HEIGHT;
  const x0 = Math.min(...made.map((m) => m.pos[0])) - pad;
  const y0 = Math.min(...made.map((m) => m.pos[1])) - top - pad - group.titleHeight;
  group.pos = [x0, y0];
  group.size = [Math.max(...made.map((m) => m.pos[0] + m.size[0])) + pad - x0,
                Math.max(...made.map((m) => m.pos[1] + m.size[1])) + pad - y0];
  comfyApp.canvas.setDirty(true, true);
}

/** The inverse: capture the group, save it as a preset and put one loader node back. */
async function repack(group: any): Promise<void> {
  const graph = group.graph;
  // Same reason: membership by node centre, not group.recomputeInsideNodes().
  const inside: any[] = graph.nodes.filter((n: any) =>
    group.isPointInside(n.pos[0] + n.size[0] / 2, n.pos[1] + n.size[1] / 2));
  const ids = new Set(inside.map((n) => n.id));
  const external: { src: string; target: any; slot: number }[] = [];
  for (const n of inside) n.outputs?.forEach((o: any, j: number) => {
    for (const id of o.links ?? []) {
      const l = graph.getLink(id);
      if (l && !ids.has(l.target_id)) external.push({ src: `${n.id}:${j}`, target: graph.getNodeById(l.target_id), slot: l.target_slot });
    }
  });
  const got = await capture(inside, new Set(external.map((e) => e.src)));
  if (typeof got === "string") return toast("warn", got);
  if (!(await savePreset(got.recipe, group.flags[GROUP_FLAG]))) return;
  const loader = LG().createNode(NODE_NAME);
  graph.add(loader);
  loader.pos = [group.pos[0], group.pos[1] + group.titleHeight];
  applyRecipe(loader, got.recipe);
  for (const e of external) loader.connect(got.sources.indexOf(e.src), e.target, e.slot);
  for (const n of inside) graph.remove(n);
  graph.remove(group);
  comfyApp.canvas.setDirty(true, true);
}

/** An unpacked group under the right-click, or selected. */
function packedGroup(): any {
  const c = comfyApp.canvas;
  const sel = [...(c.selectedItems ?? [])].find((g: any) => g.flags?.[GROUP_FLAG]);
  if (sel) return sel;
  const g = c.graph?.getGroupOnPos(c.graph_mouse[0], c.graph_mouse[1]);
  return g?.flags?.[GROUP_FLAG] ? g : null;
}

/** Make the node's outputs exactly the recipe's. Links on a slot that keeps its type survive. */
function syncOutputs(node: any, recipe: Recipe | null): void {
  const want = recipe?.outputs ?? [];
  for (let i = (node.outputs?.length ?? 0) - 1; i >= want.length; i--) node.removeOutput(i);
  want.forEach((o, i) => {
    const slot = node.outputs?.[i];
    // The name too, not just the label: Set/Get nodes (KJNodes) take the slot name as theirs.
    if (!slot) { node.addOutput(o.label, o.type, { label: o.label }); return; }
    if (slot.type !== o.type) { node.disconnectOutput(i); slot.type = o.type; }
    slot.name = slot.label = o.label;
  });
  node.setSize([node.size[0], node.computeSize()[1]]);
  node.setDirtyCanvas(true, true);
}

const parse = (s: string): Recipe | null => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

function applyRecipe(node: any, recipe: Recipe): void {
  findW(node, "recipe").value = JSON.stringify(recipe);
  const combo = findW(node, "preset");
  if (combo) combo.value = recipe.name;
  node.title = `😺NKD Loader · ${recipe.name}`;
  syncOutputs(node, recipe);
}

/** Editing a preset updates the loaders that use it in the open workflow (saved ones keep their copy). */
function applyToNodes(name: string, recipe: Recipe): void {
  const graphs = [comfyApp.rootGraph, ...(comfyApp.rootGraph?.subgraphs?.values() ?? [])];
  let hit = false;
  for (const g of graphs) for (const node of g?.nodes ?? []) {
    if (node.type !== NODE_NAME || parse(findW(node, "recipe")?.value)?.name !== name) continue;
    applyRecipe(node, recipe);
    hit = true;
  }
  if (hit) comfyApp.extensionManager.workflow?.activeWorkflow?.changeTracker?.checkState();
}

const FIELD = "background:#252830;border:1px solid #3a3d46;border-radius:4px;color:#c8d0e0;padding:3px 8px;font-size:12px;min-width:0;width:100%;box-sizing:border-box";

/** One control per input of a recipe node, built from the loader's own node definition. */
function inputControl(spec: any, value: unknown, onChange: (v: unknown) => void): HTMLElement {
  const options: string[] | undefined = Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
  if (options) {
    const opts = options.map((o) => ({ value: String(o), label: String(o) }));
    if (!options.includes(value as string)) opts.unshift({ value: String(value), label: `missing: ${value}` });
    const sel = nkdSelect(opts, String(value), onChange);
    sel.style.cssText = FIELD;
    return sel;
  }
  const el = document.createElement("input");
  el.style.cssText = FIELD;
  if (spec?.[0] === "BOOLEAN") {
    el.type = "checkbox";
    el.checked = !!value;
    el.style.width = "auto";
    el.onchange = () => onChange(el.checked);
    return el;
  }
  const numeric = spec?.[0] === "INT" || spec?.[0] === "FLOAT";
  el.type = numeric ? "number" : "text";
  for (const k of ["min", "max", "step"]) if (numeric && spec[1]?.[k] != null) el.setAttribute(k, String(spec[1][k]));
  el.value = String(value ?? "");
  el.onchange = () => onChange(numeric ? Number(el.value) : el.value);
  return el;
}

/** Drag `handle` to drop its row on another row of the same `kind` (lowercase: dataTransfer lowercases types). */
function reorderable(row: HTMLElement, handle: HTMLElement, kind: string, i: number, move: (from: number, to: number) => void): void {
  handle.draggable = true;
  handle.style.cursor = "grab";
  handle.ondragstart = (e) => { e.dataTransfer!.setData(kind, String(i)); e.dataTransfer!.setDragImage(row, 0, 0); };
  row.ondragover = (e) => { if (e.dataTransfer!.types.includes(kind)) e.preventDefault(); };
  row.ondrop = (e) => {
    if (!e.dataTransfer!.types.includes(kind)) return;
    e.preventDefault();
    const from = Number(e.dataTransfer!.getData(kind));
    if (from !== i) move(from, i);
  };
}

const grip = () => {
  const g = document.createElement("i");
  g.className = "pi pi-bars";
  g.title = "Drag to reorder";
  g.style.cssText = "opacity:.45;padding:4px";
  return g;
};

const moved = <T>(list: T[], from: number, to: number): T[] => {
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
};

/** `onChange(true)` asks for a redraw; without it focus stays in the field being edited. */
function recipeEditor(recipe: Recipe, onChange: (redraw?: boolean) => void): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 10px;align-items:center;padding:6px 0 10px 12px;border-left:2px solid #3a3d46;margin-left:4px";
  const outHead = document.createElement("div");
  outHead.style.cssText = "grid-column:1/-1;font-weight:600";
  outHead.textContent = "Outputs";
  outHead.title = "Order and names of the node's outputs. Reordering outputs of different types drops their links in the open workflow.";
  box.append(outHead);
  recipe.outputs.forEach((o, i) => {
    const row = document.createElement("div");
    row.style.cssText = "grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center";
    const type = document.createElement("div");
    type.style.cssText = "display:flex;align-items:center;gap:2px;opacity:.6";
    const g = grip();
    type.append(g, o.type);
    const name = document.createElement("input");
    name.style.cssText = FIELD;
    name.value = o.label;
    name.onchange = () => { o.label = name.value.trim() || o.type.toLowerCase(); name.value = o.label; onChange(); };
    row.append(type, name);
    reorderable(row, g, "nkd-loader-output", i, (from, to) => { recipe.outputs = moved(recipe.outputs, from, to); onChange(true); });
    box.append(row);
  });
  recipe.nodes.forEach((n) => {
    const def = (window as any).LiteGraph?.registered_node_types?.[n.class_type]?.nodeData;
    const head = document.createElement("div");
    head.style.cssText = "grid-column:1/-1;font-weight:600;margin-top:4px";
    head.textContent = def?.display_name ?? n.class_type;
    box.append(head);
    if (!def) {
      const warn = document.createElement("div");
      warn.style.cssText = "grid-column:1/-1;color:#ff6b6b";
      warn.textContent = "Node not installed.";
      box.append(warn);
      return;
    }
    const specs = { ...def.input?.required, ...def.input?.optional };
    for (const [k, v] of Object.entries(n.inputs)) {
      const lbl = document.createElement("div");
      lbl.style.cssText = "opacity:.6";
      lbl.textContent = k;
      let ctl: HTMLElement;
      if (v && typeof v === "object") {
        const src = v as Link;
        ctl = document.createElement("div");
        ctl.style.cssText = "opacity:.45";
        ctl.textContent = `← ${recipe.nodes[src.from].class_type} · output ${src.out}`;
      } else {
        ctl = inputControl(specs[k], v, (nv) => { n.inputs[k] = nv; onChange(); });
      }
      box.append(lbl, ctl);
    }
  });
  return box;
}

// Module-level: the settings dialog rebuilds this element on every value change.
const open = new Set<string>();

function renderManager(_name: string, setter: (v: unknown) => void, value: Record<string, Recipe>): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:320px";
  ensureNkdModalStyles();
  let presets: Record<string, Recipe> = structuredClone(value ?? {});
  const commit = () => { setter(structuredClone(presets)); draw(); };
  const draw = () => {
    root.replaceChildren();
    const names = Object.keys(presets);
    if (!names.length) {
      root.textContent = "No presets yet. Select loader nodes, right-click and choose \"Save as NKD Loader preset\".";
      root.style.opacity = "0.6";
      return;
    }
    root.style.opacity = "";
    for (const name of names) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px";
      const g = grip();
      row.append(g);
      reorderable(row, g, "nkd-loader-preset", names.indexOf(name), (from, to) => {
        presets = Object.fromEntries(moved(Object.entries(presets), from, to));
        commit();
      });
      const label = document.createElement("div");
      label.style.cssText = "flex:1;min-width:0";
      label.innerHTML = `<div style="font-weight:600"></div><div style="opacity:.55;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>`;
      (label.children[0] as HTMLElement).textContent = name;
      (label.children[1] as HTMLElement).textContent = presets[name].outputs.map((o) => o.label).join(" · ");
      label.title = presets[name].nodes.map((n) => n.class_type).join(", ");
      const btn = (icon: string, title: string, fn: () => void) => {
        const b = document.createElement("button");
        b.className = "p-button p-button-text p-button-sm";
        b.title = title;
        b.innerHTML = `<i class="pi ${icon}"></i>`;
        b.onclick = fn;
        return b;
      };
      row.append(label,
        btn(open.has(name) ? "pi-chevron-up" : "pi-sliders-h", "Edit models", () => {
          open.has(name) ? open.delete(name) : open.add(name);
          draw();
        }),
        btn("pi-pencil", "Rename", async () => {
          const to = (await comfyApp.extensionManager.dialog.prompt({ title: "Rename preset", message: "New name", defaultValue: name }))?.trim();
          if (!to || to === name) return;
          presets = Object.fromEntries(Object.entries(presets).map(([k, r]) => k === name ? [to, { ...r, name: to }] : [k, r]));
          if (open.delete(name)) open.add(to);
          commit();
          applyToNodes(name, presets[to]);
        }),
        btn("pi-trash", "Delete", async () => {
          if (!(await comfyApp.extensionManager.dialog.confirm({ title: "Delete preset", message: `Delete "${name}"? Workflows that use it keep working.` }))) return;
          delete presets[name];
          commit();
        }));
      root.append(row);
      if (open.has(name)) root.append(recipeEditor(presets[name], (redraw) => {
        redraw ? commit() : setter(structuredClone(presets));
        applyToNodes(name, presets[name]);
      }));
    }
  };
  draw();
  return root;
}

export function registerLoader(): void {
  comfyApp.registerExtension({
    name: "NKD.BasicTools.Loader",
    settings: [{
      id: SETTING,
      category: ["NKD Basic Tools", "Loader", "Presets"],
      name: "NKD Loader presets",
      tooltip: "Select loader nodes, right-click and choose \"Save as NKD Loader preset\".",
      type: renderManager,
      defaultValue: {},
      onChange: refreshNames,
    }],
    getCanvasMenuItems() {
      const n = Object.keys(comfyApp.canvas.selected_nodes ?? {}).length;
      const group = packedGroup();
      return [null,
        ...(group ? [{ content: "Repack NKD Loader", callback: () => repack(group) }] : []),
        { content: "Save as NKD Loader preset", disabled: !n, callback: saveSelection }];
    },
    getNodeMenuItems(node: any) {
      const items: any[] = [];
      if (node.type === NODE_NAME) items.push({ content: "Unpack NKD Loader", callback: () => unpack(node) });
      if (comfyApp.canvas.selected_nodes?.[node.id]) items.push({ content: "Save as NKD Loader preset", callback: saveSelection });
      return items.length ? [null, ...items] : [];
    },
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      if (nodeType.prototype.__nkdWrapped) return;
      nodeType.prototype.__nkdWrapped = true;

      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = origCreated?.apply(this, arguments);
        const recipeW = findW(this, "recipe");
        hideWidget(recipeW);
        refreshNames();
        const combo = this.addWidget("combo", "preset", "", (name: string) => {
          const recipe = getPresets()[name];
          if (recipe) applyRecipe(this, recipe);
        }, { values: presetNames, serialize: false });
        combo.value = presetNames.length ? "" : "(no presets — see Settings)";
        syncOutputs(this, null);
        return r;
      };

      const origConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () {
        const r = origConfigure?.apply(this, arguments);
        const recipe = parse(findW(this, "recipe")?.value);
        const combo = findW(this, "preset");
        if (combo) combo.value = recipe?.name ?? "";
        syncOutputs(this, recipe);
        return r;
      };
    },
  });
}
