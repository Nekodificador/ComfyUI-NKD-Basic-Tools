<template>
  <div ref="root" class="nkd-pv" @mousedown.stop @mouseup.stop @mousemove.stop>
    <div
      ref="editor"
      class="nkd-pv-editor"
      contenteditable="true"
      spellcheck="false"
      data-placeholder="Write your prompt… (type @ to insert a variable)"
      @input="onInput"
      @keydown="onKeydown"
      @paste.prevent.stop="onPaste"
      @copy.stop
      @cut.stop
      @blur="onBlur"
      @keyup="saveSelection"
      @mouseup="saveSelection"
      @dragover.prevent="onDragOver"
      @drop.prevent="onDrop"
      @click="onEditorClick"
      @contextmenu.stop
    ></div>
    <div
      v-if="acMenu.open"
      ref="acMenuEl"
      class="nkd-pv-ac"
      @mousedown.prevent
    >
      <div
        v-for="(item, i) in acMenu.items"
        :key="item.name"
        class="nkd-pv-ac-item"
        :class="{ active: i === acMenu.idx }"
        @mousedown.prevent="acPick(item)"
      >
        <i class="nkd-pv-dot" :class="{ 'nkd-pv-dot-off': !item.connected }"></i>
        {{ item.label }}
      </div>
    </div>
    <div class="nkd-pv-bar">
      <button
        v-for="v in vars"
        :key="v.name"
        class="nkd-pv-add"
        :class="{ connected: v.connected }"
        :title="v.connected ? 'Insert chip (wired)' : 'Insert chip (not wired yet)'"
        @click.stop.prevent="insertChip(v.name)"
      >+ {{ v.label }}</button>
      <button
        class="nkd-pv-add nkd-pv-lib-toggle"
        :class="{ active: modal }"
        title="Your saved variables, shared by every workflow"
        @click.stop.prevent="toggleLibrary"
      >Saved</button>
    </div>
    <Teleport v-if="modal" :to="modal.body">
    <div class="nkd-pv-lib" @keydown="onPanelKeydown" @paste.stop @copy.stop @cut.stop>
      <div v-for="item in library.items" :key="item.name" class="nkd-pv-lib-row">
        <div class="nkd-pv-lib-head">
          <span class="nkd-pv-lib-at">@</span>
          <input
            class="nkd-pv-lib-name"
            :value="item.name"
            spellcheck="false"
            title="Letters, numbers, - and _ (spaces become _)"
            @change="renameSaved(item, $event)"
            @keydown.enter="blurTarget"
          />
          <button class="nkd-modal-btn" title="Insert into the prompt" @click.stop.prevent="insertSaved(item)">Insert</button>
          <button class="nkd-modal-btn" title="Delete from your library" @click.stop.prevent="deleteSaved(item)">×</button>
        </div>
        <textarea
          class="nkd-pv-lib-value"
          rows="2"
          spellcheck="false"
          placeholder="Value (one item per line)"
          :value="item.value"
          @input="editSaved(item, $event)"
        ></textarea>
      </div>
      <div v-if="!library.items.length" class="nkd-pv-lib-empty">
        No saved variables yet. Select text in the prompt and press + New to save it.
      </div>
    </div>
    </Teleport>
    <Teleport v-if="modal" :to="modal.footerLeft">
      <button class="nkd-modal-btn" title="Save the selected text, or an empty entry" @click.stop.prevent="newSaved">+ New</button>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef, nextTick } from "vue";
import { cleanName, library, loadLibrary, saveLibrary, type SavedVar } from "./promptLibrary";
import { openNkdModal, type NkdModal } from "./nkd_modal";

export interface VarInfo {
  name: string;      // socket id, e.g. "variable_0"
  label: string;     // "Variable 1"
  connected: boolean;
}

const props = defineProps<{
  onChange: (text: string) => void;
  onSavedChange: (json: string) => void;
}>();

const root = ref<HTMLDivElement | null>(null);
const editor = ref<HTMLDivElement | null>(null);
const acMenuEl = ref<HTMLDivElement | null>(null);
const vars = ref<VarInfo[]>([]);
// This node's own copy of the saved variables it uses ({name: value}): what the backend
// resolves, so the workflow still runs on a machine without this library.
let nodeSaved: Record<string, string> = {};
// The Saved library lives in a modal, so opening it never resizes the node.
const modal = shallowRef<NkdModal | null>(null);

function toggleLibrary() {
  if (modal.value) { modal.value.close(); return; }
  const m = openNkdModal({
    title: "😺 Saved variables",
    hint: "Shared by every workflow",
    width: "min(560px, 92vw)",
    height: "min(640px, 80vh)",
    onClose: () => { modal.value = null; },
  });
  m.addPrimary("Done");
  modal.value = m;
}

function insertSaved(item: SavedVar) {
  insertChip("@" + item.name);
  modal.value?.close();
}
let savedRange: Range | null = null;
let debounceTimer: number | undefined;

const acMenu = reactive({
  open: false,
  items: [] as VarInfo[],
  idx: 0,
  anchorRange: null as Range | null,
});

const TOKEN_RE = /\{(variable_\d+|@[\p{L}\p{N}_-]{1,40})(:[rc])?\}/gu;

// Per-chip pick mode. Shift-click rotates "" → random → cycle → "".
type Mode = "" | "r" | "c";
const NEXT_MODE: Record<Mode, Mode> = { "": "r", r: "c", c: "" };

let draggedChip: HTMLElement | null = null;

function savedValue(name: string): string | undefined {
  const bare = name.slice(1);
  return nodeSaved[bare] ?? library.items.find((x) => x.name === bare)?.value;
}

function savedVars(): VarInfo[] {
  const names = new Set([...library.items.map((x) => x.name), ...Object.keys(nodeSaved)]);
  return [...names].map((n) => ({ name: `@${n}`, label: `@${n}`, connected: true }));
}

function labelFor(name: string): string {
  if (name.startsWith("@")) return name;
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
  span.title = "Shift+click: normal → random 🎲 → cycle 🔁 · drag to move";
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
  if (name.startsWith("@")) {
    span.classList.add("nkd-pv-chip-saved");
    styleSavedChip(span);
    return span;
  }
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
  if (text.endsWith("\n")) addTail();
}

// A newline that ends a pre-wrap editor opens no visible line, so the browser snaps the
// caret back before it and the next word lands on the wrong side. A trailing <br> gives
// that line a body; serialise() skips it.
function isTail(node: Node | null): boolean {
  return node instanceof HTMLBRElement && node.classList.contains("nkd-pv-tail");
}

function addTail() {
  const el = editor.value;
  if (!el || isTail(el.lastChild)) return;
  const br = document.createElement("br");
  br.className = "nkd-pv-tail";
  el.appendChild(br);
}

function isLast(node: Node): boolean {
  let next = node.nextSibling;
  while (next && ((next.nodeType === Node.TEXT_NODE && !next.textContent) || isTail(next))) {
    next = next.nextSibling;
  }
  return !next;
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
      } else if (isTail(child)) {
        continue;
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

function applyChange() {
  window.clearTimeout(debounceTimer);
  const text = serialise();
  props.onChange(text);
  // Keep only what the prompt still references, so the copy never piles up.
  const used: Record<string, string> = {};
  for (const m of text.matchAll(TOKEN_RE)) {
    const bare = m[1].slice(1);
    if (m[1].startsWith("@") && nodeSaved[bare] !== undefined) used[bare] = nodeSaved[bare];
  }
  nodeSaved = used;
  props.onSavedChange(Object.keys(used).length ? JSON.stringify(used) : "");
}

function emitChange() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(applyChange, 120);
}

// Ctrl/Cmd+Enter (and Ctrl+Shift+Enter) is ComfyUI's Queue: apply the text right away,
// then let the key through instead of keeping it inside the editor.
function isQueueKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key === "Enter";
}

function onPanelKeydown(e: KeyboardEvent) {
  if (isQueueKey(e)) applyChange();
  else e.stopPropagation();
}

function onInput() {
  // Emptied by hand: drop any leftover <br> so the placeholder shows again.
  const el = editor.value;
  if (el && !el.textContent && !el.querySelector(".nkd-pv-chip")) el.textContent = "";
  saveSelection();
  emitChange();
  checkAutocomplete();
}

function onKeydown(e: KeyboardEvent) {
  if (isQueueKey(e)) {
    acClose();
    applyChange();
    return;
  }
  e.stopPropagation(); // keep ComfyUI hotkeys out of the editor

  if (acMenu.open) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      acMenu.idx = (acMenu.idx + 1) % acMenu.items.length;
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      acMenu.idx = (acMenu.idx - 1 + acMenu.items.length) % acMenu.items.length;
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      acPick(acMenu.items[acMenu.idx]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      acClose();
      return;
    }
  }

  if (e.key === "Enter") {
    e.preventDefault();
    saveSelection(); // the live caret, not wherever the last keyup/mouseup left it
    const nl = document.createTextNode("\n");
    insertAtCursor(nl);
    if (isLast(nl)) addTail();
    emitChange();
  }
}

// --- @ autocomplete --------------------------------------------------------

function getTextBeforeCursor(): { text: string; node: Text; offset: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const node = range.startContainer as Text;
  const offset = range.startOffset;
  return { text: node.textContent?.slice(0, offset) ?? "", node, offset };
}

function checkAutocomplete() {
  const info = getTextBeforeCursor();
  if (!info) { acClose(); return; }
  const atIdx = info.text.lastIndexOf("@");
  if (atIdx === -1) { acClose(); return; }
  // Only trigger if @ is at start or preceded by whitespace
  if (atIdx > 0 && !/\s/.test(info.text[atIdx - 1])) { acClose(); return; }
  const query = info.text.slice(atIdx + 1).toLowerCase();
  const filtered = [...vars.value, ...savedVars()].filter((v) =>
    v.label.toLowerCase().includes(query) || v.name.toLowerCase().includes(query)
  );
  if (filtered.length === 0) { acClose(); return; }

  // Save anchor range at the @ position for later replacement
  const anchor = document.createRange();
  anchor.setStart(info.node, atIdx);
  anchor.setEnd(info.node, info.offset);

  acMenu.items = filtered;
  acMenu.idx = 0;
  acMenu.anchorRange = anchor;
  acMenu.open = true;

  nextTick(positionAcMenu);
}

function positionAcMenu() {
  const menu = acMenuEl.value;
  const el = editor.value;
  if (!menu || !el) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const editorRect = el.getBoundingClientRect();
  menu.style.left = `${rect.left - editorRect.left}px`;
  menu.style.top = `${rect.bottom - editorRect.top + 4}px`;
}

function acPick(item: VarInfo) {
  if (acMenu.anchorRange) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(acMenu.anchorRange);
    acMenu.anchorRange.deleteContents();
    adoptSaved(item.name);
    const chip = chipEl(item.name);
    acMenu.anchorRange.insertNode(chip);
    const space = document.createTextNode(" ");
    chip.after(space);
    const r = document.createRange();
    r.setStartAfter(space);
    r.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r);
    savedRange = r.cloneRange();
    emitChange();
  }
  acClose();
}

function acClose() {
  acMenu.open = false;
  acMenu.items = [];
  acMenu.anchorRange = null;
}

function onBlur() {
  saveSelection();
  // Delay close so mousedown on menu items fires first
  setTimeout(acClose, 150);
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
    if (isTail(el.lastChild)) range.setStartBefore(el.lastChild!);
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
  adoptSaved(name);
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
  editor.value?.querySelectorAll<HTMLElement>(".nkd-pv-chip:not(.nkd-pv-chip-saved)").forEach((chip) => {
    const v = list.find((x) => x.name === chip.dataset.var);
    chip.classList.toggle("nkd-pv-chip-off", !(v && v.connected));
    if (v && chip.lastChild && chip.lastChild.textContent !== v.label) {
      chip.lastChild.textContent = v.label;
    }
  });
}

function setSaved(json: string) {
  try {
    const data = JSON.parse(json || "{}");
    nodeSaved = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    nodeSaved = {};
  }
  refreshSavedChips();
}

// --- saved variables -------------------------------------------------------

function styleSavedChip(chip: HTMLElement) {
  const value = savedValue(chip.dataset.var ?? "");
  chip.classList.toggle("nkd-pv-chip-off", value === undefined);
  chip.title = value === undefined
    ? "Saved variable not found in this node or your library"
    : `${value}\n\nShift+click: normal → random 🎲 → cycle 🔁 · drag to move`;
}

function refreshSavedChips() {
  editor.value?.querySelectorAll<HTMLElement>(".nkd-pv-chip-saved").forEach(styleSavedChip);
}

// Inserting a saved variable copies its current library value into this node.
function adoptSaved(name: string) {
  if (!name.startsWith("@")) return;
  const item = library.items.find((x) => x.name === name.slice(1));
  if (item) nodeSaved[item.name] = item.value;
}

function selectedText(): string {
  const r = savedRange;
  return r && !r.collapsed && editor.value?.contains(r.startContainer) ? r.toString().trim() : "";
}

function newSaved() {
  let i = library.items.length + 1;
  while (library.items.some((x) => x.name === `var_${i}`)) i++;
  const name = `var_${i}`;
  library.items.push({ name, value: selectedText() });
  saveLibrary();
  nextTick(() => {
    const el = Array.from(modal.value?.body.querySelectorAll<HTMLInputElement>(".nkd-pv-lib-name") ?? [])
      .find((x) => x.value === name);
    el?.focus();
    el?.select();
  });
}

// Editing from this node's panel also updates this node's copy: it's the one you're
// looking at. Other nodes and workflows keep theirs until you insert the variable again.
function editSaved(item: SavedVar, e: Event) {
  item.value = (e.target as HTMLTextAreaElement).value;
  saveLibrary();
  if (nodeSaved[item.name] !== undefined) {
    nodeSaved[item.name] = item.value;
    emitChange();
  }
  refreshSavedChips();
}

function renameSaved(item: SavedVar, e: Event) {
  const input = e.target as HTMLInputElement;
  const name = cleanName(input.value);
  const taken = library.items.some((x) => x !== item && x.name === name);
  if (!name || taken) {
    input.value = item.name;
    input.title = taken ? `"@${name}" already exists` : "Use letters, numbers, - or _";
    input.classList.add("nkd-pv-lib-bad");
    window.setTimeout(() => {
      input.classList.remove("nkd-pv-lib-bad");
      input.title = "Letters, numbers, - and _ (spaces become _)";
    }, 1500);
    return;
  }
  input.value = name;
  if (name === item.name) return;
  const old = item.name;
  item.name = name;
  saveLibrary();
  if (nodeSaved[old] !== undefined) {
    nodeSaved[name] = nodeSaved[old];
    delete nodeSaved[old];
  }
  editor.value?.querySelectorAll<HTMLElement>(`.nkd-pv-chip-saved[data-var="@${old}"]`).forEach((chip) => {
    chip.dataset.var = `@${name}`;
    if (chip.lastChild) chip.lastChild.textContent = `@${name}`;
  });
  emitChange();
}

function deleteSaved(item: SavedVar) {
  if (!window.confirm(`Delete saved variable "@${item.name}" from your library?`)) return;
  library.items.splice(library.items.indexOf(item), 1);
  saveLibrary();
  refreshSavedChips();
}

function blurTarget(e: Event) {
  (e.target as HTMLElement).blur();
}

function cleanup() {
  window.clearTimeout(debounceTimer);
  modal.value?.close();
}

onMounted(() => {
  // The host calls deserialise() once widgets are restored; the library just has to land.
  loadLibrary().then(refreshSavedChips);
});

defineExpose({ serialise, deserialise, setVariables, setSaved, cleanup });
</script>

<style scoped>
.nkd-pv {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  padding: 2px;
}
.nkd-pv-editor {
  height: 150px;
  min-height: 90px;
  overflow-y: auto;
  background: #111318;
  border: 1px solid #3a3d46;
  border-radius: 4px;
  padding: 6px 8px;
  color: #c8d0e0;
  font-size: 11.5px;
  line-height: 1.55;
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
.nkd-pv-lib-toggle {
  margin-left: auto;
}
.nkd-pv-lib-toggle.active,
.nkd-pv-lib-toggle:hover {
  border-color: #b48cff;
  color: #d6c2ff;
}
.nkd-pv-lib {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding: 14px;
  box-sizing: border-box;
}
.nkd-pv-lib-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.nkd-pv-lib-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.nkd-pv-lib-at {
  color: #b48cff;
  font-size: 11px;
  font-weight: 600;
}
.nkd-pv-lib-name,
.nkd-pv-lib-value {
  background: #252830;
  border: 1px solid #3a3d46;
  border-radius: 4px;
  color: #c8d0e0;
  font-size: 12px;
  font-family: inherit;
  padding: 4px 8px;
  outline: none;
}
.nkd-pv-lib-name {
  flex: 1 1 auto;
  min-width: 0;
}
.nkd-pv-lib-value {
  resize: vertical;
  min-height: 34px;
  line-height: 1.45;
}
.nkd-pv-lib-name:focus,
.nkd-pv-lib-value:focus {
  border-color: #4ab4ff;
}
.nkd-pv-lib-name.nkd-pv-lib-bad {
  border-color: #ff5c5c;
}
.nkd-pv-lib-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}
.nkd-pv-ac {
  position: absolute;
  z-index: 100;
  background: #1e2028;
  border: 1px solid #3a3d46;
  border-radius: 5px;
  padding: 3px;
  min-width: 120px;
  max-height: 160px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.nkd-pv-ac-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  color: #c8d0e0;
  cursor: pointer;
  white-space: nowrap;
}
.nkd-pv-ac-item:hover,
.nkd-pv-ac-item.active {
  background: rgba(74, 180, 255, 0.18);
  color: #fff;
}
.nkd-pv-dot-off {
  background: transparent !important;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);
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
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2px;
  line-height: 15px;
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
.nkd-pv-chip-saved {
  border-color: rgba(180, 140, 255, 0.8);
  color: #e0d2ff;
  background: rgba(180, 140, 255, 0.14);
}
.nkd-pv-chip-saved .nkd-pv-dot {
  background: #b48cff;
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
