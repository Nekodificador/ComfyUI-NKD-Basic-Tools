# 😺NKD Color Warp

Grading by grabbing the colors themselves. Open the editor from the node and you
get a color wheel with a web of handles over it: drag the one sitting on your
skin tones and the skin moves, drag the rim of the blue spoke and every blue in
the shot follows. The neighbours give way smoothly, so you can push one color
without tearing a hole next to it.

Your image is on the wheel. Run the node once and the editor scatters the frame's
own pixels across it, so you can see where your image actually lives before
touching anything. The preview updates live as you drag, full frame, not a
thumbnail.

Hold `Alt` and the image shows you exactly which pixels a handle owns, so there's
no guessing about what a move is going to hit.

`Pin` moves a single handle on its own; without it the whole spoke follows.
Double-click resets a handle and `Reset all` starts over. Drag the centre for a
global cast and the whole web stretches with it.

There are three wheels. `RYB` puts complementaries opposite each other the way a
painter expects, `RGB` matches what other tools show, and `OKLCh` is the raw
perceptual layout. Same edit underneath, so pick the one you think in.

Three radial scales, too: `Neutrals` magnifies the near-grey band so you can
actually grab a subtle cast, `Linear` keeps distance honest, `Sqrt` spreads
everything.

Add or remove spokes and rings for finer control, and turn on the `3D` scope, the
`Luma` strip or `Trails` when you want to see what the grade is doing.

Hue shifts don't drag brightness along with them, and colors pushed past what the
screen can show are brought back in gracefully instead of clipping to a flat
patch.

Turn on `save_lut` and the grade is also written to the output folder as a
`.cube` you can load in Resolve, Premiere or anywhere else. The whole grade is a
single lookup, so a 200-frame batch is graded identically frame to frame.

---

[← All 😺NKD Basic Tools nodes](../README.md)
