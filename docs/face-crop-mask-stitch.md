# 😺NKD Face Crop / 😺NKD Face Mask / 😺NKD Face Stitch

**Use it to** hand a face to any model the way models like it: upright, square
and tightly framed — then put the result back at the angle it came from. A head
tilted in the photo comes out level in the crop, so the detailer, the swapper or
the upscaler sees the pose it was trained on instead of a diagonal.

```
Load Image ──▶ 😺NKD Face Crop ──▶ face/mask ──▶ (your sampling pipeline)
                     │                                     │
                     └──── face_data ──▶ 😺NKD Face Stitch ◀── image
                                                 │
                                                 ▼
                                    original photo, face replaced
```

**Face Crop**
- `Size` gives you the exact square your model wants; `Padding` sets how much
  around the face comes with it, and `Offset` slides the frame up or down.
- `Upright` on straightens the head; off keeps the original angle.
- Comes with the face mask already made — no segmentation model, no extra
  download. `Mask Region` picks what it covers: the whole face, the face with
  the eyes and mouth left out, skin only, or just the features. `Forehead`
  decides how far up it reaches, and `Refine Edges` lets the picture itself
  settle the outline so it follows hair and jaw.
- `roll` output tells you how far the head was tilted — useful for skipping the
  frames you would rather not touch.
- Finds the face wherever it is: a head that's a small part of a wide shot works
  the same as a headshot. `Face` picks which one when there is more than one.

**Face Stitch** puts the processed crop back along the same path it left by, so
it lands at the original angle and size with the rest of the picture untouched.
Same finishing controls as Inpaint Stitch: feather, edge hardness, colour match
and an optional seamless pass.

**Face Mask** is the same mask on its own, in the picture's own coordinates —
for when you want to inpaint a face in place without cropping anything.

No extra dependency and nothing to install: it shares the landmark model
😺NKD Face Rig already downloads (~10 MB on its own if you never use the rig),
plus OpenCV's own face detector at 232 KB. Both fetch themselves on first use.

---

[← All 😺NKD Basic Tools nodes](../README.md)
