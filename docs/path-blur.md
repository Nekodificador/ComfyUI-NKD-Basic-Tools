# 😺NKD Path Blur

> Both blur editors preview the **real** result, not an approximation: the
> geometry goes to the backend and comes back rendered by the same code the
> graph runs, so what you tune is what you get. It refreshes when you finish a
> drag rather than during one. `V` toggles between the result and the original.
> The node has to have run once for there to be a frame to preview.

**Use it to** add directional motion blur that *curves*, instead of the single
straight angle a normal motion blur gives you. Draw strokes showing which way
things move; the direction between them is blended into a smooth field, and each
stroke carries its own speed.

- Areas far from every stroke stay sharp — **Spread** sets how far the influence
  reaches.
- **Ctrl-drag a point for its own speed**, on top of the stroke's. The stroke's
  Speed slider is then the overall intensity of that path and the per-point
  value is the shape of it along its length, so one stroke can accelerate
  instead of needing a stroke per speed. The dashed clone sits where that pixel
  will actually end up, at the current **Strength**.
- **Shift-drag empty space to box-select points** and move, delete or Ctrl-drag
  them as a pack.
- **No occlusion information exists**, so at the end of a stroke the background
  will smear over whatever is in front of it. That is what the `mask` input is
  for: where it's white the original is kept.
- Very high **Strength** ghosts rather than blurs — the sampling is capped, and
  past that point you see discrete steps instead of a smear.

---

[← All 😺NKD Basic Tools nodes](../README.md)
