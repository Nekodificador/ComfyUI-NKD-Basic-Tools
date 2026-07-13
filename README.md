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

- `mask_expand` / `mask_blur` — grow and feather the mask before cropping; the
  same softness drives the composite on Stitch.
- `padding` — context around the mask included in the crop.
- `megapixels` — resolution budget for the sampled region (1.0 = 1024×1024).
- Crop dimensions are aligned to the VAE grid and the crop/render aspect ratios
  are matched exactly, so the restore is a single symmetric scale — no drift,
  no sub-pixel bevel on the composite.

## License

MIT
