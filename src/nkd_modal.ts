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
 * other ComfyUI-NKD-* pack works as-is.
 *
 * ── THIS COPY IS THE CANONICAL ONE ────────────────────────────────────────
 * The same file is vendored by hand into other packs — today ComfyUI-NKD-VFX-Tools
 * (`src/nkd_modal.ts`, which additionally emits `web/js/nkd_modal.js` as its own
 * Vite entry so hand-written extensions can import it at runtime; this pack has
 * no such entry and no `web/` at all).
 *
 * Nothing enforces that those copies stay in step — "do not fork it" is a comment,
 * not a build step — so: **change it here, then copy outward and rebuild the
 * consumer.** If you find yourself editing it anywhere else, you are creating the
 * divergence this note exists to prevent. Everything added here must stay
 * dependency-free and backwards compatible, because a copy lands in a pack whose
 * callers you are not looking at.
 *
 * Consumers today: this pack's spline editors (Vector Mask / Path Blur / Field
 * Blur) and, in VFX Tools, fSpy Camera, Lens Distort, Preview 3D and Perspective
 * Dewarp.
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
.nkd-modal-rng { width: 80px; accent-color: #4ab4ff; cursor: pointer; touch-action: none; }
.nkd-modal-num {
  color: #c8d0e0; font-variant-numeric: tabular-nums;
  min-width: 52px; text-align: right;
}
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

/** Gain while Shift is held. The NKD pack-wide fine-adjust, same as the arc
 *  gizmo's vertical scrub. */
const FINE_GAIN = 0.1;

export type NkdSliderCfg = {
  min: number; max: number; step: number; value: number;
  /** Track width in px. The default is deliberately small; give a slider that
   *  has to be aimed precisely a wide one. */
  width?: number;
  /** Quantum while Shift is held. Defaults to a tenth of `step`. */
  fine?: number;
  /** Render the value beside the track. Give it units — a bare number next to a
   *  slider called "Feather" does not say pixels, and pixels is the question. */
  format?: (v: number) => string;
};

export type NkdSlider = HTMLLabelElement & {
  /** Set the value from outside without firing `onInput`. */
  sync(v: number): void;
  /** Grey the control out — no value to edit. */
  setDisabled(off: boolean): void;
};

/**
 * A range input whose *drag* is ours, not the browser's.
 *
 * The native drag maps the pointer straight onto the track, so precision is
 * whatever the track's width buys you and no more: on a 0..128 range in 80 px,
 * one pixel of mouse is one and a half units and there are values you simply
 * cannot select. Driving it by pointer *delta* instead means Shift can scale the
 * gain, and because the value accumulates rather than being re-derived from the
 * cursor, taking Shift on or off mid-drag changes the sensitivity without the
 * value jumping.
 *
 * The element stays a real `<input type=range>` — same look, same keyboard — and
 * carries `step="any"` so it will not snap away the fine values underneath us.
 */
export function nkdSlider(label: string, cfg: NkdSliderCfg,
                          onInput: (v: number) => void, title?: string): NkdSlider {
  const wrap = document.createElement("label") as NkdSlider;
  wrap.className = "nkd-modal-lbl";
  if (title) wrap.title = title;

  const rng = document.createElement("input");
  rng.type = "range";
  rng.className = "nkd-modal-rng";
  rng.min = String(cfg.min); rng.max = String(cfg.max);
  rng.step = "any";                            // we quantize; the browser must not
  rng.value = String(cfg.value);
  if (cfg.width) rng.style.width = `${cfg.width}px`;

  const out = cfg.format ? document.createElement("span") : null;
  if (out) out.className = "nkd-modal-num";

  const fine = cfg.fine ?? cfg.step / 10;
  const clamp = (v: number) => Math.max(cfg.min, Math.min(cfg.max, v));
  const quantize = (v: number, soft: boolean) => {
    const q = soft ? fine : cfg.step;
    // Rounded twice: once to the quantum, once to kill the float dust that
    // leaves 0.30000000000000004 in a readout.
    return Math.round(Math.round(clamp(v) / q) * q * 1e6) / 1e6;
  };
  const show = (v: number) => { if (out) out.textContent = cfg.format!(v); };
  const apply = (v: number, soft: boolean) => {
    const q = quantize(v, soft);
    rng.value = String(q);
    show(q);
    onInput(q);
  };

  rng.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || rng.disabled) return;
    e.preventDefault();                        // ours now, not the browser's
    rng.focus();
    try { rng.setPointerCapture(e.pointerId); } catch { /* synthetic events have no real pointer */ }
    const rect = rng.getBoundingClientRect();
    const span = cfg.max - cfg.min;
    const width = Math.max(1, rect.width);
    // Shift means "adjust what is already there", so it must not jump to the
    // cursor first. Without Shift, clicking the track jumps, as it always did.
    let v = e.shiftKey
      ? parseFloat(rng.value)
      : clamp(cfg.min + ((e.clientX - rect.left) / width) * span);
    apply(v, e.shiftKey);

    let prevX = e.clientX;
    const move = (ev: PointerEvent) => {
      v = clamp(v + ((ev.clientX - prevX) / width) * span * (ev.shiftKey ? FINE_GAIN : 1));
      prevX = ev.clientX;
      apply(v, ev.shiftKey);
    };
    const up = (ev: PointerEvent) => {
      rng.removeEventListener("pointermove", move);
      rng.removeEventListener("pointerup", up);
      rng.removeEventListener("pointercancel", up);
      try { rng.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
    };
    rng.addEventListener("pointermove", move);
    rng.addEventListener("pointerup", up);
    rng.addEventListener("pointercancel", up);
  });

  // step="any" would otherwise leave the arrow keys moving by a hundredth of the
  // range, which is neither the coarse step nor the fine one.
  rng.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const q = e.shiftKey ? fine : cfg.step;
    apply(parseFloat(rng.value) + dir * q, e.shiftKey);
  });

  // A span, not a bare text node, so callers can align a column of sliders
  // by giving every label the same width (see the face rig's panel).
  const txt = document.createElement("span");
  txt.className = "nkd-modal-lbl-txt";
  txt.textContent = label;
  wrap.append(txt, rng);
  if (out) wrap.appendChild(out);
  show(cfg.value);

  wrap.sync = (v: number) => {
    rng.value = String(v);
    show(v);
  };
  wrap.setDisabled = (off: boolean) => {
    rng.disabled = off;
    wrap.style.opacity = off ? "0.45" : "";
  };
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
