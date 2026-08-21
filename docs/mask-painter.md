# 😺NKD Mask Painter

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
- **This is the node for stacking masks.** Anything with a `MASK` output feeds
  it — 😺NKD Vector Mask included — and the set operations composite them while
  the result stays paintable. See [Vector Mask or Mask Painter?](vector-mask.md#vector-mask-or-mask-painter)

> Moved here from 😺NKD Preview Tools, which is now about viewing. Same node,
> same saved workflows, same painted masks — nothing to redo.

---

[← All 😺NKD Basic Tools nodes](../README.md)
