# 😺NKD Mask Ops

Gets a mask ready to use in one node instead of six, and stops mask cleanup from
being the slow part of a video workflow. The whole batch goes to the GPU once and
comes back processed: a full pipeline on 81 frames of 1080p takes about a third
of a second, and expanding a mask is around 50× faster than the node you're
probably using for it.

```
Mask ──▶ 😺NKD Mask Ops ──▶ mask / mask_inverted
```

Everything sits in one panel, and anything left at 0 is skipped.

- **Levels** (`Black Point` / `White Point`) cuts the faint halo a segmentation
  model leaves behind. Set both to the same value for a hard threshold.
- **Remove Specks** drops blobs thinner than the width you give it. What survives
  keeps its exact outline, so fingers, hair and thin details don't get shaved off
  the way a normal cleanup pass shaves them.
- **Fill Holes** and **Close Gaps** give you solid shapes and bridged cracks.
- **Expand / Contract** and **Feather** are one signed value and one softness.
- **Blockify** snaps the mask to a grid of squares so it survives the trip into
  latent space without bleeding into the blocks next door. Connect your `vae` and
  it configures itself: the grid comes from that VAE, and on a video VAE the mask
  is quantized along time too, to the exact frames it collapses into one latent
  (uneven last group included, since that's read from the VAE rather than
  assumed). Without a VAE you set the size yourself. `Block Coverage` at 0 keeps
  each block's average as a gray value instead, for a pixelated look.
- **Expand In Time** is for video: each frame also covers what the mask covered a
  few frames before and after, so a segmentation that lags the motion still
  covers it.
- **Smooth In Time** averages across neighbouring frames so the edge stops
  flickering.

Steps run in a fixed order, clean then stabilize then shape then soften, so a
feathered edge is never re-hardened by a later step. The node previews the result
on itself, subsampled for long clips.

## The latent_mask output

With a VAE connected you get the same mask already reduced to latent resolution.
Use this one for Set Latent Noise Mask on video. A mask still in pixels gets
resampled on the way in, spread evenly across the frames, and a video VAE doesn't
group them evenly: on a MiniMax H3 grid that resample makes the leading one-frame
latent's mask vanish outright, and lands the next one a frame early. Reduced here
on the VAE's real grouping, it arrives exactly as you built it.

Connect your `model` as well and Blockify covers whatever the model actually acts
on. Most models never see the mask, since the sampler blends it per latent, so
the latent is the unit. A few (MiniMax H3) take it into their own forward and
regenerate a whole token the moment any part of it is covered, and there the
block has to be a token wide. The node asks the model instead of assuming, so it
changes nothing for the models where it shouldn't.

---

[← All 😺NKD Basic Tools nodes](../README.md)
