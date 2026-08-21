# 😺NKD AV Latent

For inpainting a video that carries its own soundtrack (MiniMax H3, LTXV) without
wiring the same six nodes every time, and without the sound being regenerated
behind your back.

```
images ─────┐
audio ──────┤
video vae ──┼──▶ 😺NKD AV Latent ──▶ latent ──▶ KSampler
audio vae ──┤
latent mask ┤  (optional)
audio mask ─┘  (optional)
```

It's the whole AV chain in one node: VAE Encode, VAE Encode Audio, a Set Latent
Noise Mask on each, and Concat AV Latent. Five of those six never change. The one
that does is the audio mask, which has no node of its own, so people put a Solid
Mask there and it can only say *keep everything* or *redo everything*. The
**Audio** widget says it properly:

- **keep** leaves the original sound untouched. Usually what you want.
- **regenerate** resamples all of it. That's what a plain video mask gets you
  today.
- **follow mask** resamples only over the stretch of time the picture mask is on.
  Each audio token takes the strongest pixel of the video frames it spans, so a
  mask present on a single frame still reaches the sound, which matters because
  the picture side of a video latent is coarser than that.

That setting decides in all three cases. The `audio mask` input doesn't override
it; it only tells *follow mask* which moments to follow, in place of the picture
mask, and reads nothing but its timing. Feed it at frame rate, not a latent one.

Sound can be masked down to 1/40 s, so a mask edge lands within 25 ms of where
you put it. Fine enough for a word, not for a consonant.

Leave `latent mask` unconnected and the whole picture is generated. Feed it the
`latent_mask` output of [😺NKD Mask Ops](mask-ops.md), with its VAE and model
connected, and the edit lands on the model's own grid instead of being stretched
onto it here.

---

[← All 😺NKD Basic Tools nodes](../README.md)
