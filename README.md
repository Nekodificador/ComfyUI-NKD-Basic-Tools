# 😺NKD Basic Tools

Transversal utility nodes for ComfyUI.

## Nodes

### 😺NKD Inpaint Crop / 😺NKD Inpaint Stitch

Crop the image around a mask (with context padding) and resample the crop to a
megapixel budget for sampling. Stitch composites the processed patch back onto
the original image **at its native resolution**, feathered by the processed mask.

```
Load Image ─┬─▶ 😺NKD Inpaint Crop ─▶ image/mask ─▶ (your sampling pipeline)
   Mask ────┘         │                                      │
                      └──── crop_data ──▶ 😺NKD Inpaint Stitch ◀── image
                                                   │
                                                   ▼
                                          full-resolution result
```

**Crop**

- `invert_mask` / `fill_holes` — mask cleanup before processing.
- `mask_expand` / `mask_blur` — grow and feather the mask before cropping; the
  same softness drives the composite on Stitch.
- `padding` — context around the mask included in the crop.
- `megapixels` — resolution budget for the sampled region (1.0 = 1024×1024).
  `0` = native mode: no resample, pixel-perfect restore.
- Optional `model` / `vae` inputs turn Crop into a full sampler prep: the
  `model` output comes back patched with Differential Diffusion and the
  `latent` output is the encoded crop with its `noise_mask` already set —
  no extra nodes needed between Crop and your sampler.
- Crop dimensions are aligned to the VAE grid and the crop/render aspect ratios
  are matched exactly, so the restore is a single symmetric scale — no drift,
  no sub-pixel bevel on the composite.

**Chained detailing (`separate_regions`)**

Turn on `separate_regions` and the mask is split into individual regions
(connected components — or one region per mask when a mask batch, e.g. from a
segmentation node, is connected). Crop then emits **one crop per region as a
list**: your sampler nodes run once per region automatically (no extra wiring),
and Stitch composites every detailed region back onto the original in a single
pass. `region_min_area`, `max_regions` and `region_order` (largest first /
left-to-right / top-to-bottom) control the chain.

**Stitch**

- `feather` — extra edge feathering on composite.
- `edge_hardness` — black/white point remap on the blend mask; collapses the
  low-alpha fringe where the original background bleeds through as a halo.
- `match_colors` — Reinhard color match (LAB) of the patch toward the original,
  with statistics read from the unchanged background only.
- `seamless_edges` — Poisson blending for stubborn seams (requires OpenCV).

## License

MIT
