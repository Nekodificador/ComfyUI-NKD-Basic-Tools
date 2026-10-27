# 😺NKD Loader

One node that stands in for a set of loader nodes: a diffusion model, its text
encoders, the VAE, an upscaler, adapters. Save the set once, then switch model
families from a single dropdown instead of rewiring four loaders.

## Saving a preset

Select the loader nodes on the canvas, right-click and choose **Save as NKD Loader
preset**, then give it a name. Any loader works, from any pack. The loaders can
feed each other, but nothing in the selection may take an input from a node
outside it.

## Using it

Add 😺NKD Loader and pick a preset. Its outputs appear typed and named after the
loaders: model, clip and vae first, the rest in canvas order.

- Switching to another preset keeps your cables wherever an output keeps its
  type, so going from one model family to another leaves `MODEL`, `CLIP` and
  `VAE` wired.
- The workflow carries the preset itself, not just its name, so it runs on a
  machine that doesn't have the preset. If a loader node isn't installed there,
  the node says which one.
- Each loader in the preset still loads and caches its models as it always does.

## Editing a preset

Right-click the node and choose **Unpack NKD Loader**: the real loader nodes come
back in a group, still wired, so you can change a file or a setting. Right-click
the group and choose **Repack NKD Loader** to save it and fold it back into one
node. The output order and names stay as they were.

Rename, reorder or delete presets under **Settings → NKD Basic Tools → Loader**.
Deleting a preset doesn't break the workflows that use it.

## Outputs

Up to 10 outputs, whatever the preset's loaders produce.

---

[← All 😺NKD Basic Tools nodes](../README.md)
