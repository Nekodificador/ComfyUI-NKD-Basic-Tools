# 😺NKD AV Latent

**Use it to** inpaint a video that carries its own soundtrack (MiniMax H3, LTXV)
without wiring the same six nodes every time — and without the sound being
regenerated behind your back.

```
images ─────┐
audio ──────┤
video vae ──┼──▶ 😺NKD AV Latent ──▶ latent ──▶ KSampler
audio vae ──┤
latent mask ┤  (optional)
audio mask ─┘  (optional)
```

It is the whole AV chain in one node: **VAE Encode**, **VAE Encode Audio**, a
**Set Latent Noise Mask** on each and **Concat AV Latent**. Five of those six
never change; the one that does is the audio mask, which has no node of its own —
people put a Solid Mask there and it can only say *keep everything* or *redo
everything*. **Audio** says it properly:

- **keep** — the original sound survives untouched. Usually what you want.
- **regenerate** — all of it is resampled. What a plain video mask gets you today.
- **follow mask** — resampled only over the stretch of time the picture mask is
  on. Each audio token takes the strongest pixel of the video frames it spans, so
  a mask present on a single frame still reaches the sound; the picture side of a
  video latent is coarser than that.

The setting decides in all three cases. **audio mask** doesn't override it — it
only tells *Follow mask* which moments to follow, in place of the picture mask,
and reads nothing but its timing. Feed it at frame rate, not a latent one.

Sound can be masked down to **1/40 s**, so a mask edge lands within 25 ms of
where you put it — fine enough for a word, not for a consonant. Leave **latent
mask** unconnected and the whole picture is generated; feed it the `latent_mask`
output of 😺NKD Mask Ops (with its VAE and model connected) and the edit lands on
the model's own grid instead of being stretched onto it here.

---

[← All 😺NKD Basic Tools nodes](../README.md)
