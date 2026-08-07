/**
 * 😺NKD radial value handle — the arc gizmo from NKD Relight.
 *
 * A ring around a point whose *thickness* is the value. It reads at a glance
 * across a dozen points at once, which a number field or a slider panel does
 * not, and it needs no screen real estate away from the thing it controls.
 *
 * Ported from `ComfyUI-NKD-VFX-Tools/src/components/RelightingCanvas.vue`
 * (`drawSemicircleWidgets`, the sector hit-test in `onCanvasMouseDown`, and the
 * `makeDrag` scrub). Relight splits the ring into three sectors for three
 * values; here there is one value per pin, so there is one ring.
 *
 * The drag is vertical scrub, not radial: dragging *outward* to mean *more*
 * sounds right and is unusable, because the gesture's precision then depends on
 * how far from the centre you happened to grab. A fixed number of pixels for
 * the full range behaves the same everywhere. Shift is the pack-wide ×0.1 fine
 * adjust (see `fine_drag.ts` in NKD VFX Tools).
 */

/** Ring geometry, in screen pixels. */
export const RING = { inner: 16, maxWidth: 18, tol: 5 } as const;
/** Screen pixels of vertical travel for the whole 0..1 range. */
const SCRUB_PX = 90;
const FINE = 0.1;

/** True when the cursor is on the ring band around `cx, cy`. */
export function hitRing(px: number, py: number, cx: number, cy: number): boolean {
  const d = Math.hypot(px - cx, py - cy);
  return d >= RING.inner - RING.tol && d <= RING.inner + RING.maxWidth + RING.tol;
}

/** True when the cursor is on the centre dot rather than the ring. */
export function hitDot(px: number, py: number, cx: number, cy: number, r = 9): boolean {
  return Math.hypot(px - cx, py - cy) <= r;
}

export function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number,
                         value: number, color: string, selected: boolean): void {
  const v = Math.max(0, Math.min(1, value));
  const w = 2 + v * (RING.maxWidth - 2);

  ctx.save();
  // Track first, so a value of zero still shows where the ring is.
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = RING.maxWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, RING.inner + RING.maxWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(cx, cy, RING.inner + w / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = selected ? "#ff6b6b" : color;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (selected) {
    ctx.fillStyle = "#c8d0e0";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(v.toFixed(2), cx, cy - RING.inner - RING.maxWidth - 6);
  }
  ctx.restore();
}

/**
 * Start a vertical scrub. Returns the handler the caller drives from its own
 * pointermove; the value is updated *incrementally* so toggling Shift mid-drag
 * changes the gain without teleporting the value.
 */
export function startScrub(startY: number, get: () => number, set: (v: number) => void) {
  let prev = startY;
  return (y: number, fine: boolean) => {
    const delta = ((prev - y) / SCRUB_PX) * (fine ? FINE : 1);
    prev = y;
    set(Math.max(0, Math.min(1, get() + delta)));
  };
}
