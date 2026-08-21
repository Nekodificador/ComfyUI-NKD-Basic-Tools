# 😺NKD Basic Tools

A grab-bag of everyday ComfyUI nodes that remove wiring and busywork: detail an
inpaint at the right resolution, roto a mask by hand with a pen tool, fake a
shallow depth of field or motion blur that curves, transfer skin texture after a
relight, recolor by brightness, make procedural noise or film grain, and turn one
text box into a whole batch of prompts. Each node shows a **live preview in the
node itself**, so you tune it while you look at it — no separate preview node,
and most update without even running the graph.

Every node has its own page below — click the one you need.

---

## Detailing & inpainting

| Node | Use it to |
|---|---|
| [😺NKD Inpaint Crop / Stitch](docs/inpaint-crop-stitch.md) | Fix or add detail in one part of an image without re-rendering the whole thing — crop the masked area at your sampler's ideal resolution, stitch it back at full resolution with no seam. |
| [😺NKD Frequency Separate / Combine](docs/frequency-separate-combine.md) | Split an image into a soft base and a detail layer and recombine — the classic job being restoring skin and fabric texture after a relight. |
| [😺NKD Mask Ops](docs/mask-ops.md) | Get a mask ready to use in one node instead of six — levels, speck removal, holes, expand, feather, blockify, temporal steps — on the GPU, whole batch at once. |
| [😺NKD Mask Ops Lean](docs/mask-ops-lean.md) | The three tweaks a composite actually needs — fill holes, expand/contract, feather — in three widgets, at the same speed. |
| [😺NKD AV Latent](docs/av-latent.md) | Inpaint a video that carries its own soundtrack (MiniMax H3, LTXV) without wiring the same six nodes every time, and without the sound being regenerated behind your back. |
| [😺NKD Audio Mask](docs/audio-mask.md) | Mask the audio branch on its own, fitted to the soundtrack's real timing, when you'd rather keep the chain in the open. |
| [😺NKD MiniMax Guides](docs/minimax-guides.md) | Anchor every guide of a MiniMax H3 shot from one node instead of a row of guide nodes each dragging the same four cables across the canvas. |
| [😺NKD Mask Painter](docs/mask-painter.md) | Paint a mask onto an image your graph just generated — and stack masks from anywhere while keeping the result paintable. |
| [😺NKD Vector Mask](docs/vector-mask.md) | Draw a mask by hand with a pen tool the way you'd roto in Nuke, and keep it editable forever — what's saved is control points, not pixels. |

## Faces

| Node | Use it to |
|---|---|
| [😺NKD Face Rig](docs/face-rig.md) | Pose a portrait's expression by dragging handles on the face itself — brows, eyelids, gaze, mouth, jaw, head — re-rendering live as you drag. |
| [😺NKD Face Crop / Mask / Stitch](docs/face-crop-mask-stitch.md) | Hand a face to any model the way models like it — upright, square, tightly framed — then put the result back at the angle it came from. |

## Blur

| Node | Use it to |
|---|---|
| [😺NKD Path Blur](docs/path-blur.md) | Add directional motion blur that *curves*, instead of the single straight angle a normal motion blur gives you. |
| [😺NKD Field Blur](docs/field-blur.md) | Fake a shallow depth of field without a depth map — drop pins, set how much blur each one wants, everything in between is interpolated. |

## Color & gradients

| Node | Use it to |
|---|---|
| [😺NKD Color Warp](docs/color-warp.md) | Grade by grabbing the colors themselves on a wheel your own image is scattered across — and export the grade as a `.cube` LUT. |
| [😺NKD Gradient Map / Generate](docs/gradient-map-generate.md) | Recolor a photo by brightness (duotone, teal-orange), or build a gradient from scratch as a background, mask or light leak. |

## Textures

| Node | Use it to |
|---|---|
| [😺NKD Film Grain](docs/film-grain.md) | Add believable analog grain, with fresh grain per frame on a video batch so it shimmers like real emulsion. |
| [😺NKD Noise](docs/noise.md) | Generate procedural fractal noise (fBm) for clouds, fog and smoke — as an image *and* a mask, with seamless looping animation. |

## Prompt & text utilities

| Node | Use it to |
|---|---|
| [😺NKD String Split](docs/string-split.md) | Turn one block of text into a batch — a list of prompts becomes N generations with no extra wiring. |
| [😺NKD Prompt Variables](docs/prompt-variables.md) | Build a multiprompt with two nodes: drop variable chips into your prompt and feed each one from a socket or a list. |

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
