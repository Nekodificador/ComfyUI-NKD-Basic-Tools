# 😺NKD Face Crop / 😺NKD Face Mask / 😺NKD Face Stitch

Hands a face to any model the way models like it, upright and square and tightly
framed, then puts the result back at the angle it came from. A head tilted in the
photo comes out level in the crop, so the detailer or the swapper or the upscaler
sees the pose it was trained on instead of a diagonal.

```
Load Image ──▶ 😺NKD Face Crop ──▶ face/mask ──▶ (your sampling pipeline)
                     │                                     │
                     └──── face_data ──▶ 😺NKD Face Stitch ◀── image
                                                 │
                                                 ▼
                                    original photo, face replaced
```

## Face Crop

`Size` gives you the exact square your model wants. `Padding` sets how much
around the face comes with it, and `Offset` slides the frame up or down.

`Upright` on straightens the head, off keeps the original angle.

The face mask comes with it, no segmentation model and no extra download.
`Mask Region` picks what it covers: the whole face, the face with the eyes and
mouth left out, skin only, or just the features. `Forehead` decides how far up it
reaches, and `Refine Edges` lets the picture itself settle the outline so it
follows hair and jaw.

The `roll` output tells you how far the head was tilted, which is handy for
skipping the frames you'd rather not touch.

It finds the face wherever it is: a head that's a small part of a wide shot works
the same as a headshot. `Face` picks which one when there's more than one.

## Face Stitch

Puts the processed crop back along the same path it left by, so it lands at the
original angle and size with the rest of the picture untouched. Same finishing
controls as [Inpaint Stitch](inpaint-crop-stitch.md): feather, edge hardness,
colour match and an optional seamless pass.

## Face Mask

The same mask on its own, in the picture's own coordinates, for when you want to
inpaint a face in place without cropping anything.

There's nothing to install: it shares the landmark model
[😺NKD Face Rig](face-rig.md) already downloads (~10 MB on its own if you never
use the rig), plus OpenCV's own face detector at 232 KB. Both fetch themselves on
first use.

---

[← All 😺NKD Basic Tools nodes](../README.md)
