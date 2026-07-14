<template>
  <div class="nkd-pv" @mousedown.stop @mouseup.stop @mousemove.stop>
    <div
      ref="editor"
      class="nkd-pv-editor"
      contenteditable="true"
      spellcheck="false"
      data-placeholder="Write your prompt…"
      @input="onInput"
      @keydown="onKeydown"
      @paste.prevent="onPaste"
      @blur="saveSelection"
      @keyup="saveSelection"
      @mouseup="saveSelection"
      @dragover.prevent="onDragOver"
      @drop.prevent="onDrop"
      @click="onEditorClick"
      @contextmenu.stop
    ></div>
    <div class="nkd-pv-bar">
      <button
        v-for="v in vars"
        :key="v.name"
        class="nkd-pv-add"
        :class="{ connected: v.connected }"
        :title="v.connected ? 'Insert chip (wired)' : 'Insert chip (not wired yet)'"
        @click.stop.prevent="insertChip(v.name)"
      >+ {{ v.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

export interface VarInfo {
  name: string;      // socket id, e.g. "variable_0"
  label: string;     // "Variable 1"
  connected: boolean;
}

const props = defineProps<{
  onChange: (text: string) => void;
}>();

const editor = ref<HTMLDivElement | null>(null);
const vars = ref<VarInfo[]>([]);
let savedRange: Range | null = null;
let debounceTimer: number | undefined;

const TOKEN_RE = /\{(variable_\d+)(:[rc])?\}/g;

// Per-chip pick mode. Shift-click rotates "" → random → cycle → "".
type Mode = "" | "r" | "c";
const NEXT_MODE: Record<Mode, Mode> = { "": "r", r: "c", c: "" };

let draggedChip: HTMLElement | null = null;

function labelFor(name: string): string {
  const v = vars.value.find((x) => x.name === name);
  if (v) return v.label;
  const m = name.match(/_(\d+)$/);
  return `Variable ${m ? Number(m[1]) + 1 : "?"}`;
}

function applyMode(span: HTMLElement, mode: Mode) {
  span.dataset.mode = mode;
  span.classList.toggle("nkd-pv-chip-rand", mode === "r");
  span.classList.toggle("nkd-pv-chip-cycle", mode === "c");
}

function chipEl(name: string, mode: Mode = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "nkd-pv-chip";
  span.contentEditable = "false";
  span.dataset.var = name;
  applyMode(span, mode);
  span.title = "Shift+clic: normal → aleatorio 🎲 → ciclo 🔁 · arrastra para mover";
  span.draggable = true;
  span.addEventListener("dragstart", (e: DragEvent) => {
    draggedChip = span;
    e.dataTransfer?.setData("text/plain", "");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  span.addEventListener("dragend", () => {
    draggedChip = null;
  });
  const dot = document.createElement("i");
  dot.className = "nkd-pv-dot";
  span.appendChild(dot);
  span.appendChild(document.createTextNode(labelFor(name)));
  const v = vars.value.find((x) => x.name === name);
  if (v && !v.connected) span.classList.add("nkd-pv-chip-off");
  return span;
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as any;
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const r = document.createRange();
  r.setStart(pos.offsetNode, pos.offset);
  r.collapse(true);
  return r;
}

function onDragOver(e: DragEvent) {
  if (draggedChip && e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

function onDrop(e: DragEvent) {
  const el = editor.value;
  if (!draggedChip || !el) return;
  const range = rangeFromPoint(e.clientX, e.clientY);
  if (!range || !el.contains(range.startContainer)) return;
  if (draggedChip.contains(range.startContainer)) return; // dropped on itself
  range.insertNode(draggedChip); // moves the existing element
  range.setStartAfter(draggedChip);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  savedRange = range.cloneRange();
  draggedChip = null;
  emitChange();
}

// --- text <-> DOM ----------------------------------------------------------

function renderText(text: string) {
  const el = editor.value;
  if (!el) return;
  el.textContent = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    el.appendChild(chipEl(m[1], (m[2]?.slice(1) as Mode) ?? ""));
    last = m.index! + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

function serialise(): string {
  const el = editor.value;
  if (!el) return "";
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child instanceof HTMLElement && child.dataset.var) {
        const mode = child.dataset.mode ?? "";
        out += `{${child.dataset.var}${mode ? `:${mode}` : ""}}`;
      } else if (child instanceof HTMLBRElement) {
        out += "\n";
      } else if (child instanceof HTMLElement) {
        // Block elements the browser may create — treat as newline boundary.
        if (out && !out.endsWith("\n")) out += "\n";
        walk(child);
      }
    }
  };
  walk(el);
  return out;
}

function deserialise(text: string) {
  renderText(text);
}

// --- editing ---------------------------------------------------------------

function emitChange() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => props.onChange(serialise()), 120);
}

function onInput() {
  emitChange();
}

function onKeydown(e: KeyboardEvent) {
  e.stopPropagation(); // keep ComfyUI hotkeys out of the editor
  if (e.key === "Enter") {
    e.preventDefault();
    insertAtCursor(document.createTextNode("\n"));
    emitChange();
  }
}

function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text/plain") ?? "";
  if (text) {
    insertAtCursor(document.createTextNode(text));
    emitChange();
  }
}

function onEditorClick(e: MouseEvent) {
  const chip = (e.target as HTMLElement)?.closest?.(".nkd-pv-chip") as HTMLElement | null;
  if (!chip || !e.shiftKey) return;
  e.preventDefault();
  e.stopPropagation();
  applyMode(chip, NEXT_MODE[(chip.dataset.mode as Mode) ?? ""]);
  emitChange();
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function insertAtCursor(node: Node) {
  const el = editor.value;
  if (!el) return;
  el.focus();
  const sel = window.getSelection();
  let range = savedRange;
  if (!range || !el.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // fall back to the end
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
  savedRange = range.cloneRange();
}

function insertChip(name: string) {
  insertAtCursor(chipEl(name));
  insertAtCursor(document.createTextNode(" "));
  emitChange();
}

// --- host bridge -----------------------------------------------------------

function setVariables(list: VarInfo[]) {
  const changed = JSON.stringify(list) !== JSON.stringify(vars.value);
  if (!changed) return;
  vars.value = list;
  // Refresh connection styling AND labels on existing chips in place
  // (renamed sockets propagate to their chips).
  editor.value?.querySelectorAll<HTMLElement>(".nkd-pv-chip").forEach((chip) => {
    const v = list.find((x) => x.name === chip.dataset.var);
    chip.classList.toggle("nkd-pv-chip-off", !(v && v.connected));
    if (v && chip.lastChild && chip.lastChild.textContent !== v.label) {
      chip.lastChild.textContent = v.label;
    }
  });
}

function cleanup() {
  window.clearTimeout(debounceTimer);
}

onMounted(() => {
  // Nothing to seed — the host calls deserialise() once widgets are restored.
});

defineExpose({ serialise, deserialise, setVariables, cleanup });
</script>

<style scoped>
.nkd-pv {
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  padding: 2px;
}
.nkd-pv-editor {
  height: 150px;
  min-height: 90px;
  resize: vertical;
  overflow-y: auto;
  background: #111318;
  border: 1px solid #3a3d46;
  border-radius: 4px;
  padding: 8px 10px;
  color: #c8d0e0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
}
.nkd-pv-editor:focus {
  border-color: #4ab4ff;
}
.nkd-pv-editor:empty::before {
  content: attr(data-placeholder);
  color: rgba(255, 255, 255, 0.22);
  pointer-events: none;
}
.nkd-pv-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 0 0 auto;
}
.nkd-pv-add {
  background: #252830;
  border: 1px solid #3a3d46;
  border-radius: 4px;
  color: #c8d0e0;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}
.nkd-pv-add:hover {
  border-color: #4ab4ff;
  color: #4ab4ff;
}
.nkd-pv-add.connected {
  color: #4ab4ff;
}
</style>

<!-- Chips are created with document.createElement, outside Vue's render tree,
     so their styles must be UNSCOPED (scoped rules only match hashed nodes). -->
<style>
.nkd-pv-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(74, 180, 255, 0.14);
  border: 1px solid rgba(74, 180, 255, 0.75);
  color: #bfe3ff;
  border-radius: 999px;
  padding: 0 9px 0 7px;
  margin: 0 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  line-height: 17px;
  vertical-align: text-bottom;
  user-select: none;
  cursor: grab;
  white-space: nowrap;
  transform: translateY(-1px);
}
.nkd-pv-chip:active {
  cursor: grabbing;
}
.nkd-pv-chip::selection,
.nkd-pv-chip *::selection {
  background: transparent;
}
.nkd-pv-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ab4ff;
  flex: 0 0 auto;
}
.nkd-pv-chip-off {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.32);
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.05);
}
.nkd-pv-chip-off .nkd-pv-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);
}
.nkd-pv-chip-rand {
  border-color: rgba(255, 209, 102, 0.85);
  color: #ffe3a8;
  background: rgba(255, 209, 102, 0.12);
}
.nkd-pv-chip-rand::after {
  content: "🎲";
  font-size: 10px;
  line-height: 1;
}
.nkd-pv-chip-rand .nkd-pv-dot {
  background: #ffd166;
}
.nkd-pv-chip-rand.nkd-pv-chip-off .nkd-pv-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px rgba(255, 209, 102, 0.5);
}
.nkd-pv-chip-cycle {
  border-color: rgba(102, 224, 170, 0.85);
  color: #b6f2d8;
  background: rgba(102, 224, 170, 0.12);
}
.nkd-pv-chip-cycle::after {
  content: "🔁";
  font-size: 10px;
  line-height: 1;
}
.nkd-pv-chip-cycle .nkd-pv-dot {
  background: #66e0aa;
}
.nkd-pv-chip-cycle.nkd-pv-chip-off .nkd-pv-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px rgba(102, 224, 170, 0.5);
}
</style>
