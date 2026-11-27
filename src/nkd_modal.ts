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
  /** Asked before Esc closes the modal: return true to swallow it (e.g. to shut a sheet first). */
  beforeEsc?: () => boolean;
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

/* ── UI kit (nkd-ui-*): the editor look every NKD modal shares. Round borderless floats around
   the picture, a sidebar of cards on a 4/8px grid, a pill and a status line for the node.
   Additive: nothing above changes, an editor opts in by using these classes. The pill and the
   line live on the NODE, outside any modal, so a widget that uses them calls
   ensureNkdModalStyles() when it mounts. Shape language after nomadoor's Panorama Studio (MIT);
   reference implementation: Preview3DWidget.vue. ── */
.nkd-ui { --nkd-row: 24px; --nkd-lab: 64px; --nkd-fill: #2c2e36; --nkd-fill-hi: #3a3d48;
  --nkd-dim: #9aa1b2; --nkd-fg: #dcdce0; --nkd-note: #6f7686; --nkd-accent: #4ab4ff; --nkd-float: rgba(26,28,34,0.86); }
.nkd-ui, .nkd-ui *, .nkd-ui *::before, .nkd-ui *::after { box-sizing: border-box; }

/* On the node: the button that opens the editor, over the picture's bottom centre… */
.nkd-ui-pill {
  position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 3;
  height: 30px; padding: 0 14px 0 11px; border: 0; border-radius: 999px;
  background: rgba(26,28,34,0.86); color: #e6eaf2; cursor: pointer; white-space: nowrap;
  font: 600 12px/1 system-ui, sans-serif; display: inline-flex; align-items: center; gap: 7px;
  transition: background-color 120ms;
}
.nkd-ui-pill:hover { background: rgba(58,62,74,0.92); color: #fff; }
.nkd-ui-pill .pi { font-size: 12px; }
/* …and one status line under it: what the editor holds on the left, the size on the right. */
.nkd-ui-line {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: 0 0 auto;
  height: 26px; padding: 0 8px; background: #1a1c22; font: 11px/1 system-ui, sans-serif; color: #8a93a6;
}
.nkd-ui-line > span { display: inline-flex; align-items: center; gap: 5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nkd-ui-line .pi { font-size: 11px; }
.nkd-ui-line > b { flex: none; color: #dcdce0; font-weight: 600; font-variant-numeric: tabular-nums; }

/* Floating groups: position them yourself (absolute, in the stage's margins — never on the picture). */
.nkd-ui-float { position: absolute; z-index: 3; display: inline-flex; align-items: center; gap: 2px; padding: 5px;
  background: var(--nkd-float, rgba(26,28,34,0.86)); border-radius: 999px; color: #c8d0e0; font: 11px/1 system-ui, sans-serif; }
.nkd-ui-float.col { flex-direction: column; border-radius: 20px; }
.nkd-ui-float button {
  min-width: 30px; height: 30px; padding: 0; border: 0; border-radius: 999px; flex: 0 0 auto;
  background: transparent; color: #c8d0e0; cursor: pointer; line-height: 1; font: inherit;
  display: flex; align-items: center; justify-content: center; gap: 6px; transition: background-color 120ms;
}
.nkd-ui-float button.txt { padding: 0 12px; font-weight: 600; }
.nkd-ui-float button .pi { font-size: 13px; line-height: 1; color: inherit; }
.nkd-ui-float button:hover { background: rgba(255,255,255,0.1); color: #fff; }
.nkd-ui-float button.on { background: #4ab4ff; color: #0c0d10; }
/* The one that queues work on the server: ComfyUI's own Run colour, read from the frontend's
   variable so it follows the theme. Reserve it for that — one per editor at most. */
.nkd-ui-float button.run { background: var(--color-brand-yellow, #f0ff41); color: #0c0d10; }
.nkd-ui-float button.run:hover { background: color-mix(in srgb, var(--color-brand-yellow, #f0ff41) 82%, #fff); color: #0c0d10; }
.nkd-ui-float button:disabled { opacity: 0.3; cursor: not-allowed; background: transparent; color: #c8d0e0; }
.nkd-ui-sep { width: 1px; height: 16px; margin: 0 3px; background: rgba(255,255,255,0.14); flex: 0 0 auto; }
.nkd-ui-float.col .nkd-ui-sep { width: 16px; height: 1px; margin: 3px 0; }

/* Sidebar of cards. 4px between rows and between controls in a row, 8px between blocks. */
.nkd-ui-side { min-height: 0; overflow: hidden auto; background: #1a1c22; border-left: 1px solid #2a2d36;
  padding: 8px; display: flex; flex-direction: column; gap: 8px; font: 11px/1.2 system-ui, sans-serif; color: var(--nkd-dim); }
.nkd-ui-card { background: #202229; border-radius: 12px; flex: 0 0 auto; }
.nkd-ui-card.sel { box-shadow: inset 0 0 0 1px rgba(74,180,255,0.55); }
.nkd-ui-cardhead { display: flex; align-items: center; gap: 7px; padding: 11px 12px 0; min-height: 33px;
  color: #fff; font: 600 13px/1 system-ui, sans-serif; }
.nkd-ui-cardhead > .pi { color: #8a93a6; font-size: 12px; }
.nkd-ui-cardhead > .grow { flex: 1 1 auto; min-width: 0; }
.nkd-ui-cardbody { padding: 10px 12px 12px; display: grid; grid-template-columns: minmax(0,1fr); gap: 4px; }
.nkd-ui-cardbody.off { opacity: 0.4; }
/* One row: label · control · value on the SAME columns in every card, so the tracks line up. */
.nkd-ui-row { display: grid; grid-template-columns: var(--nkd-lab) minmax(0,1fr) 38px; align-items: center;
  column-gap: 6px; min-height: 20px; }
.nkd-ui-row > :first-child { color: var(--nkd-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nkd-ui-row > :last-child:not(:nth-child(2)) { color: var(--nkd-fg); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nkd-ui-row.wide { grid-template-columns: var(--nkd-lab) minmax(0,1fr); min-height: var(--nkd-row); }
.nkd-ui-sub { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--nkd-note);
  margin-top: 8px; display: flex; align-items: center; gap: 6px; min-height: 16px; }
.nkd-ui-sub:first-child { margin-top: 0; }
.nkd-ui-note { font-size: 10px; color: var(--nkd-note); line-height: 1.3; }
/* Fields, buttons and selects: one height, one fill, no outline until edited. */
.nkd-ui-btn, .nkd-ui-sel, .nkd-ui-field { height: var(--nkd-row); border: 1px solid transparent; border-radius: 6px;
  background: var(--nkd-fill); color: var(--nkd-fg); font: 11px/1 system-ui, sans-serif; padding: 0 8px; min-width: 0; }
.nkd-ui-btn, .nkd-ui-sel { cursor: pointer; }
.nkd-ui-btn:hover, .nkd-ui-sel:hover, .nkd-ui-field:hover { background: var(--nkd-fill-hi); }
.nkd-ui-btn.on { background: #4ab4ff; color: #0c0d10; }
.nkd-ui-btn.round { border-radius: 999px; padding: 0 12px; height: 22px; }
.nkd-ui-btn.icon { width: var(--nkd-row); padding: 0; flex: 0 0 auto; }
.nkd-ui-btn .pi { font-size: 10px; }
.nkd-ui-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.nkd-ui-field:focus, .nkd-ui-sel:focus { outline: none; border-color: #4ab4ff; }
.nkd-ui-swatch { width: 28px; height: 20px; padding: 2px; border: 0; border-radius: 6px; background: var(--nkd-fill); cursor: pointer; flex: 0 0 auto; }
.nkd-ui-check { display: inline-flex; align-items: center; gap: 8px; min-height: 20px; color: var(--nkd-fg); cursor: pointer; }
.nkd-ui-check input, .nkd-ui input[type='checkbox'].nkd-ui-box { width: 14px; height: 14px; margin: 0; flex: 0 0 auto; accent-color: #4ab4ff; cursor: pointer; }
/* Sliders: thin track, small light thumb. Set --nkd-pct (0–100%) for a filled track. */
.nkd-ui-range { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; margin: 0; background: transparent; cursor: pointer; touch-action: none; }
.nkd-ui-range::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(90deg, #7f8aa3 var(--nkd-pct, 0%), #3a3d48 var(--nkd-pct, 0%)); }
.nkd-ui-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px; border-radius: 50%; background: #c8d0e0; border: 0; }
.nkd-ui-range:hover::-webkit-slider-thumb { background: #fff; }
.nkd-ui-range::-moz-range-track { height: 4px; border-radius: 2px; background: #3a3d48; }
.nkd-ui-range::-moz-range-progress { height: 4px; border-radius: 2px; background: #7f8aa3; }
.nkd-ui-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #c8d0e0; border: 0; }
.nkd-ui-range:disabled { opacity: 0.3; cursor: default; }
/* A slider inside a floating bar: label, track, value in a line. */
.nkd-ui-barfield { display: inline-flex; align-items: center; gap: 8px; padding: 0 6px; color: #9aa1b2; white-space: nowrap; }
.nkd-ui-barfield > span:last-child:not(:first-child) { color: #dcdce0; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; }
.nkd-ui-barfield .nkd-ui-range { width: 140px; }

/* Shortcuts sheet, over the stage. */
.nkd-ui-help { position: absolute; z-index: 4; overflow: auto; background: rgba(27,28,30,0.97); border-radius: 12px;
  padding: 16px 20px; color: #dcdce0; font: 12px/1.3 system-ui, sans-serif; }
.nkd-ui-help-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; color: #8e8f93; }
.nkd-ui-help-head b { color: #fff; font-size: 15px; font-weight: 600; }
.nkd-ui-help-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px 40px; }
.nkd-ui-help h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #fff; }
.nkd-ui-help-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 0; border-top: 1px solid #2a2b2d; }
.nkd-ui-help-row > span:last-child { display: inline-flex; align-items: center; gap: 5px; color: #8e8f93; white-space: nowrap; }
.nkd-ui-help kbd, .nkd-ui kbd { font: 600 11px/1 system-ui, sans-serif; color: #dcdce0; background: #2c2c2e;
  border-radius: 5px; padding: 4px 7px; min-width: 22px; text-align: center; display: inline-block; }
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
    if (api.beforeEsc?.()) return;
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

  const api: NkdModal = {
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
  return api;
}

/* ── Control factories ─────────────────────────────────────────────────────
   Only the controls both extracted editors actually used. Vue callers can skip
   these entirely and put the class names in their template. */

/**
 * Pop a node's DOM-widget container out into an open modal — and KEEP it there.
 *
 * Moving the mount container with appendChild keeps a WebGL context, the loaded scene and
 * every setting (one live instance, no second renderer). Two things then go wrong unless they
 * are guarded, both measured in Preview 3D and again in Relight:
 *
 *  1. Writing a node widget's value makes the frontend's DOM-widget host take the container
 *     BACK into the node, and the modal is left an empty box. A MutationObserver on the modal
 *     body takes it back, and remembers where the host had put it: that element (possibly a
 *     re-created one) is where it has to return on close.
 *  2. Re-parenting an element releases its pointer capture, so an editor that writes the widget
 *     on every move of a drag loses the drag. Route those writes through `write()`: while a
 *     button is down they are held (last one per key wins) and land once, on release.
 *
 * Call `restore()` from the modal's onClose, before the widget re-measures.
 */
export interface NkdPopOut {
  /** Run `fn` now, or — while a pointer button is down — once on release. */
  write(key: string, fn: () => void): void;
  flush(): void;
  restore(): void;
}
export function nkdPopOut(modal: NkdModal, container: HTMLElement,
                          opts: { placeholder?: string; onReclaim?: () => void } = {}): NkdPopOut {
  let slot = container.parentElement as HTMLElement | null;
  // Something in the node's reserved row, or it reads as a broken empty box.
  const ph = div("");
  ph.textContent = opts.placeholder ?? "Open in the editor";
  ph.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:100%;height:100%;" +
    "box-sizing:border-box;color:rgba(255,255,255,0.35);font-size:11px;" +
    "background:#111318;border:1px dashed #3a3d46;border-radius:4px;";
  slot?.appendChild(ph);
  container.style.height = "100%";   // the node sizes it by width × aspect; the modal body is a flex row
  container.style.flex = "1 1 auto";
  modal.body.appendChild(container);

  let open = true;
  let down = false;
  const held = new Map<string, () => void>();
  const flush = () => { const fns = [...held.values()]; held.clear(); for (const fn of fns) fn(); };
  const reclaim = () => {
    if (!open || container.parentElement === modal.body) return;
    const at = container.parentElement as HTMLElement | null;
    if (at) { slot = at; at.appendChild(ph); }
    modal.body.appendChild(container);
    opts.onReclaim?.();
  };
  const mo = new MutationObserver(reclaim);
  mo.observe(modal.body, { childList: true });
  const onDown = () => { down = true; };
  const onUp = (e: PointerEvent) => { if (!e.buttons) { down = false; flush(); } };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);

  return {
    write(key, fn) { if (open && down) held.set(key, fn); else fn(); },
    flush,
    restore() {
      if (!open) return;
      open = false;
      mo.disconnect();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      flush();
      if (slot && container.parentElement !== slot) slot.appendChild(container);
      container.style.height = "";
      container.style.flex = "";
      ph.remove();
    },
  };
}

/* ── UI-kit builders ──────────────────────────────────────────────────────── */

/** A round icon button for a `.nkd-ui-float` group. `icon` is a PrimeIcons name without the
 *  `pi-` prefix (verify it exists in the frontend's stylesheet), or plain text when `text`. */
export function nkdIcon(icon: string, title: string, onClick: (e: MouseEvent) => void,
                        text = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.title = title;
  if (text) { b.className = "txt"; b.textContent = icon; }
  else { const i = document.createElement("i"); i.className = `pi pi-${icon}`; b.appendChild(i); }
  b.addEventListener("click", onClick);
  return b;
}

/** A floating group on `stage` (which must be positioned). `place` is its CSS position, e.g.
 *  "left:14px;top:50%;transform:translateY(-50%)". Children may include `nkdSep()`. */
export function nkdFloat(stage: HTMLElement, place: string, column: boolean,
                         ...children: HTMLElement[]): HTMLDivElement {
  const f = div("nkd-ui nkd-ui-float" + (column ? " col" : ""));
  f.style.cssText = place;
  // The stage under it pans, zooms and places points: a press on a float is not one of those.
  for (const ev of ["pointerdown", "mousedown", "wheel", "dblclick"]) f.addEventListener(ev, (e) => e.stopPropagation());
  f.append(...children);
  stage.appendChild(f);
  return f;
}
export function nkdSep(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "nkd-ui-sep";
  return s;
}

/** [section title, [what, keys, note][]] — list only what the editor really does. */
export type NkdShortcuts = [string, [string, string[], string?][]][];

/**
 * The shortcuts sheet: a `?` button for the editor's right-hand column, the `?` key, and Esc
 * closing the sheet before the editor (through the modal's `beforeEsc`). The sheet covers
 * `stage`, which must be positioned. Returns the button to put in a float.
 */
export function nkdHelp(modal: NkdModal, stage: HTMLElement, sections: NkdShortcuts): HTMLButtonElement {
  const sheet = div("nkd-ui nkd-ui-help");
  sheet.style.cssText = "inset:14px 66px 14px 14px;display:none";
  const head = div("nkd-ui-help-head");
  head.innerHTML = "<b>Shortcuts</b><span><kbd>?</kbd> or <kbd>Esc</kbd> to close</span>";
  const cols = div("nkd-ui-help-cols");
  for (const [title, rows] of sections) {
    const sec = document.createElement("section");
    const h = document.createElement("h4");
    h.textContent = title;
    sec.appendChild(h);
    for (const [what, keys, note] of rows) {
      const row = div("nkd-ui-help-row");
      const a = document.createElement("span");
      a.textContent = what;
      const b = document.createElement("span");
      keys.forEach((k, i) => {
        if (i) b.append("+");
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        b.appendChild(kbd);
      });
      if (note) b.append(note);
      row.append(a, b);
      sec.appendChild(row);
    }
    cols.appendChild(sec);
  }
  sheet.append(head, cols);
  for (const ev of ["pointerdown", "mousedown", "wheel", "dblclick"]) sheet.addEventListener(ev, (e) => e.stopPropagation());
  stage.appendChild(sheet);

  let open = false;
  const btn = nkdIcon("question", "Shortcuts — ?", () => set(!open));
  const set = (v: boolean) => { open = v; sheet.style.display = v ? "" : "none"; btn.classList.toggle("on", v); };
  modal.beforeEsc = () => { if (!open) return false; set(false); return true; };
  const onKey = (e: KeyboardEvent) => {
    if (!modal.overlay.isConnected) { window.removeEventListener("keydown", onKey, true); return; }
    if (e.key !== "?" || e.repeat) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && (a as HTMLInputElement).type !== "range") return;
    e.preventDefault();
    e.stopPropagation();
    set(!open);
  };
  window.addEventListener("keydown", onKey, true);
  return btn;
}

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
  /** Value a double-click restores. Omit and double-click does nothing, rather
   *  than guessing that the value it opened with was the default. */
  def?: number;
  /** Build it with the UI kit's look instead of the footer's. `"row"` is a sidebar-card
   *  row (label · track · value; the track fills it and `width` is ignored). `"bar"` is an
   *  inline group for a floating bar, where `width` is the track's. */
  kit?: "row" | "bar";
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
  const kit = !!cfg.kit;
  wrap.className = cfg.kit === "row" ? "nkd-ui-row" : cfg.kit === "bar" ? "nkd-ui-barfield" : "nkd-modal-lbl";
  if (title) wrap.title = title;

  const rng = document.createElement("input");
  rng.type = "range";
  rng.className = kit ? "nkd-ui-range" : "nkd-modal-rng";
  rng.min = String(cfg.min); rng.max = String(cfg.max);
  rng.step = "any";                            // we quantize; the browser must not
  rng.value = String(cfg.value);
  if (cfg.width && cfg.kit !== "row") rng.style.width = `${cfg.width}px`;

  const out = cfg.format ? document.createElement("span") : null;
  if (out && !kit) out.className = "nkd-modal-num";

  const fine = cfg.fine ?? cfg.step / 10;
  const clamp = (v: number) => Math.max(cfg.min, Math.min(cfg.max, v));
  const quantize = (v: number, soft: boolean) => {
    const q = soft ? fine : cfg.step;
    // Rounded twice: once to the quantum, once to kill the float dust that
    // leaves 0.30000000000000004 in a readout.
    return Math.round(Math.round(clamp(v) / q) * q * 1e6) / 1e6;
  };
  const show = (v: number) => {
    if (out) out.textContent = cfg.format!(v);
    // The kit track is filled up to the thumb.
    if (kit) rng.style.setProperty("--nkd-pct", `${((v - cfg.min) / (cfg.max - cfg.min || 1)) * 100}%`);
  };
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

  // Double-click restores the default — the same gesture the pack's sliders in
  // other packs use, driven from `def` rather than from a data attribute
  // because here the caller is already handing us a config object.
  rng.addEventListener("dblclick", (e) => {
    if (cfg.def == null || rng.disabled) return;
    e.preventDefault();
    apply(cfg.def, false);
  });

  // A span, not a bare text node, so callers can align a column of sliders
  // by giving every label the same width (see the face rig's panel).
  const txt = document.createElement("span");
  if (!kit) txt.className = "nkd-modal-lbl-txt";
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
  // Pack convention (from Color Warp): wheel over a dropdown steps through its
  // options without opening it — up = next option. Stops at the ends.
  sel.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const i = sel.selectedIndex + (e.deltaY < 0 ? 1 : -1);
    if (i < 0 || i >= sel.options.length) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("change"));
  }, { passive: false });
  return sel;
}
