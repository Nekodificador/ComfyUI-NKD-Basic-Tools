# 😺NKD Crop / Outpaint · 😺NKD Crop / Outpaint Stitch

Draw the crop on the image itself instead of typing four numbers into a transform
node. Drag a rectangle over the preview, rotate it, lock it to a ratio, and the
node hands you that region at the size your model wants. Push the rectangle past
the edge of the frame and it becomes an outpaint: the canvas grows, the new area
comes back as a mask, and the fill of your choice sits under it so the sampler has
something to work from.

Stitch is the way back. It takes the sampled patch, undoes the rotation and the
resize, and composites it onto the original at full resolution.

```mermaid
flowchart LR
    LI(["Load Image / Video / Mask"]):::input --> CROP
    CROP["**NKD Crop / Outpaint**"]:::nkd -- "image / mask" --> PIPE(["your sampling pipeline"]):::external
    CROP -- crop_data --> STITCH["**NKD Crop / Outpaint Stitch**"]:::nkd
    PIPE -- image --> STITCH
    STITCH --> OUT(["full-resolution result"]):::output

    classDef nkd fill:#3b3b6b,stroke:#8ab4ff,stroke-width:2px,color:#fff
    classDef input fill:#2d2d2d,stroke:#888,color:#eee
    classDef external fill:#2d2d2d,stroke:#888,color:#eee
    classDef output fill:#1f4a1f,stroke:#7fd97f,color:#fff
```

One input takes images, masks and video, so the same node crops all three. A video
gets a play button and a scrub bar under the preview, and the rectangle stays
visible while it runs, which is how you find a framing that holds for the whole
shot rather than just for frame zero.

## Drawing the box

The node starts with no rectangle at all. It appears when you draw one, and the
area outside it is dimmed so you can read what you're throwing away. A 3×3 grid
sits inside for composition.

- Drag on empty space to draw a new rectangle. That works whether or not one
  already exists, so redrawing never means deleting first.
- Drag inside it to move it, and drag any of the eight handles, four corners and
  four edges, to resize.
- The knob above the top edge rotates. Hold `Shift` while rotating to snap to 15°.
- `Shift` while resizing in Free mode keeps whatever ratio the box had when the
  drag started.
- Edges stick to the edges of the source image when they get close, while moving,
  resizing or drawing. Lock an aspect and glue the box to two opposite edges to
  outpaint a 2:3 image into a 1:1, exactly. Hold `Alt` to drag past without snapping.
- `Aspect` in the toolbar locks the shape to a preset: 1:1, 4:5, 3:4, 2:3, 9:16
  and the four landscape counterparts. `Reset` clears the rectangle.

In Outpaint mode the view zooms out on its own as the box approaches the edge,
before it touches it, so there's always room to keep dragging. In Crop mode the
rectangle is contained instead: rotate it into a corner and it shrinks and slides
to stay inside the source rather than pulling black in with it.

## Crop / Outpaint

- `mode` picks between the two. Crop keeps the rectangle inside the source.
  Outpaint lets it extend past the edge and grow the canvas.
- `fill` decides what goes under the outpainted area: `edge` replicates the border
  pixel, `reflect` mirrors the image back out, and `black`, `white`, `gray` or
  `color` lay down a flat tone. Default is `edge`.
- `fill_color` is the colour picker `fill = color` uses. Default `#000000`.
- `divisible_by` aligns the rectangle itself to a multiple of 8, 16, 32 or 64 by
  growing it, not by resampling. MiniMax and friends want their pixel grid, and
  landing off it makes the model rescale every frame behind your back. Default
  `disabled`.
- `max_megapixels` resizes the result to that budget in either direction, so a
  small crop is scaled up to reach the target instead of only a big one being
  capped. 0 leaves the size alone.
- `resize_method` is the filter used when either of those two actually resizes:
  `lanczos`, `bicubic`, `bilinear`, `area` or `nearest-exact`. Masks always use
  bilinear.

Outputs are `image`, `mask`, `width`, `height` and `crop_data`. With an image or a
video in, the mask is white over the outpainted area, which is the polarity
`VAEEncodeForInpaint` and the rest of the core expect: white means generate here.
Feed the node a mask instead and it crops the mask itself.

## Stitch

- `feather` softens the edge of the pasted patch, in pixels. It only ever grows
  inward. Blurring outward would smear the patch over pixels that were never part
  of it and leave a visible frame around the paste.
- `edge_hardness` firms that blend up when the original background ghosts through
  as a halo. 0 is off, 1 is a hard edge.

Rotation is handled here too, so a crop taken at an angle goes back at the same
angle without you squaring anything up by hand.

---

[← All 😺NKD Basic Tools nodes](../README.md)
