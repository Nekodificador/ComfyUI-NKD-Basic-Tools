/**
 * Block panel for 😺NKD LoRA Control.
 *
 * ONE canvas widget owns every row, instead of two LiteGraph widgets per block.
 * That is the whole point: LiteGraph routes the mouse to a single widget and
 * drops the gesture the moment the cursor leaves its rectangle, so a panel built
 * out of native widgets can never drag-paint across rows, rubber-band a range, or
 * apply one value to a selection. Owning the rectangle means owning the gesture.
 *
 * The rows come from GET /nkd/lora/blocks the moment a LoRA is picked — no run
 * needed — and the state is written back into the hidden `blocks` string in the
 * same compact rule format the Python side parses.
 */
import { app as comfyApp } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { findW, hideWidget, mountDomWidget } from "./domHost";
import { applyRules, impactColor, readThreshold, rowsFrom, serialise, type Row } from "./loraRules";
import { attachFineRange } from "./fine_drag";

const NODE_NAME = "NKDLoraControl";
const EXT_NAME = "NKD.BasicTools.LoraControl";

const ROW_H = 17;
const PAD = 6;
const CB = 11;          // checkbox side
const LABEL_W = 116;
const VALUE_W = 38;
const MIN_W = 340;
// Slider range. Wide enough for an anti-LoRA and a boost, tight enough that the
// 0..1 everyone actually lives in gets two thirds of the track.
const W_MIN = -1, W_MAX = 2;

const C = {
  bg: "#111318",
  row: "rgba(255,255,255,0.03)",
  track: "rgba(255,255,255,0.09)",
  zero: "rgba(255,255,255,0.20)",
  label: "#c8d0e0",
  labelOff: "rgba(255,255,255,0.28)",
  sel: "rgba(74,180,255,0.16)",
  selEdge: "#4ab4ff",
  handle: "#e8edf5",
  hint: "rgba(255,255,255,0.35)",
} as const;

// ── widget ───────────────────────────────────────────────────────────────────

function setup(node: any): void {
  const blocksW = findW(node, "blocks");
  const loraW = findW(node, "lora_name");
  if (blocksW) hideWidget(blocksW);

  const root = document.createElement("div");
  root.className = "nkd-lorablocks";
  // Same shape as the other NKD node widgets: one .nkd-bar holding .nkd-row
  // stripes, then the canvas. Sigmas Curve is the reference.
  const bar = document.createElement("div");
  bar.className = "nkd-bar";
  const controls = document.createElement("div");
  controls.className = "nkd-row nkd-row--controls";
  bar.appendChild(controls);
  const canvas = document.createElement("canvas");
  canvas.className = "nkd-canvas";
  root.append(bar, canvas);

  let rows: Row[] = [];
  let selection = new Set<number>();
  let anchor = -1;
  let status = "pick a LoRA";
  let hover = -1;
  // null = the on/off pattern is hand-made and no longer describes a threshold.
  let threshold: number | null = null;
  // Last line the backend sent back after a run (a quantized-model fallback, a
  // curve summary). There is no `report` output to wire, so this is where a
  // silent fallback becomes visible.
  let note = "";

  const ctx = canvas.getContext("2d")!;
  const listH = () => Math.max(ROW_H, rows.length * ROW_H);

  // ── bar ──
  const mkBtn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.className = "nkd-btn";
    b.textContent = label;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    controls.appendChild(b);
    return b;
  };
  const info = document.createElement("span");
  info.className = "nkd-info";

  const targets = () => (selection.size ? [...selection].map((i) => rows[i]) : rows);
  mkBtn("All on", () => { threshold = null; for (const r of targets()) r.on = true; commit(); });
  mkBtn("All off", () => { threshold = null; for (const r of targets()) r.on = false; commit(); });
  mkBtn("Invert", () => { threshold = null; for (const r of targets()) r.on = !r.on; commit(); });
  mkBtn("Reset", () => {
    threshold = null;
    for (const r of targets()) { r.on = true; r.weight = 1; }
    selection.clear(); commit();
  });

  // One dial for both kinds of shortcut: the groups this file actually has
  // (generated, no table) and the user's own saved presets. A preset is the rule
  // text, which is portable — rules name blocks, and a block the current LoRA
  // does not have is ignored, so a FLUX preset applies cleanly to a Klein LoRA.
  const presetRow = document.createElement("div");
  presetRow.className = "nkd-row nkd-row--presets";
  const presetLabel = document.createElement("span");
  presetLabel.className = "nkd-label";
  presetLabel.textContent = "Preset";
  const dial = document.createElement("select");
  dial.className = "nkd-select nkd-select--preset";
  let presets: { name: string; rules: string }[] = [];
  let picked = "";

  const saveBtn = document.createElement("button");
  const delBtn = document.createElement("button");

  dial.onchange = () => {
    const value = dial.value;
    picked = value.startsWith("p:") ? value.slice(2) : "";
    if (value.startsWith("g:")) {
      const group = value.slice(2);
      threshold = null;
      for (const r of rows) r.on = r.group === group;
      dial.value = "";
    } else if (picked) {
      const preset = presets.find((x) => x.name === picked);
      if (preset) {
        applyRules(preset.rules, rows);
        threshold = readThreshold(preset.rules);
      }
    }
    selection.clear();
    // Delete acts on `picked`, so its enabled state has to follow every path
    // that writes it — not only the dial rebuild.
    delBtn.disabled = !picked;
    commit();
  };

  saveBtn.className = "nkd-btn nkd-btn--preset";
  saveBtn.textContent = "Save";
  saveBtn.title = "Save the current block setup as a preset";
  delBtn.className = "nkd-btn nkd-btn--preset";
  delBtn.textContent = "Delete";
  delBtn.title = "Delete the selected preset";

  saveBtn.onclick = async (e) => {
    e.stopPropagation();
    const raw = window.prompt("Preset name (1-64 chars: letters, numbers, spaces, -_().):", picked);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    if (!/^[\w \-().]{1,64}$/.test(name)) {
      window.alert("Invalid name. Use letters, numbers, spaces, or - _ ( ) .");
      return;
    }
    if (presets.some((p) => p.name.toLowerCase() === name.toLowerCase())
        && !window.confirm(`Overwrite existing preset "${name}"?`)) return;
    try {
      const res = await api.fetchApi("/nkd/lora/presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules: serialise(rows, threshold) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.alert(`Save failed: ${err.error ?? res.statusText}`);
        return;
      }
      // Before loadPresets, not after: it is rebuildDial that reads `picked`
      // to select the row and enable Delete.
      picked = name;
      await loadPresets();
      commit();
    } catch (err) {
      window.alert(`Save failed: ${err}`);
    }
  };

  delBtn.onclick = async (e) => {
    e.stopPropagation();
    if (!picked || !window.confirm(`Delete preset "${picked}"?`)) return;
    try {
      const res = await api.fetchApi(`/nkd/lora/presets/${encodeURIComponent(picked)}`,
                                     { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.alert(`Delete failed: ${err.error ?? res.statusText}`);
        return;
      }
      picked = "";
      await loadPresets();
      commit();
    } catch (err) {
      window.alert(`Delete failed: ${err}`);
    }
  };

  presetRow.append(presetLabel, dial, saveBtn, delBtn);

  async function loadPresets() {
    try {
      const res = await api.fetchApi("/nkd/lora/presets");
      const data = await res.json();
      presets = Array.isArray(data?.user) ? data.user : [];
    } catch {
      presets = [];        // no presets is a fine state; never break the panel
    }
    rebuildDial();
  }

  function rebuildDial() {
    const groups = [...new Set(rows.map((r) => r.group))];
    dial.innerHTML = "";
    const head = document.createElement("option");
    head.value = ""; head.textContent = "— Select —";
    dial.appendChild(head);
    if (groups.length > 1) {
      const g = document.createElement("optgroup");
      g.label = "Only this group";
      for (const name of groups) {
        const o = document.createElement("option");
        o.value = `g:${name}`; o.textContent = name;
        g.appendChild(o);
      }
      dial.appendChild(g);
    }
    if (presets.length) {
      const g = document.createElement("optgroup");
      g.label = "Saved";
      for (const p of presets) {
        const o = document.createElement("option");
        o.value = `p:${p.name}`; o.textContent = p.name;
        g.appendChild(o);
      }
      dial.appendChild(g);
    }
    dial.value = picked ? `p:${picked}` : "";
    delBtn.disabled = !picked;
  }

  controls.appendChild(info);

  const noteRow = document.createElement("div");
  noteRow.className = "nkd-row nkd-row--note";
  const noteEl = document.createElement("span");
  noteEl.className = "nkd-info nkd-lb-note";
  noteEl.hidden = true;
  noteRow.appendChild(noteEl);

  // Impact filter: keep the blocks that carry at least this much of the LoRA and
  // mute the rest. This is the one selection that adapts to the file in front of
  // you — which is exactly what a fixed "high impact" preset cannot do (measured:
  // upstream's "Klein double 4-7" holds in 2 of 12 real Klein LoRAs).
  const filterRow = document.createElement("div");
  filterRow.className = "nkd-row nkd-row--filter";
  const filterLabel = document.createElement("span");
  filterLabel.className = "nkd-label";
  filterLabel.textContent = "Impact ≥";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "nkd-slider";
  slider.min = "0"; slider.max = "100"; slider.step = "1"; slider.value = "0";
  const filterOut = document.createElement("span");
  filterOut.className = "nkd-info nkd-lb-thr";
  slider.addEventListener("input", () => {
    // Deliberately global, never scoped to the selection: the readout claims a
    // property of the whole LoRA, so it must be true of every row.
    threshold = Number(slider.value);
    for (const r of rows) r.on = r.score >= threshold;
    selection.clear();
    commit();
  });
  filterRow.append(filterLabel, slider, filterOut);
  bar.appendChild(presetRow);
  bar.appendChild(filterRow);
  bar.appendChild(noteRow);

  // ── paint ──
  // The size the last frame was DRAWN at. Hit testing must convert through this,
  // never through ROW_H: if CSS renders the canvas at any other height the error
  // accumulates one row at a time down the list (row 1 off by one, row 20 off by
  // three) — reported by Neko as "parallax" 2026-09-15.
  let drawnW = MIN_W, drawnH = ROW_H;

  function draw() {
    const w = canvas.clientWidth || MIN_W;
    const h = listH();
    drawnW = w; drawnH = h;
    // Pin the CSS height too, so the element cannot be stretched by its host and
    // the bitmap never gets rescaled (which also blurs it).
    canvas.style.height = `${h}px`;
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    if (!rows.length) {
      ctx.fillStyle = C.hint;
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(status, PAD, ROW_H / 2);
      return;
    }

    const sx = PAD + CB + PAD + LABEL_W + PAD;
    const sw = Math.max(40, w - sx - VALUE_W - PAD);
    const zeroX = sx + ((0 - W_MIN) / (W_MAX - W_MIN)) * sw;

    ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = i * ROW_H;
      const mid = y + ROW_H / 2;
      const picked = selection.has(i);

      if (picked) { ctx.fillStyle = C.sel; ctx.fillRect(0, y, w, ROW_H); }
      else if (i % 2) { ctx.fillStyle = C.row; ctx.fillRect(0, y, w, ROW_H); }
      if (hover === i) { ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, y, w, ROW_H); }

      // checkbox, filled with the block's impact colour so the panel reads as a
      // heat map even before you look at a single number
      const cy = mid - CB / 2;
      ctx.strokeStyle = r.on ? impactColor(r.score) : "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD + 0.5, cy + 0.5, CB - 1, CB - 1);
      if (r.on) { ctx.fillStyle = impactColor(r.score, 0.85); ctx.fillRect(PAD + 2, cy + 2, CB - 4, CB - 4); }

      // Impact as a bar behind the label: the ranking is the reason this node
      // exists, and this costs no column of its own.
      const lx = PAD + CB + PAD;
      ctx.fillStyle = impactColor(r.score, r.on ? 0.22 : 0.08);
      ctx.fillRect(lx - 2, y + 2, (LABEL_W + 2) * (r.score / 100), ROW_H - 4);

      ctx.fillStyle = r.on ? C.label : C.labelOff;
      ctx.font = "10px sans-serif";
      let text = r.name;
      while (ctx.measureText(text).width > LABEL_W - 2 && text.length > 4) text = text.slice(0, -1);
      ctx.fillText(text, lx, mid);

      ctx.fillStyle = C.track;
      ctx.fillRect(sx, mid - 2, sw, 4);
      ctx.fillStyle = C.zero;
      ctx.fillRect(zeroX - 0.5, mid - 5, 1, 10);

      const hx = sx + ((Math.max(W_MIN, Math.min(W_MAX, r.weight)) - W_MIN) / (W_MAX - W_MIN)) * sw;
      ctx.fillStyle = r.on ? impactColor(r.score) : "rgba(255,255,255,0.25)";
      ctx.fillRect(Math.min(zeroX, hx), mid - 2, Math.abs(hx - zeroX), 4);
      ctx.beginPath();
      ctx.arc(hx, mid, 4, 0, Math.PI * 2);
      ctx.fillStyle = r.on ? C.handle : "rgba(255,255,255,0.3)";
      ctx.fill();

      ctx.fillStyle = r.on ? C.label : C.labelOff;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(r.weight.toFixed(2), w - PAD, mid);
      ctx.textAlign = "left";

      if (picked) {
        ctx.strokeStyle = C.selEdge;
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(0.5, y + 0.5, w - 1, ROW_H - 1);
        ctx.globalAlpha = 1;
      }
    });
  }

  let mounted: { resizeToContent: () => void; minNodeWidth: () => number;
                 release: () => void } | null = null;
  function commit() {
    // NEVER write while the list is empty. `refresh` blanks the rows before the
    // fetch, and serialising that would overwrite a saved workflow's rules with
    // "" a beat before we read them back — silent loss on every file open.
    if (blocksW && rows.length) blocksW.value = serialise(rows, threshold);
    const on = rows.filter((r) => r.on).length;
    info.textContent = rows.length
      ? `${on}/${rows.length} on` + (selection.size ? ` · ${selection.size} selected` : "")
      : "";
    noteEl.textContent = note;
    noteEl.hidden = !note;
    slider.value = String(threshold ?? 0);
    slider.style.setProperty("--nkd-fill", `${threshold ?? 0}%`);
    filterOut.textContent = threshold === null ? "off" : String(threshold);
    filterRow.classList.toggle("nkd-lb-idle", threshold === null);
    draw();
    node.setDirtyCanvas(true, true);
  }

  // ── pointer ──
  const rowAt = (y: number) => {
    const i = Math.floor(y / ROW_H);
    return i >= 0 && i < rows.length ? i : -1;
  };
  const zoneAt = (x: number) => {
    if (x < PAD + CB + PAD / 2) return "check";
    if (x < PAD + CB + PAD + LABEL_W) return "label";
    return "slider";
  };
  /** Screen point -> the coordinate space the last frame was drawn in. */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    // getBoundingClientRect is screen space and carries LiteGraph's zoom, so the
    // ratio against the drawn size is the whole correction — at zoom 1 with an
    // unstretched canvas both factors are 1.
    const kx = r.width > 0 ? drawnW / r.width : 1;
    const ky = r.height > 0 ? drawnH / r.height : 1;
    return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky, w: drawnW };
  };

  type Drag =
    | { kind: "paint"; to: boolean; seen: Set<number> }
    // `raw` is the CONTINUOUS value; quantising is a display/output step only.
    // Re-anchoring on the quantised value instead loses the sub-step remainder
    // every frame, which reads as a dead zone before the handle jumps — worse the
    // coarser the step (Neko: "el snap con ctrl va suelto", 2026-09-15).
    | { kind: "slide"; rows: Row[]; lastX: number; raw: number }
    | null;
  let drag: Drag = null;

  const clamp = (v: number) => Math.max(W_MIN, Math.min(W_MAX, v));
  const quantise = (v: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const step = e.ctrlKey || e.metaKey ? 0.25 : (e.shiftKey ? 0.01 : 0.05);
    return clamp(Math.round(v / step) * step);
  };

  canvas.addEventListener("pointerdown", (e) => {
    const { x, y, w } = local(e);
    const i = rowAt(y);
    if (i < 0) return;
    e.preventDefault(); e.stopPropagation();
    // Capture keeps the drag alive past the canvas edge. It throws when the
    // pointer is not actually active (synthetic events), which must not
    // abort the gesture handler below.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
    const zone = zoneAt(x);

    if (zone === "check") {
      // Paint across rows: the first row decides the target state, everything
      // dragged over adopts it. The gesture LiteGraph widgets cannot have.
      threshold = null;                       // a hand edit is no longer a threshold
      const to = !rows[i].on;
      const scope = selection.has(i) ? [...selection] : [i];
      for (const k of scope) rows[k].on = to;
      drag = { kind: "paint", to, seen: new Set(scope) };
      commit();
      return;
    }

    if (zone === "label") {
      if (e.shiftKey && anchor >= 0) {
        const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
        for (let k = a; k <= b; k++) selection.add(k);
      } else if (e.ctrlKey || e.metaKey) {
        selection.has(i) ? selection.delete(i) : selection.add(i);
        anchor = i;
      } else {
        const only = selection.size === 1 && selection.has(i);
        selection.clear();
        if (!only) { selection.add(i); anchor = i; } else anchor = -1;
      }
      commit();
      return;
    }

    // slider: a selection moves together, otherwise just this row
    const scope = selection.has(i) ? [...selection].map((k) => rows[k]) : [rows[i]];
    const sx = PAD + CB + PAD + LABEL_W + PAD;
    const sw = Math.max(40, w - sx - VALUE_W - PAD);
    const value = quantise(W_MIN + ((x - sx) / sw) * (W_MAX - W_MIN), e);
    for (const r of scope) { r.weight = value; if (value !== 0) r.on = true; }
    drag = { kind: "slide", rows: scope, lastX: x, raw: value };
    commit();
  });

  canvas.addEventListener("pointermove", (e) => {
    const { x, y, w } = local(e);
    if (!drag) {
      const i = rowAt(y);
      if (i !== hover) { hover = i; draw(); }
      return;
    }
    e.preventDefault();

    if (drag.kind === "paint") {
      const i = rowAt(y);
      if (i >= 0 && !drag.seen.has(i)) {
        drag.seen.add(i);
        threshold = null;
        rows[i].on = drag.to;
        commit();
      }
      return;
    }

    const sx = PAD + CB + PAD + LABEL_W + PAD;
    const sw = Math.max(40, w - sx - VALUE_W - PAD);
    // Shift is a GAIN on the movement, applied to THIS frame's delta only, so
    // toggling it mid-drag is seamless and nothing ever teleports. The continuous
    // value carries the remainder; the step only rounds what is shown and stored,
    // which makes the handle snap the moment the cursor crosses the midpoint.
    const gain = e.shiftKey ? 0.1 : 1;
    drag.raw = clamp(drag.raw + ((x - drag.lastX) / sw) * (W_MAX - W_MIN) * gain);
    drag.lastX = x;
    const value = quantise(drag.raw, e);
    for (const r of drag.rows) { r.weight = value; if (value !== 0) r.on = true; }
    commit();
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => { if (!drag && hover !== -1) { hover = -1; draw(); } });
  canvas.addEventListener("dblclick", (e) => {
    const i = rowAt(local(e).y);
    if (i < 0) return;
    e.preventDefault(); e.stopPropagation();
    const scope = selection.has(i) ? [...selection].map((k) => rows[k]) : [rows[i]];
    for (const row of scope) { row.weight = 1; row.on = true; }
    commit();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ── data ──
  let loaded = "";
  async function refresh(force = false) {
    const name = String(loraW?.value ?? "");
    if (!name) { rows = []; status = "pick a LoRA"; commit(); return; }
    if (name === loaded && !force) return;
    loaded = name;
    status = "reading blocks...";
    const rules = String(blocksW?.value ?? "");   // read BEFORE clearing the rows
    rows = []; selection.clear(); commit();
    try {
      const res = await api.fetchApi(`/nkd/lora/blocks?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (String(loraW?.value ?? "") !== name) return;     // user moved on
      if (!res.ok || data.error || !data.order?.length) {
        rows = []; status = data.error ? `error: ${data.error}` : "no blocks found";
      } else {
        rows = rowsFrom(data);
        applyRules(rules, rows);
        threshold = readThreshold(rules);
        rebuildDial();
        status = "";
      }
    } catch (err: any) {
      rows = []; status = `error: ${err?.message ?? err}`;
    }
    selection.clear();
    commit();
    mounted?.resizeToContent();
  }

  if (loraW) {
    const orig = loraW.callback;
    loraW.callback = function (this: any, ...args: any[]) {
      const r = orig?.apply(this, args);
      refresh();
      return r;
    };
  }

  mounted = mountDomWidget(node, {
    name: "nkd_lora_blocks", type: "NKD_LORA_BLOCKS", root,
    minWidth: MIN_W,
    estimate: () => (bar.offsetHeight || 48) + listH(),
    // No getValue/setValue on purpose. `serialize: false` is not honoured here —
    // the widget still lands in widgets_values — so anything it returned would be
    // saved a SECOND time next to `blocks`, and a later schema change would then
    // have two positional slots to keep in step. The rules live in `blocks`, and
    // onConfigure is what restores them.
    onResize: draw,
  });

  const origConfigure = node.onConfigure;
  node.onConfigure = function (this: any, ...args: any[]) {
    const r = origConfigure?.apply(this, args);
    // onNodeCreated runs before saved widget values land, so the rules and the
    // LoRA name are only trustworthy from here.
    loaded = "";
    refresh();
    // After configure, not before: LiteGraph restores the saved sockets and their
    // links here, and touching the arrays earlier would drop them.
    syncCurveSockets();
    return r;
  };

  // ── curve sockets ──────────────────────────────────────────────────────────
  // positive/negative only mean something with a curve, so they follow it. They
  // are declared LAST in the schema so this is a push/pop at the tail: links are
  // addressed by index, and anything spliced out of the middle would silently
  // renumber every socket after it.
  const findSlot = (list: any[], name: string) => list?.findIndex((s: any) => s.name === name) ?? -1;
  const wired = (s: any) => !!(s && (s.link != null || (s.links && s.links.length)));

  function syncCurveSockets() {
    const curve = node.inputs?.find((i: any) => i.name === "curve");
    const want = !!(curve && curve.link != null);

    for (const name of ["positive", "negative"]) {
      const inIdx = findSlot(node.inputs, name);
      const outIdx = findSlot(node.outputs, name);
      if (want) {
        if (inIdx < 0) node.addInput(name, "CONDITIONING");
        if (outIdx < 0) node.addOutput(name, "CONDITIONING");
      } else {
        // Never remove a socket somebody has wired — dropping the curve would
        // then silently destroy their conditioning route. Unplug it first and it
        // tidies itself away.
        if (inIdx >= 0 && !wired(node.inputs[inIdx])) node.removeInput(inIdx);
        if (outIdx >= 0 && !wired(node.outputs[outIdx])) node.removeOutput(outIdx);
      }
    }
    node.setSize([Math.max(node.size[0], mounted?.minNodeWidth?.() ?? 0), node.computeSize()[1]]);
    node.setDirtyCanvas(true, true);
  }

  const origConn = node.onConnectionsChange;
  node.onConnectionsChange = function (this: any, ...args: any[]) {
    const r = origConn?.apply(this, args);
    syncCurveSockets();
    return r;
  };

  // The backend has no report output any more; it sends its notes back as UI
  // metadata on its own executed event.
  const onExecuted = (e: Event) => {
    const detail = (e as CustomEvent).detail as { output?: any; node?: string | number };
    const id = String(detail?.node ?? ""), self = String(node.id);
    // Inside a subgraph the id is compound, e.g. "916:915" — match the tail.
    if (id !== self && !id.endsWith(`:${self}`)) return;
    note = String(detail?.output?.nkd_note?.[0] ?? "");
    commit();
  };
  api.addEventListener("executed", onExecuted);

  const detachFine = attachFineRange(root);   // Shift = x0.1, pack-wide convention

  const origRemoved = node.onRemoved;
  node.onRemoved = function (this: any, ...args: any[]) {
    api.removeEventListener("executed", onExecuted);
    detachFine();
    mounted?.release();
    return origRemoved?.apply(this, args);
  };

  loadPresets();
  requestAnimationFrame(() => { syncCurveSockets(); refresh(); commit(); });
}

/**
 * Node-widget chrome, same vocabulary and same values as the rest of the pack
 * (Sigmas Curve is the reference; Color Ramp and Frequency carry the same rules
 * in their scoped blocks). Everything is scoped under .nkd-lorablocks because
 * this widget is vanilla, not a Vue SFC with a data-v attribute to scope it.
 *
 * NOT .nkd-modal-*: that is the full-screen editor shell — bigger metrics, and
 * its stylesheet is only injected once a modal has been opened, so borrowing it
 * leaves these controls completely unstyled in a fresh session.
 */
const CSS = `
.nkd-lorablocks {
  display: flex; flex-direction: column; width: 100%;
  background: var(--comfy-menu-bg, #111318);
  border-radius: 8px; overflow: hidden;
  font-family: var(--font-family, "Inter", sans-serif);
  font-size: 11px; color: var(--fg-color, #c8d0e0); user-select: none;
}
.nkd-lorablocks, .nkd-lorablocks *, .nkd-lorablocks *::before, .nkd-lorablocks *::after {
  box-sizing: border-box;
}

.nkd-lorablocks .nkd-bar {
  display: flex; flex-direction: column;
  background: var(--comfy-menu-bg, #1a1c22);
  border-bottom: 1px solid var(--border-color, #2a2d36);
  min-width: 0;
}
.nkd-lorablocks .nkd-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.nkd-lorablocks .nkd-row--controls { padding: 5px 8px 3px; flex-wrap: wrap; }
.nkd-lorablocks .nkd-row--filter {
  padding: 3px 8px 5px; gap: 6px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
}

.nkd-lorablocks .nkd-btn, .nkd-lorablocks .nkd-select {
  font-size: 11px; font-family: var(--font-family, sans-serif);
  background: var(--comfy-input-bg, #252830);
  border: 1px solid var(--border-color, #3a3d46);
  color: var(--input-text, rgba(255,255,255,0.65));
  border-radius: 5px; padding: 2px 8px; cursor: pointer;
  line-height: 1.5; white-space: nowrap; flex-shrink: 0; outline: none;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.nkd-lorablocks .nkd-btn:hover:not(:disabled),
.nkd-lorablocks .nkd-select:hover, .nkd-lorablocks .nkd-select:focus {
  border-color: var(--p-primary-color, #4ab4ff);
  color: var(--fg-color, rgba(255,255,255,0.95));
}
.nkd-lorablocks .nkd-btn:disabled, .nkd-lorablocks .nkd-select:disabled {
  opacity: 0.35; cursor: not-allowed;
}
.nkd-lorablocks .nkd-select--preset { flex: 1 1 auto; min-width: 0; max-width: 240px; }
.nkd-lorablocks .nkd-btn--preset { padding: 2px 8px; }
.nkd-lorablocks .nkd-row--presets {
  padding: 3px 8px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
}

.nkd-lorablocks .nkd-label {
  font-size: 10px; color: var(--descrip-text, rgba(255,255,255,0.45));
  white-space: nowrap; flex-shrink: 0;
}
.nkd-lorablocks .nkd-info {
  font-size: 10px; font-family: monospace;
  color: var(--descrip-text, rgba(180,210,255,0.65));
  white-space: nowrap; font-variant-numeric: tabular-nums; margin-left: auto;
}

/* Slider: the pack paints its own track so the fill reads the same in every
   browser — accent-color alone renders differently per engine. */
.nkd-lorablocks .nkd-slider {
  flex: 1; min-width: 60px; height: 14px; margin: 0;
  background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.nkd-lorablocks .nkd-slider::-webkit-slider-runnable-track {
  height: 5px; border-radius: 3px;
  background: linear-gradient(to right,
    var(--p-primary-color, #4ab4ff) 0 var(--nkd-fill, 0%),
    var(--comfy-input-bg, #252830) var(--nkd-fill, 0%) 100%);
}
.nkd-lorablocks .nkd-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; margin-top: -4px;
  width: 13px; height: 13px; border-radius: 50%;
  background: var(--fg-color, #e5e7eb);
  border: 1px solid var(--border-color, #1f2937);
  box-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.nkd-lorablocks .nkd-slider::-moz-range-track {
  height: 5px; border-radius: 3px; background: var(--comfy-input-bg, #252830);
}
.nkd-lorablocks .nkd-slider::-moz-range-progress {
  height: 5px; border-radius: 3px; background: var(--p-primary-color, #4ab4ff);
}
.nkd-lorablocks .nkd-slider::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  background: var(--fg-color, #e5e7eb);
  border: 1px solid var(--border-color, #1f2937);
}

.nkd-lorablocks .nkd-lb-thr {
  margin-left: 0; min-width: 22px; text-align: right;
  color: var(--p-primary-color, #4ab4ff);
}
/* No threshold in force: the dial reads 0 but nothing is filtered by it. */
.nkd-lorablocks .nkd-row--filter.nkd-lb-idle .nkd-lb-thr { color: rgba(255,255,255,0.3); }
.nkd-lorablocks .nkd-row--filter.nkd-lb-idle .nkd-slider::-webkit-slider-thumb {
  background: rgba(255,255,255,0.35);
}

.nkd-lorablocks .nkd-row--note {
  padding: 2px 8px 4px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
}
.nkd-lorablocks .nkd-lb-note { margin-left: 0; overflow: hidden; text-overflow: ellipsis; }

.nkd-lorablocks .nkd-canvas {
  display: block; width: 100%; cursor: default; touch-action: none;
}
`;

export function registerLoraControl(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  comfyApp.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
      if (nodeData.name !== NODE_NAME) return;
      // "Refresh node definitions" re-runs this on the SAME prototype; without
      // the guard the wraps stack and every node gets 2^n mounted panels.
      if (nodeType.prototype.__nkdLoraWrapped) return;
      nodeType.prototype.__nkdLoraWrapped = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (this: any, ...args: any[]) {
        const r = origCreated?.apply(this, args);
        setup(this);
        return r;
      };
    },
  });
}
