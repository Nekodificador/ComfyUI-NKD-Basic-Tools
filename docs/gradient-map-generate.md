# 😺NKD Gradient Map / 😺NKD Gradient Generate

Both share one color-ramp editor: click the bar to add a stop, click a stop for
the native color picker, drag to move, Shift-click to remove. You can save and
load your own ramps as presets.

## Gradient Map

Recolors a photo by brightness, so darks land on one end of the ramp and lights
on the other. Duotone, teal-orange, any color grade.

- `Invert` flips the ramp, `Strength` dials the effect back.
- The optional `mask` limits where it lands.
- The preview updates as you edit the ramp, and its play button previews the
  grade even when the image comes through a resize or a subgraph.

https://github.com/user-attachments/assets/909d881d-3b09-41d2-88ba-aff797db9898

## Gradient Generate

Makes a gradient image from scratch, no input needed, as a background, a mask or
a ramp source.

- Four shapes: `Linear`, `Radial`, `Angular` (conic) and `Diamond`.
- A Photoshop-style on-canvas gizmo lets you drag two handles right on the
  preview to set direction, center and extent instead of typing numbers, plus a
  midpoint diamond to bias where the 50% color lands. Feed it width/height and
  the gizmo adapts to that aspect ratio.
- Connect the optional `image` and it takes that image's size, so you don't have
  to wire width/height by hand.
- `blend_mode` (multiply, screen, overlay, soft/hard light, add, difference,
  darken, lighten) composites the gradient straight over that image at `opacity`,
  which covers light leaks, vignettes and sky grads without a separate blend
  node. Leave it on `none` to use the image purely as a size reference and get
  the bare gradient.
- The `mask` output is always the gradient's own falloff.

The preview shows the composite live.

https://github.com/user-attachments/assets/1826bb38-fe14-46a2-9d62-92cee798560e

---

[← All 😺NKD Basic Tools nodes](../README.md)
