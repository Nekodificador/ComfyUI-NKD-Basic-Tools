# 😺NKD Basic Tools

A grab-bag of everyday ComfyUI nodes that take the wiring and the busywork out of
the way: detail an inpaint at the right resolution, roto a mask by hand with a
pen tool, fake a shallow depth of field or a motion blur that curves, put skin
texture back after a relight, recolor by brightness, make procedural noise or
film grain, turn one text box into a whole batch of prompts.

Most of them preview inside the node, so you tune while you look, and most of
those update without running the graph at all.

Each node has its own page. Pick the one you need.

---

## Detailing & inpainting

| Node | What it does |
|---|---|
| [😺NKD Inpaint Crop / Stitch](docs/inpaint-crop-stitch.md) | Fixes one part of an image without re-rendering the rest. Crops the masked area at your sampler's resolution and puts it back at full size, no seam. |
| [😺NKD Frequency Separate / Combine](docs/frequency-separate-combine.md) | Splits an image into a soft base and a detail layer. The usual job is putting skin and fabric texture back after a relight. |
| [😺NKD Mask Ops](docs/mask-ops.md) | A whole mask pipeline in one node: levels, specks, holes, expand, feather, blockify, temporal steps. Whole batch, one trip to the GPU. |
| [😺NKD Mask Ops Lean](docs/mask-ops-lean.md) | The three a composite actually needs, fill holes, expand/contract and feather, at the same speed. |
| [😺NKD AV Latent](docs/av-latent.md) | Inpaints a video that carries its own soundtrack (MiniMax H3, LTXV) without the sound being regenerated behind your back. |
| [😺NKD Audio Mask](docs/audio-mask.md) | Masks the audio branch on its own, fitted to the soundtrack's real timing. |
| [😺NKD MiniMax Guides](docs/minimax-guides.md) | Every guide of a MiniMax H3 shot from one node, instead of a row of them each dragging the same four cables across the canvas. |
| [😺NKD Mask Painter](docs/mask-painter.md) | Paints a mask onto an image your graph just made, and stacks masks from anywhere while the result stays paintable. |
| [😺NKD Vector Mask](docs/vector-mask.md) | Roto by hand with a pen tool. What gets saved is control points, so it's still editable next week. |

## Faces

| Node | What it does |
|---|---|
| [😺NKD Face Rig](docs/face-rig.md) | Poses an expression by dragging handles on the face itself: brows, eyelids, gaze, mouth, jaw, head. Re-renders as you drag. |
| [😺NKD Face Crop / Mask / Stitch](docs/face-crop-mask-stitch.md) | Hands a face to a model upright, square and tightly framed, then puts the result back at the angle it came from. |

## Blur

| Node | What it does |
|---|---|
| [😺NKD Path Blur](docs/path-blur.md) | Motion blur that curves, instead of the one straight angle a normal motion blur gives you. |
| [😺NKD Field Blur](docs/field-blur.md) | A shallow depth of field without a depth map. Drop pins, set how much blur each wants, the rest is interpolated. |

## Color & gradients

| Node | What it does |
|---|---|
| [😺NKD Color Warp](docs/color-warp.md) | Grades by grabbing the colors themselves, on a wheel your own image is scattered across. Exports the grade as a `.cube` LUT. |
| [😺NKD Gradient Map / Generate](docs/gradient-map-generate.md) | Recolors a photo by brightness, or builds a gradient from scratch as a background, a mask or a light leak. |

## Textures

| Node | What it does |
|---|---|
| [😺NKD Film Grain](docs/film-grain.md) | Analog grain that holds up. Fresh grain per frame on a video batch, so it shimmers instead of sitting frozen on top. |
| [😺NKD Noise](docs/noise.md) | Fractal noise (fBm) for clouds, fog and smoke, as an image and a mask, with seamless looping animation. |

## Prompt & text utilities

| Node | What it does |
|---|---|
| [😺NKD String Split](docs/string-split.md) | Turns one block of text into a batch. A list of prompts becomes N generations with no extra wiring. |
| [😺NKD Prompt Variables](docs/prompt-variables.md) | Drop variable chips into your prompt and feed each one from a socket or a list. |

---

## Credits

Work by other people this builds on:

- [MaskVidExperiments](https://github.com/drozbay/MaskVidExperiments) — its
  `Mask To Latent Space` node is where the idea of handing the sampler a mask
  already in latent space comes from, and the conversation around it is what
  turned up both the frame-grouping and the token-grid behaviour that 😺NKD Mask
  Ops now handles.
- [differential-diffusion](https://github.com/exx8/differential-diffusion) — the
  soft-mask denoise schedule 😺NKD Inpaint Crop applies inline, same behavior as
  core's DifferentialDiffusion node.

## License

MIT
