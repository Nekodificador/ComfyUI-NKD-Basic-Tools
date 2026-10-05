# 😺NKD Curves

Tone curves like Photoshop's: brightness, contrast and color balance in one
editor, with the graded image previewed live above it as you drag.

- `RGB` is the master curve; `R`, `G` and `B` bend one channel each. The channel
  curves apply first and the master on top, same order as Photoshop.
- The points pull the curve like magnets (a B-spline, as in NKD Sigmas Curve)
  instead of forcing it through them, so it never bellies out between points.
  The end points are the exception: the curve starts and ends on them, so
  dragging them sets the black and white points.
- Click to add a point, drag to move it (hold Shift for fine moves), right-click
  or drag it out of the graph to delete it. Double-click a point to turn it into
  a sharp corner (it shows as a square) and again to smooth it back. `Reset` clears the current channel,
  `All` clears them all.
- The histogram of the input sits behind the curve, and edited channel curves
  stay visible, faint, while you work on another.
- The optional `mask` limits where the grade lands. A mask painted on the Load
  Image shows in the preview right away; a mask from any other node shows after
  you run the node once (the editor says so until then).
- The play button loads the preview even when the image comes through a resize
  or a subgraph.
