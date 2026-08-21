# 😺NKD Vector Mask

<img width="1853" height="1199" alt="image" src="https://github.com/user-attachments/assets/aea95716-85a8-4402-abf8-e10e78cedfb6" />

**Use it to** draw a mask by hand with a pen tool, the way you would roto a shape
in Nuke — and keep it editable forever, because what gets saved is the control
points, not pixels. Click **Draw mask shapes** and the editor opens over the
graph.

- **Two curve types, mixable in the same mask.** **Bezier** puts the point *on*
  the curve with pen handles — what you want tracing an exact outline.
  **B-spline** is the same rational cubic B-spline (NURBS) as the 😺NKD Sigmas
  Curve editor, pinned to it by a parity test, and drawn the same way — points
  joined by a dashed control polygon so you can see which one steers what.
  Smooth with far fewer points and no handles to wrangle: the points steer the
  curve rather than sitting on it, which is exactly why it can never overshoot
  however close together you put them.
- **Shapes are open while you draw them.** Click the first point again, or
  double-click empty space, to close. Until then it's a stroke, not a region.
- **Click on a finished curve to insert a point** between the two it falls
  between, then drag it into place. On a B-spline the new point lands on the
  control polygon rather than under the cursor — that's the position that leaves
  the rest of the shape where it was.
- **Double-click a point for a hard corner**, double-click again to make it
  smooth. On a Bezier both handles retract; on a B-spline it repeats the control
  point, which is the only way to get a true corner — no amount of tension gives
  you one.
- **Subtract shapes cut holes** in the shapes before them, each with its own
  feather — so a soft cut-out is one shape rather than a second node.
- **Ctrl-drag a point to pull a feather clone out of it**, exactly as in Fusion.
  The clone is a real point you place by hand: drag it to say where the edge has
  faded to nothing, drag it again later to move it, shift-click it to take it
  away and the edge goes back to hard. It isn't a width pushed straight out — you
  can skew it along the edge, make the softness wider at one end than the other,
  or pull it *inside* the shape to feather inward. That's how you blend a shadow
  side away while the lit edge next to it stays razor sharp; a single shape-wide
  feather can only do one or the other.
  Between clones the softness runs on the **same spline as the shape**, so on a
  B-spline it eases in and out along the curve like everything else, with no
  crease at the control points. And it falls off on a smoothstep rather than a
  straight ramp — a linear gradient has a corner in its slope at each end, and
  those corners read as edges, which is the one thing feathering exists to
  remove.
- **Shift-drag empty space to box-select points**, then move them as a pack,
  delete them together, or Ctrl-drag one to move every selected clone by the
  same offset. Same gesture as the 😺NKD Color Warp grid. `Esc` drops the
  selection.
- **Clear feather** removes every clone at once and puts all the edges back to
  hard — or just the box-selected ones, if there's a selection.
- **The shape-wide Feather slider is continuous**, down to hundredths of a pixel
  — hold `Shift` while dragging for fine control, and it reads out the radius in
  px. (It used to snap to odd kernel widths, so 4 and 5 were the same blur and
  most of the slider's travel did nothing.)
- **Clicking away from a finished shape deselects it**, and only the *next*
  click on empty canvas starts a new one — so looking at a closed outline
  without its selection never leaves a stray point behind.
- **`H` hides the curves**, leaving the backdrop with nothing drawn over it,
  which is the only way to judge an edge that has a control point sitting on it.
  Editing still works while they're hidden.
- **Live preview**: the editor composites the real matte as you drag — subtract
  shapes actually cutting, feather actually soft. `V` cycles between the image
  with everything outside the mask dimmed, the mask on its own, and the
  untouched image.
- Survives a resolution change: coordinates are relative, and the editor warns
  you if the aspect ratio no longer matches what you drew on.

## Vector Mask or Mask Painter?

They're two ways at the same job, and they're better together than apart — this
node's `MASK` output plugs straight into Mask Painter's `mask` input.

Reach for **Vector Mask** when the mask is a *shape*: an outline you want exact,
and still editable next week, because what's saved is the control points rather
than pixels.

Reach for **Mask Painter** when you're **combining masks and want to keep
editing**. That's what its `mask_input_mode` is for: send it a vector mask, a
segmenter's output, 😺NKD Mask Ops — `Add`, `Subtract` and `Intersect`
composite them together, and you carry on painting on the result by hand. Chain
several and each stage stays editable.

---

[← All 😺NKD Basic Tools nodes](../README.md)
