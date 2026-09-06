/**
 * 😺NKD fine-adjust modifier — hold Shift for tenth-speed dragging.
 *
 * Shift is not a choice, it is the convention this pack already set: the
 * Preview 3D DragNumber has used Shift = x0.1 since it was written, and Shift is
 * what Blender, After Effects and Nuke use for precision. This module extends
 * the same feel to plain <input type="range"> sliders and to the 3D gizmo, so
 * one modifier behaves identically everywhere.
 *
 * Incremental, never measured from the start of the drag — the same rule
 * DragNumber follows. Toggling Shift halfway through a drag must not make the
 * value jump; it just changes how fast it moves from wherever it already is.
 *
 * **The drag is ours, not the browser's**, and that is the whole trick. The
 * previous version let the native control drag and rescaled the `input` event
 * afterwards, which cannot work past one screenful: the value the browser
 * reports is derived from the cursor's position *on the track*, so once the
 * cursor reaches the end there is no more delta to scale and the slider stops.
 * A tenth-speed drag could therefore never travel more than a tenth of the
 * range — on a −1…1 slider that is a hard ceiling of 0.2, whatever you do with
 * the mouse. Accumulating raw pointer deltas under pointer capture has no such
 * ceiling: keep moving and it keeps going, off the end of the track and past
 * the edge of the window.
 *
 * Double-click resets a slider to its default, for any input carrying a
 * `data-default` attribute. Sliders without one simply do not reset.
 *
 * No imports, so this file copies into any other ComfyUI-NKD-* pack as-is.
 */

export const FINE_GAIN = 0.1;

let shiftHeld = false;
if (typeof window !== "undefined") {
  // Capture phase: ComfyUI's own shortcut handling must not swallow it first.
  window.addEventListener("keydown", (e) => { if (e.key === "Shift") shiftHeld = true; }, true);
  window.addEventListener("keyup", (e) => { if (e.key === "Shift") shiftHeld = false; }, true);
  // A drag can end with the window losing focus (alt-tab) while Shift is down;
  // without this the whole UI would stay stuck in fine mode.
  window.addEventListener("blur", () => { shiftHeld = false; });
}

/** True while the fine-adjust modifier is held. Used by the 3D gizmo, which
 *  has no pointer event of its own to read at the moment it needs to know. */
export function isFine(): boolean { return shiftHeld; }

const isRange = (t: EventTarget | null): t is HTMLInputElement =>
  !!t && (t as HTMLInputElement).tagName === "INPUT" && (t as HTMLInputElement).type === "range";

const num = (s: string, fallback: number) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
};

/**
 * Write a value back and tell the framework about it.
 *
 * Quantized here rather than by the control: `step` is loosened to "any" for the
 * duration of a drag (a range input snaps whatever you assign to its step, which
 * would swallow a tenth-speed move whole), so the rounding has to happen on this
 * side. Integer-stepped controls stay integer — some of them count iterations,
 * and 2.5 passes is not a thing.
 */
function emit(el: HTMLInputElement, v: number, fine: boolean,
              step: number, min: number, max: number): void {
  const q = fine ? (Number.isInteger(step) && step >= 1 ? 1 : step * FINE_GAIN) : step;
  if (q > 0) v = Math.round(v / q) * q;
  v = Math.min(max, Math.max(min, v));
  // Rounded again to kill the float dust that leaves 0.30000000000000004 in a
  // readout bound straight to the value.
  v = Math.round(v * 1e6) / 1e6;
  if (el.value === String(v)) return;
  el.value = String(v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Make every <input type="range"> under `root` drag by pointer delta, respect
 * the fine modifier, and reset on double-click.
 *
 * Delegated and capture-phase on purpose: not one of the ~26 slider templates in
 * this pack needs touching. A template opts into double-click reset by adding
 * `data-default`; everything else works with no template change at all.
 *
 * Returns a detach function.
 */
export function attachFineRange(root: HTMLElement): () => void {
  const onDown = (e: PointerEvent) => {
    const el = e.target;
    if (!isRange(el) || el.disabled || e.button !== 0) return;
    // The second press of a double-click would otherwise jump the value to the
    // cursor a frame before the reset lands.
    if (e.detail > 1) { e.preventDefault(); return; }

    e.preventDefault();                    // the native drag would fight ours
    el.focus();
    try { el.setPointerCapture(e.pointerId); } catch { /* detached */ }

    const rect = el.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const min = num(el.min, 0);
    const max = num(el.max, 100);
    const span = max - min;
    const step = num(el.step, 0);          // step="any" → 0 → no quantization
    const restore = el.step;
    el.step = "any";                       // or the control snaps our fine values

    // Shift means "adjust what is already there", so it must not jump to the
    // cursor first. Without Shift, pressing the track jumps, as it always did.
    let v = e.shiftKey
      ? num(el.value, min)
      : min + ((e.clientX - rect.left) / width) * span;
    emit(el, v, e.shiftKey, step, min, max);

    let prevX = e.clientX;
    const move = (ev: PointerEvent) => {
      const gain = ev.shiftKey ? FINE_GAIN : 1;
      v = Math.min(max, Math.max(min, v + ((ev.clientX - prevX) / width) * span * gain));
      prevX = ev.clientX;
      emit(el, v, ev.shiftKey, step, min, max);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.step = restore;
      try { el.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const onDblClick = (e: MouseEvent) => {
    const el = e.target;
    if (!isRange(el) || el.disabled) return;
    const raw = el.dataset.default;
    if (raw == null) return;               // no declared default: nothing to do
    const d = parseFloat(raw);
    if (!Number.isFinite(d)) return;
    e.preventDefault();
    emit(el, d, false, num(el.step, 0), num(el.min, 0), num(el.max, 100));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  root.addEventListener("pointerdown", onDown, true);
  root.addEventListener("dblclick", onDblClick, true);
  return () => {
    root.removeEventListener("pointerdown", onDown, true);
    root.removeEventListener("dblclick", onDblClick, true);
  };
}
