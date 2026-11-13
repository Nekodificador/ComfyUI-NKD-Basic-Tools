# 😺NKD Basic Blur

The plain blur ComfyUI doesn't ship: pick a type, set a radius in pixels.

- **Image, mask or video** on the same input, and the output is the same type. A
  video keeps its audio and frame rate.
- **Type**: Gaussian for a smooth falloff, Box for a flat average with harder
  edges, Tent in between. All three blur by the same amount at the same radius,
  so switching type changes the look of the edge, not its strength.
- **Radius** is in pixels and takes fractions, so every step of the slider
  changes the result. It's the same scale as the feather in
  [😺NKD Mask Ops](mask-ops.md): the same number softens an image and its mask
  alike.

---

[← All 😺NKD Basic Tools nodes](../README.md)
