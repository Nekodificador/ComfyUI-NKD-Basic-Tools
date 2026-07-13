# 😺NKD Basic Tools

Transversal utility nodes for ComfyUI.

## Nodes

### 😺NKD Inpaint Crop / 😺NKD Inpaint Stitch

Crop the image around a mask (with context padding), work on it at the ideal
resolution, and composite the result back onto the original image **at its
native resolution** — clean edges, no drift, no visible seams.

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
- `Resize Mode` — `Automatic` keeps the original resolution and only rescales
  when the crop is too small or too big (min/max limits); `Megapixels` gives a
  fixed budget; `Longest Side` an exact size.
- Connect your `model` and `vae` (optional) and the node hands you a prepared
  model and a ready-to-sample latent — no extra nodes between Crop and your
  sampler.
- In-node preview of the mask and crop region, with partial execution support
  (blue play button) for instant iteration on the crop settings.

**Chained detailing (`Separate Regions`)**

Turn on `Separate Regions` and each separate area of the mask gets its own
crop at its own ideal resolution. Your sampler nodes run once per area
automatically — no extra wiring — and Stitch composites every detailed area
back onto the original in a single pass. Also accepts mask batches from
segmentation nodes (one area per mask). Filter by minimum area, cap the count,
and choose the processing order.

**Stitch**

- `Feather` and `Edge Hardness` — control how softly the result blends in and
  keep the original background from ghosting through at the edges.
- `Match Colors` — corrects the subtle color/brightness drift models introduce
  so the composite belongs to the same scene.
- `Seamless Edges` — extra pass for stubborn seams (requires OpenCV).

### 😺NKD String Split

Split one block of text into a list of strings — downstream nodes run once per
item, so a list of prompts becomes N generations with no extra wiring. Common
delimiters plus a custom one, whitespace trimming, empty-piece skipping, and
optional removal of list numbering (`1.`, `2)`, `-`) for lists written by an
LLM. Shows the resulting list in the node, with partial execution support for
instant iteration.

### 😺NKD Prompt Variables

A prompt box with variables, chips included: write your prompt, drop variable
chips into it, and each chip is filled by whatever text arrives on its input
socket (sockets grow as you connect; renamed sockets rename their chips, and
chips can be dragged around the text). Wire a list — e.g. from 😺NKD String
Split — into a variable and the prompt resolves once per item: a full
multiprompt with two nodes. Shift-click a chip (or use `Randomize All`) to make
that variable pick a random item from its list instead, seeded for
reproducibility. Shows the resolved prompt(s) in the node.

## License

MIT
