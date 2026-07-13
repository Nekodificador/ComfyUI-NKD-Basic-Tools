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

const TOKEN_RE = /\{(variable_\d+)\}/g;

function labelFor(name: string): string {
  const m = name.match(/_(\d+)$/);
  return `Variable ${m ? Number(m[1]) + 1 : "?"}`;
}

function chipEl(name: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "nkd-pv-chip";
  span.contentEditable = "false";
  span.dataset.var = name;
  const dot = document.createElement("i");
  dot.className = "nkd-pv-dot";
  span.appendChild(dot);
  span.appendChild(document.createTextNode(labelFor(name)));
  const v = vars.value.find((x) => x.name === name);
  if (v && !v.connected) span.classList.add("nkd-pv-chip-off");
  return span;
}

// --- text <-> DOM ----------------------------------------------------------

function renderText(text: string) {
  const el = editor.value;
  if (!el) return;
  el.textContent = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    el.appendChild(chipEl(m[1]));
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
        out += `{${child.dataset.var}}`;
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
  // Refresh connection styling on existing chips in place.
  editor.value?.querySelectorAll<HTMLElement>(".nkd-pv-chip").forEach((chip) => {
    const v = list.find((x) => x.name === chip.dataset.var);
    chip.classList.toggle("nkd-pv-chip-off", !(v && v.connected));
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
  cursor: default;
  white-space: nowrap;
  transform: translateY(-1px);
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
</style>
