# 😺NKD Path Blur

Directional motion blur that *curves*, instead of the single straight angle a
normal motion blur gives you. Draw strokes showing which way things move; the
direction between them is blended into a smooth field, and each stroke carries
its own speed.

> Both blur editors preview the real result, not an approximation. The geometry
> goes to the backend and comes back rendered by the same code the graph runs, so
> what you tune is what you get. It refreshes when you finish a drag rather than
> during one, and `V` toggles between the result and the original. The node has
> to have run once for there to be a frame to preview.

- **Spread** sets how far a stroke's influence reaches. Areas far from every
  stroke stay sharp.
- **Ctrl-drag a point** for its own speed, on top of the stroke's. The stroke's
  Speed slider then becomes the overall intensity of that path and the per-point
  value is the shape of it along its length, so one stroke can accelerate instead
  of needing a stroke per speed. The dashed clone sits where that pixel will
  actually end up, at the current **Strength**.
- **Shift-drag empty space** to box-select points and move, delete or Ctrl-drag
  them as a pack.
- **`mask` input**: where it's white, the original is kept. No occlusion
  information exists, so at the end of a stroke the background will smear over
  whatever is in front of it, and this is what protects it.

Very high **Strength** ghosts rather than blurs. The sampling is capped, and past
that point you see discrete steps instead of a smear.

---

[← All 😺NKD Basic Tools nodes](../README.md)
