# 😺NKD Face Rig

https://github.com/user-attachments/assets/97beddd1-99ca-475d-97b8-e0d2115fef28

Poses a portrait's expression by dragging handles that sit on the face itself:
brows, eyelids, gaze, mouth corners, jaw, head. The result re-renders live while
you drag. It's powered by LivePortrait (vendored, MIT), so it's a facial rig on
the picture instead of a bank of number boxes, and it's byte-exact with the
slider values of classic expression workflows.

The editor lives right in the node. No modal, no extra window. Handles hang off
the detected landmarks and follow the face when it turns.

- **Every side of the face moves on its own**: one raised brow, a wink, a
  one-sided smirk. Each side stays exactly where you left it, to the pixel, and
  there's a mirror toggle for symmetric edits.
- **Head turn/tilt and gaze** get their own corner gizmos, so the face stays
  clear.
- **Ctrl+Z** undoes while the pointer is over the editor, **Shift** is fine
  adjust, **double-click** resets a handle.
- **A MASK output** alongside the image gives you the face region, so you can
  point a face detailer at exactly what was re-rendered.

The face doesn't have to come from a Load Image. Feed it anything, a
[😺NKD Face Crop](face-crop-mask-stitch.md) straightening the head, a VAE Decode,
a subgraph, and press the node's Run button: it computes just that branch and the
rig picks the face up from there.

It runs standalone, no other custom nodes needed. Weights (~600 MB) download
automatically from Hugging Face into `models/liveportrait` on first use. If
`ultralytics` is installed the crop uses the standard YOLOv8 face detector,
otherwise OpenCV's own detector stands in.

---

[← All 😺NKD Basic Tools nodes](../README.md)
