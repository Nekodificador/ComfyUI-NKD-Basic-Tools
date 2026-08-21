# 😺NKD Inpaint Crop / 😺NKD Inpaint Stitch

Fixes or adds detail in one part of an image without re-rendering the rest of it.
Crop cuts out the masked area with some padding and hands it to your sampler at
the resolution the model likes; Stitch puts the result back at full resolution,
with no seam showing.

https://github.com/user-attachments/assets/84e20b72-be4d-4dd6-84d7-69ae7f889dd7

```
Load Image ─┬─▶ 😺NKD Inpaint Crop ─▶ image/mask/latent ─▶ (your sampling pipeline)
   Mask ────┘         │                                          │
                      └──── crop_data ──▶ 😺NKD Inpaint Stitch ◀── image
                                                   │
                                                   ▼
                                          full-resolution result
```

## Crop

- Mask cleanup is built in, so invert, fill holes, expand and soften all happen
  here rather than in four nodes before it.
- `Resize Mode` decides the crop size. `Automatic` keeps the native resolution
  and only rescales when the crop falls outside the min/max limits, `Megapixels`
  gives it a fixed budget, `Longest Side` an exact size.
- Connect `model` and `vae`, both optional, and Crop hands back a prepared model
  and a latent that's ready to sample, so nothing sits between it and your
  sampler.
- The node previews the mask and the crop region on itself, and its blue play
  button runs just that branch, so you can frame the crop without running the
  whole graph.

**Chained detailing.** Turn on `Separate Regions` and every separate blob of the
mask gets its own crop at its own resolution. Your sampler runs once per region
with no extra wiring, and Stitch composites them all back in one pass. It also
takes mask batches from segmentation nodes, one region per mask. You can filter
by minimum area, cap the count and choose the order.

## Stitch

- `Feather` and `Edge Hardness` control how softly the patch blends and how well
  the original background is kept from ghosting at the edges.
- `Match Colors` corrects the slight color and brightness drift models introduce,
  so the patch belongs to the same scene.
- `Seamless Edges` is an extra pass for stubborn seams. It needs OpenCV.

---

[← All 😺NKD Basic Tools nodes](../README.md)
