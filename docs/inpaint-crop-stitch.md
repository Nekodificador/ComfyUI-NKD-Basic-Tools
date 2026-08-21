# 😺NKD Inpaint Crop / 😺NKD Inpaint Stitch

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

---

[← All 😺NKD Basic Tools nodes](../README.md)
