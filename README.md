# 😺NKD Basic Tools

A grab-bag of everyday ComfyUI nodes that remove wiring and busywork: detail an
inpaint at the right resolution, transfer skin texture after a relight, recolor
by brightness, make procedural noise or film grain, and turn one text box into a
whole batch of prompts. Each node shows a **live preview in the node itself**, so
you tune it while you look at it — no separate preview node, and most update
without even running the graph.

---

## Detailing & inpainting

### 😺NKD Inpaint Crop / 😺NKD Inpaint Stitch

**Use it to** fix or add detail in one part of an image without re-rendering (or
degrading) the whole thing. Crop cuts out the masked area with padding, sends it
to your sampler at its ideal resolution, and Stitch drops the result back on the
original **at full resolution** — clean edges, no drift, no visible seam.

https://github.com/user-attachments/assets/84e20b72-be4d-4dd6-84d7-69ae7f889dd7



```
Load Image ─┬─▶ 😺NKD Inpaint Crop ─▶ image/mask/latent ─▶ (your sampling pipeline)
   Mask ────┘         │                                          │
                      └──── crop_data ──▶ 😺NKD Inpaint Stitch ◀── image
                                                   │
                                                   ▼
                                          full-resolution result
```

**Crop**
- Mask cleanup built in: invert, fill holes, expand and soften in one place.
- `Resize Mode` — `Automatic` keeps the native resolution and only rescales when
  the crop is too small/large (min/max limits); `Megapixels` gives a fixed
  budget; `Longest Side` an exact size.
- Wire your `model` and `vae` (optional) and Crop hands back a prepared model and
  a ready-to-sample latent — no glue nodes between it and your sampler.
- In-node preview of the mask and crop region, with partial execution (blue play
  button) so you tune the crop without running the whole graph.

**Chained detailing (`Separate Regions`)** — turn it on and every separate blob
of the mask gets its own crop at its own resolution. Your sampler runs once per
region automatically (no extra wiring) and Stitch composites them all back in one
pass. Also takes mask batches from segmentation nodes (one region per mask).
Filter by minimum area, cap the count, choose the order.

**Stitch**
- `Feather` / `Edge Hardness` — how softly the patch blends and how well it keeps
  the original background from ghosting at the edges.
- `Match Colors` — corrects the subtle color/brightness drift models introduce,
  so the patch belongs to the same scene.
- `Seamless Edges` — extra pass for stubborn seams (needs OpenCV).

### 😺NKD Frequency Separate / 😺NKD Frequency Combine

**Use it to** retouch like a pro: split an image into a soft **base** (low
frequency) and a **detail** layer (high frequency), then recombine. The classic
job is restoring texture after a relight — take the pores/fabric detail from the
original and the lighting from the relit result, and get the relit image back
with all its micro-detail intact.

<img width="1604" height="1106" alt="image" src="https://github.com/user-attachments/assets/2545613e-cb73-4b32-aac3-2ddc8fd9588b" />


```
original ─▶ 😺NKD Frequency Separate ─┬─ high_frequency ─▶ 😺NKD Frequency Combine ─▶ result
                                      └─ (its detail)         ▲
                             relit image ───────────────── low_frequency
```

- **Four ways to build the base:** `Gaussian` (fast, classic), `Guided`
  (edge-safe, no halo), `Rolling Guidance` (erases texture by size but keeps
  shapes), `Median` (spot blemishes). `Radius` sets the detail scale.
- **`Divide` vs `Subtract`** detail mode — Divide (a ratio) is lighting-invariant,
  which is what makes detail transfer between differently-lit images clean.
- **`Luminance` detail** keeps texture achromatic, so recombining never shifts
  color; `RGB` carries chromatic detail too.
- Processes in **linear light** for correct results (toggle off for classic
  gamma). `mode` and `linear` must match between the two nodes.
- Live in-node preview with a **wipe slider** (high frequency ◄ | ► low
  frequency) so you can see exactly what each layer holds. Run its blue play
  button to preview even when the source arrives through a resize or subgraph.
- The preview's **`1:1` button** crops the visible area at native resolution and
  drag-pans it — the only honest way to judge the detail layer, since a fitted
  view destroys the very high frequency you're looking at. The fitted view
  scales `radius` to its own downscale and shows the effective value in the hint
  (`r8 → r2 @ 31%`), so it never lies about the frequency you're getting.
- Optional `mask` output confines the detail to a region (e.g. skin only).

### 😺NKD Mask Ops

**Use it to** get a mask ready to use in one node instead of six — and to stop
mask cleanup from being the slow part of a video workflow. The whole batch goes
to the GPU once and comes back processed: a full pipeline on 81 frames of 1080p
runs in about a third of a second, and expanding a mask is ~50× faster than the
node you're probably using for it.

```
Mask ──▶ 😺NKD Mask Ops ──▶ mask / mask_inverted
```

Everything is in one place, and anything left at 0 is skipped:

- **Levels** (`Black Point` / `White Point`) — cut the faint halo a segmentation
  model leaves behind, or set both to the same value for a hard threshold.
- **Remove Specks** — drops blobs thinner than the given width. What survives
  keeps its **exact** outline, so fingers, hair and thin details aren't shaved
  off the way a normal cleanup pass shaves them.
- **Fill Holes** / **Close Gaps** — solid shapes, bridged cracks.
- **Expand / Contract** and **Feather** — one signed value and one softness.
- **Blockify** — snaps the mask to a grid of squares, so it survives the trip
  into latent space with no bleeding into neighbouring blocks. **Connect your
  `vae` and it configures itself**: the grid comes from that VAE, and on a video
  VAE the mask is also quantized along time, to the exact frames it collapses
  into one latent (uneven last group included — it's read from the VAE, not
  assumed). Without a VAE, set the size yourself. `Block Coverage` at 0 keeps
  each block's average as a gray value, for a pixelated look instead.
- **Expand In Time** — video: each frame also covers what the mask covered a few
  frames before and after, so a segmentation that lags the motion still covers
  it.
- **Smooth In Time** — video: averages across neighbouring frames so the mask
  edge stops flickering.

Steps run in a fixed order — clean, stabilize, shape, soften — so a feathered
edge is never re-hardened by a later step. The node previews the result in
itself, subsampled for long clips.

### 😺NKD Mask Painter

**Use it to** paint a mask onto an image that doesn't exist as a file yet —
anything your graph just generated — without saving it out and loading it back
in. Drop the node anywhere in the chain, hit **Edit**, and you get ComfyUI's own
mask editor on that image. Out come the image, the mask and its inverse.

https://github.com/user-attachments/assets/fea39b77-1e47-4006-ba7f-51197db0f106

- **Your masks survive.** They're mirrored to `input/nkd_masks/`, so a restart or
  a temp cleanup doesn't wipe what you painted. The node turns green when it's
  carrying one.
- **Optional `mask` input** to start from something upstream — a face detector, a
  segmenter, 😺NKD Mask Ops — and refine it by hand. `mask_input_mode` picks how
  the two combine: `Use as start` imports it once and then your edits stick,
  `Replace` overwrites, `Add` / `Subtract` / `Intersect` do the set operations,
  `Disconnected` ignores it. All of them only fire when the upstream mask really
  changes, so re-queueing never disturbs your work.
- **`Clear`** wipes and re-runs so downstream sees it immediately. **`Reseed`**
  re-applies the upstream mask on the next run without losing what you painted —
  the one you want when `Clear` would be too blunt.
- **One mask per node**: drop several on the same image for independent masks.

> Moved here from 😺NKD Preview Tools, which is now about viewing. Same node,
> same saved workflows, same painted masks — nothing to redo.

### 😺NKD Vector Mask

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
- **Live preview**: the editor composites the real matte as you drag — subtract
  shapes actually cutting, feather actually soft. `V` cycles between the image
  with everything outside the mask dimmed, the mask on its own, and the
  untouched image.
- Survives a resolution change: coordinates are relative, and the editor warns
  you if the aspect ratio no longer matches what you drew on.

---

## Blur

> Both blur editors preview the **real** result, not an approximation: the
> geometry goes to the backend and comes back rendered by the same code the
> graph runs, so what you tune is what you get. It refreshes when you finish a
> drag rather than during one. `V` toggles between the result and the original.
> The node has to have run once for there to be a frame to preview.

### 😺NKD Path Blur

**Use it to** add directional motion blur that *curves*, instead of the single
straight angle a normal motion blur gives you. Draw strokes showing which way
things move; the direction between them is blended into a smooth field, and each
stroke carries its own speed.

- Areas far from every stroke stay sharp — **Spread** sets how far the influence
  reaches.
- **No occlusion information exists**, so at the end of a stroke the background
  will smear over whatever is in front of it. That is what the `mask` input is
  for: where it's white the original is kept.
- Very high **Strength** ghosts rather than blurs — the sampling is capped, and
  past that point you see discrete steps instead of a smear.

### 😺NKD Field Blur

**Use it to** fake a shallow depth of field without a depth map. Drop pins, drag
the ring around each one to set how much blur it wants, and everything in between
is interpolated. One pin blurs evenly, two give you a gradient.

- **Live preview.** The blur redraws on the GPU as you drag, with the exact
  backend result taking over the moment you let go. `V` also cycles to the
  **blur field** as a grey map, which is what actually shows you where the
  transition falls.
- **Max Blur** sets what a fully-turned-up pin means in pixels; the pins
  themselves are relative. Both it and Falloff are in the editor too, so you
  tune them against what you're looking at. Each pin shows its radius in pixels
  and draws it at true scale. Hold shift while dragging a ring for fine control.
- **Falloff** is how tightly a pin holds its own area. Raise it and a sharp pin
  on your subject stops being dragged blurry by the ones around it — with it low,
  every pin pulls on the whole frame.
- It's a variable gaussian, not bokeh — no iris shape and no highlight bloom.
- Blur destroys grain, and a plastic-smooth area butted against a grainy sharp
  one is what makes a fake depth of field read as fake. Put it back with
  😺NKD Film Grain after this node, masked so it only lands where you blurred.
- Optional `mask` input protects a subject from the blur.

---

## Color & gradients

### 😺NKD Color Warp

**Use it to** grade by grabbing the colors themselves. Open the editor from the
node and you get a color wheel with a web of handles over it: drag the one
sitting on your skin tones and the skin moves, drag the rim of the blue spoke
and every blue in the shot follows. The neighbours give way smoothly, so you
push one color without tearing a hole next to it.

- **Your image is on the wheel.** Run the node once and the editor scatters the
  frame's own pixels across it, so you can see where your image actually lives
  before touching anything — and the preview updates live as you drag, full
  frame, not a thumbnail.
- **Hold `Alt`** and the image shows you exactly which pixels a handle owns.
  No guessing about what a move is going to hit.
- **`Pin`** moves a single handle on its own; without it the whole spoke follows.
  Double-click resets a handle, `Reset all` starts over.
- **Drag the centre** for a global cast, and the whole web stretches with it.
- **Three wheels** — `RYB` puts complementaries opposite each other the way a
  painter expects, `RGB` matches what other tools show, `OKLCh` is the raw
  perceptual layout. Same edit underneath; pick the one you think in.
- **Three radial scales** — `Neutrals` magnifies the near-grey band so you can
  actually grab a subtle cast, `Linear` keeps distance honest, `Sqrt` spreads
  everything.
- Add or remove spokes and rings for finer control, and turn on the `3D` scope,
  the `Luma` strip or `Trails` when you want to see what the grade is doing.

Hue shifts don't drag brightness along with them, and colors pushed past what
the screen can show are brought back in gracefully instead of clipping to a flat
patch.

Turn on `save_lut` and the grade is also written to the output folder as a
`.cube` you can load in Resolve, Premiere or anywhere else. The whole grade is a
single lookup, so a 200-frame batch is graded identically frame to frame.

### 😺NKD Gradient Map / 😺NKD Gradient Generate

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

## Textures

### 😺NKD Film Grain

**Use it to** add believable analog grain — a Lightroom / Camera-Raw feel —
with `Amount`, `Size` and `Roughness`. Monochrome by default; raise `Color` for
dye-cloud color grain. On a **video batch** each frame gets fresh grain so it
shimmers like real emulsion instead of sitting frozen on top. Optional `mask` to
grain only part of the frame.

https://github.com/user-attachments/assets/250a156d-e95d-499d-8a18-61454e95802f

### 😺NKD Noise

**Use it to** generate procedural fractal noise (fBm) for clouds, fog, smoke and
organic textures — as an image **and** a mask. `Scale`, `Detail`, `Roughness`,
`Lacunarity` and `Distortion` shape it; `Frames` + `Evolution` + `Loop` make a
seamlessly looping animated sequence. Feed the output straight into Gradient Map
to tint it.

<img width="413" height="1053" alt="image" src="https://github.com/user-attachments/assets/33bac00e-28bd-42b0-a453-c2c2bf878024" />


---

## Prompt & text utilities

### 😺NKD String Split

**Use it to** turn one block of text into a batch: split it into a list of
strings and downstream nodes run once per item — a list of prompts becomes N
generations with no extra wiring. Common delimiters plus a custom one, whitespace
trimming, empty-piece skipping, and optional removal of list numbering (`1.`,
`2)`, `-`) for lists an LLM wrote. Shows the resulting list in the node, with
partial execution for instant iteration.

### 😺NKD Prompt Variables

**Use it to** build a multiprompt with two nodes. Write your prompt and drop
**variable chips** into it; each chip is filled by whatever text arrives on its
input socket (sockets grow as you connect, renamed sockets rename their chips,
chips drag around the text). Wire a list — e.g. from 😺NKD String Split — into a
variable and the prompt resolves **once per item**. Shift-click a chip (or
`Randomize All`) to make that variable pick a random item instead, seeded for
reproducibility. Shows the resolved prompt(s) in the node.

https://github.com/user-attachments/assets/ce3f916a-3a41-4848-be44-9636dc7477bb

---

## License

MIT
