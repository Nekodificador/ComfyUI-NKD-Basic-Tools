# 😺NKD Gradient Map / 😺NKD Gradient Generate

Both share one **color-ramp editor**: click the bar to add a stop, click a stop
for the native color picker, drag to move, Shift-click to remove. Save/load your
own ramps as presets.

**Gradient Map — use it to** recolor a photo by brightness (duotone, teal-orange,
any color grade): darks land on one end of the ramp, lights on the other.
`Invert` flips it, `Strength` dials it back, an optional `mask` limits where it
lands. Live preview updates as you edit the ramp — and run its play button to
preview the grade even when the image comes through a resize/subgraph.

https://github.com/user-attachments/assets/909d881d-3b09-41d2-88ba-aff797db9898

**Gradient Generate — use it to** make a gradient image from scratch (no input
needed) as a background, mask, or ramp source — `Linear`, `Radial`, `Angular`
(conic) or `Diamond`. A Photoshop-style **on-canvas gizmo** lets you drag two
handles right on the preview to set direction, center and extent instead of
typing numbers — plus a midpoint diamond to bias where the 50% color lands.
Feed it width/height and the gizmo adapts to that aspect ratio.

Connect the optional `image` and it takes that image's size, so you don't have
to wire width/height by hand. Pick a `blend_mode` (multiply, screen, overlay,
soft/hard light, add, difference, darken, lighten) and the gradient composites
straight over it at `opacity` — no separate blend node needed for light leaks,
vignettes or sky grads. Leave `blend_mode` on `none` to use the image purely as
a size reference and get the bare gradient. The preview shows the composite
live. The `mask` output is always the gradient's own falloff.

https://github.com/user-attachments/assets/1826bb38-fe14-46a2-9d62-92cee798560e

---

[← All 😺NKD Basic Tools nodes](../README.md)
