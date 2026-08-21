# 😺NKD Mask Ops

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

- **`latent_mask` output** — with a VAE connected, the same mask already reduced
  to latent resolution. **Use this one for Set Latent Noise Mask on video.** A
  mask still in pixels gets resampled on the way in, spread evenly across the
  frames — and a video VAE does not group them evenly. On a MiniMax H3 grid that
  resample makes the mask of the leading one-frame latent vanish outright and
  lands the next one a frame early. Reduced here, on the VAE's real grouping, it
  arrives exactly as you built it.
- **Connect your `model` too** and Blockify covers whatever the model actually
  acts on. Most models never see the mask — the sampler blends it per latent, so
  the latent is the unit. A few (MiniMax H3) take it into their own forward and
  regenerate a whole token the moment any part of it is covered, and there the
  block has to be a token wide. The node asks the model instead of assuming, so
  it changes nothing for the models where it shouldn't.

Steps run in a fixed order — clean, stabilize, shape, soften — so a feathered
edge is never re-hardened by a later step. The node previews the result in
itself, subsampled for long clips.

---

[← All 😺NKD Basic Tools nodes](../README.md)
