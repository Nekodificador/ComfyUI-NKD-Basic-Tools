# 😺NKD Mask Painter

Paints a mask onto an image that doesn't exist as a file yet, anything your graph
just generated, without saving it out and loading it back in. The canvas is on the
node itself: run the graph once and the image appears behind it. Out come the
image, the mask and its inverse.

## Painting

The same brush as [😺NKD Painter Node](paint.md), always painting the mask:

- `Brush` and `Eraser`, or `B` and `E`. The right button erases, and so does
  either tool with `Alt` held.
- `Lasso` (`L`) fills a shape instead of stroking. Drag to draw it freehand and it
  fills when you let go. Or click corner by corner, mixing in dragged runs, and close
  it on the first point, with a double-click or with `Enter`. `Esc` drops it. With
  the eraser, the right button or `Alt` held, it takes the shape away.
- `Size`, `Opacity` and `Hard` work for the lasso too: hardness softens its edge
  like a brush's.
- `Alt` + right drag sets size (left/right) and hardness (up/down), `[` and `]` step
  the size, and a pen's pressure scales it.
- `Ctrl+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes.
- Mouse wheel zooms at the cursor, `Space` + drag or the middle button pans, `0`
  fits the canvas again. The full-screen button opens the same canvas large.
- `V` (or the view button) cycles what you see: the mask tinted over the image,
  the outside dimmed, or the mask alone. `Shift+V` or Shift-clicking the button
  hides the mask to judge an edge; the button turns orange and reads `Hidden` until
  you press it again.

The node turns green when it's carrying a mask. Each change is saved as a PNG under
`input/nkd_masks/`, named after its content, and only that name goes in the
workflow, so a restart doesn't lose what you painted and an unchanged mask doesn't
re-run the graph.

## The `mask` input

Start from something upstream, a face detector, a segmenter,
[😺NKD Mask Ops](mask-ops.md), and refine it by hand. `mask_input_mode` picks how:

- `Use as start` copies it into the canvas when nothing is painted yet. After that
  your edits stick.
- `Replace` copies it into the canvas every time it changes.
- `Add`, `Subtract` and `Intersect` combine it with what you painted on every run,
  without touching your painting. The canvas shows the combined result.
- `Disconnected` ignores it.

`Reseed` copies the upstream mask into the canvas on top of what you painted. It
can be undone.

`Clear` wipes the canvas and re-runs the node so downstream sees it immediately.

One mask per node, so drop several on the same image when you want independent
masks.

This is the node for stacking masks. Anything with a `MASK` output feeds it,
[😺NKD Vector Mask](vector-mask.md) included, and the set operations composite
them while the result stays paintable. See
[Vector Mask or Mask Painter?](vector-mask.md#vector-mask-or-mask-painter)

---

[← All 😺NKD Basic Tools nodes](../README.md)
