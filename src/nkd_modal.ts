/**
 * 😺NKD shared editor-modal chrome.
 *
 * The in-page editor shell every NKD node editor mounts into: dimmed backdrop,
 * floating framed panel, title bar, content area, footer action bar. Extracted
 * from the fSpy Camera editor and the Perspective Unwarp editor, which had grown
 * two hand-copied implementations of the same thing.
 *
 * NOT to be confused with the PopupWin pattern (Document Picture-in-Picture /
 * window.open) used for external viewer windows — that one leaves the page, this
 * one is an overlay inside it.
 *
 * Deliberately framework-agnostic: plain DOM, no Vue import. NKD packs mix Vue
 * widgets with hand-written vanilla ones (perspective_dewarp_widget.js), and a
 * Vue component here would lock the vanilla ones out. Vue callers mount into
 * `body` and <Teleport> their controls into `footerLeft` / `footerRight`.
 *
 * Reusable across packs: this file has no imports at all, so copying it into any
 * other ComfyUI-NKD-* pack works as-is. It is also emitted standalone to
 * web/js/nkd_modal.js so hand-written extensions can import it at runtime.
 */

export type NkdModalCloseReason = "save" | "dismiss";

export interface NkdModalOptions {
  /** Shown in the title bar. Convention: prefix with the 😺 emoji. */
  title: string;
  /** Dim secondary text beside the title — the place for usage hints. */
  hint?: string;
  /** Panel size. Framed by default, never edge-to-edge. */
  width?: string;
  height?: string;
  maxWidth?: string;
  /** Esc / backdrop click / ✕ all report "dismiss"; the primary button "save". */
  onClose?: (reason: NkdModalCloseReason) => void;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}

export interface NkdModal {
  overlay: HTMLDivElement;
  panel: HTMLDivElement;
  head: HTMLDivElement;
  /** Mount editor content here. Already flex:1 with min-height:0. */
  body: HTMLDivElement;
  footer: HTMLDivElement;
  /** Status / HUD text. Sits left, before the spacer. */
  footerLeft: HTMLDivElement;
  /** Controls. Sits right; the primary action stays last — see addPrimary(). */
  footerRight: HTMLDivElement;
  setTitle(t: string): void;
  setHint(h: string): void;
  /** Appends the accented primary button. Convention: always present, always last. */
  addPrimary(label: string, onClick?: () => void): HTMLButtonElement;
  close(reason?: NkdModalCloseReason): void;
}

const STYLE_ID = "nkd-modal-styles";

/* Palette is the NKD one (see the nkd-node skill): #111318 canvas, #1a1c22 bars,
   #252830 fields, #3a3d46 borders, #4ab4ff accent, #c8d0e0 text. */
const CSS = `
.nkd-modal-overlay {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(3px);
  font: 12px system-ui, sans-serif; color: #c8d0e0;
}
/* Framed panel, never edge-to-edge: the graph staying visible around the border
   is what keeps the editor feeling like part of the workflow. */
.nkd-modal-panel {
  display: flex; flex-direction: column;
  background: #111318; color: #c8d0e0;
  border: 1px solid #3a3d46; border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.7);
  overflow: hidden;
}
.nkd-modal-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: #1a1c22;
  border-bottom: 1px solid rgba(255,255,255,0.07); font-weight: 500;
}
.nkd-modal-hint { color: rgba(255,255,255,0.40); font-size: 11px; font-weight: 400; }
.nkd-modal-spacer { flex: 1 1 auto; }
.nkd-modal-x {
  background: transparent; border: none; color: #c8d0e0;
  font-size: 16px; cursor: pointer; padding: 2px 8px; border-radius: 4px;
}
.nkd-modal-x:hover { background: rgba(255,77,77,0.25); color: #ff6b6b; }
.nkd-modal-body { position: relative; flex: 1 1 auto; min-height: 0; background: #0b0d12; display: flex; }
.nkd-modal-body > canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.nkd-modal-foot {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; background: #1a1c22;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.nkd-modal-foot-left, .nkd-modal-foot-right { display: flex; align-items: center; gap: 12px; }

/* Shared controls. Vue templates use these class names directly instead of
   re-declaring the same rules in <style scoped>. */
.nkd-modal-btn {
  background: #252830; border: 1px solid #3a3d46; border-radius: 4px;
  color: #c8d0e0; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.nkd-modal-btn:hover { border-color: #4ab4ff; }
.nkd-modal-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.nkd-modal-btn.on { border-color: #4ab4ff; color: #4ab4ff; background: rgba(74,180,255,0.12); }
.nkd-modal-btn.primary { border-color: #4ab4ff; color: #4ab4ff; font-weight: 500; padding: 5px 14px; }
.nkd-modal-btn.primary:hover { background: rgba(74,180,255,0.15); }
.nkd-modal-lbl { color: rgba(255,255,255,0.55); display: flex; align-items: center; gap: 6px; }
.nkd-modal-rng { width: 80px; accent-color: #4ab4ff; cursor: pointer; }
.nkd-modal-sel {
  background: #252830; border: 1px solid #3a3d46; border-radius: 4px;
  color: #c8d0e0; padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.nkd-modal-status { color: #4ab4ff; font-variant-numeric: tabular-nums; }
.nkd-modal-status.bad { color: #ff6b6b; }
`;

/** Injects the stylesheet once per document. Safe to call on every open. */
export function ensureNkdModalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

export function openNkdModal(opts: NkdModalOptions): NkdModal {
  ensureNkdModalStyles();

  const overlay = div("nkd-modal-overlay");
  const panel = div("nkd-modal-panel");
  panel.style.width = opts.width ?? "92vw";
  panel.style.height = opts.height ?? "92vh";
  panel.style.maxWidth = opts.maxWidth ?? "1800px";

  const head = div("nkd-modal-head");
  const titleEl = document.createElement("span");
  titleEl.textContent = opts.title;
  const hintEl = document.createElement("span");
  hintEl.className = "nkd-modal-hint";
  hintEl.textContent = opts.hint ?? "";
  const xBtn = document.createElement("button");
  xBtn.className = "nkd-modal-x";
  xBtn.textContent = "✕";
  xBtn.title = "Close (Esc)";
  head.append(titleEl, hintEl, div("nkd-modal-spacer"), xBtn);

  const body = div("nkd-modal-body");

  const footer = div("nkd-modal-foot");
  const footerLeft = div("nkd-modal-foot-left");
  const footerRight = div("nkd-modal-foot-right");
  footer.append(footerLeft, div("nkd-modal-spacer"), footerRight);

  panel.append(head, body, footer);
  overlay.append(panel);
  document.body.appendChild(overlay);

  let closed = false;
  function close(reason: NkdModalCloseReason = "dismiss") {
    if (closed) return;               // Esc during a click, ✕ then backdrop, …
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    opts.onClose?.(reason);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation();              // or ComfyUI also acts on it
    e.preventDefault();
    close("dismiss");
  }

  xBtn.onclick = () => close("dismiss");
  if (opts.closeOnEsc !== false) window.addEventListener("keydown", onKey, true);
  if (opts.closeOnBackdrop !== false) {
    // .self equivalent: only a press that started on the backdrop itself, so a
    // drag that ends outside the panel does not count as a click-away.
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close("dismiss");
    });
  }

  return {
    overlay, panel, head, body, footer, footerLeft, footerRight,
    setTitle: (t) => { titleEl.textContent = t; },
    setHint: (h) => { hintEl.textContent = h; },
    addPrimary(label, onClick) {
      const b = nkdButton(label, () => { onClick?.(); close("save"); });
      b.classList.add("primary");
      footerRight.appendChild(b);
      return b;
    },
    close,
  };
}

/* ── Control factories ─────────────────────────────────────────────────────
   Only the controls both extracted editors actually used. Vue callers can skip
   these entirely and put the class names in their template. */

export function nkdButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "nkd-modal-btn";
  b.textContent = label;
  if (title) b.title = title;
  b.onclick = onClick;
  return b;
}

export function nkdToggle(label: string, initial: boolean,
                          onChange: (on: boolean) => void, title?: string): HTMLButtonElement {
  let on = initial;
  const b = nkdButton(label, () => {
    on = !on;
    b.classList.toggle("on", on);
    onChange(on);
  }, title);
  b.classList.toggle("on", on);
  return b;
}

export function nkdSlider(label: string,
                          cfg: { min: number; max: number; step: number; value: number },
                          onInput: (v: number) => void, title?: string): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "nkd-modal-lbl";
  if (title) wrap.title = title;
  const rng = document.createElement("input");
  rng.type = "range";
  rng.className = "nkd-modal-rng";
  rng.min = String(cfg.min); rng.max = String(cfg.max);
  rng.step = String(cfg.step); rng.value = String(cfg.value);
  rng.oninput = () => onInput(parseFloat(rng.value));
  wrap.append(document.createTextNode(label), rng);
  return wrap;
}

export function nkdSelect(options: Array<{ value: string; label: string }>, value: string,
                          onChange: (v: string) => void, title?: string): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "nkd-modal-sel";
  if (title) sel.title = title;
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value; opt.textContent = o.label;
    sel.appendChild(opt);
  }
  sel.value = value;
  sel.onchange = () => onChange(sel.value);
  return sel;
}
