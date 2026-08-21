# 😺NKD AV Latent Extend

Continues a MiniMax H3 clip into a new one, sound included. The tail of the
segment you already sampled is planted at the head of a fresh empty latent and
masked as "keep", so the sampler doesn't start a new shot: it carries on the
motion and the sound that were already there. Chain it once per stage to build a
long take out of short ones.

```
(previous stage) KSampler ──▶ previous  ─┐
                                         ├─▶ 😺NKD AV Latent Extend ──▶ latent ──▶ KSampler
MiniMax H3 Reference To Video ──▶ new ───┘        │        │
                                                  │        └─ trim_seconds  ──▶ Trim Audio Duration
                                                  └─ overlap_frames ─▶ Image Batch Extend With Overlap
```

- `previous` is the previous stage's KSampler output, **before decoding**. It
  needs the latent, not the pixels.
- `new (empty)` is the empty AV latent of the next segment, straight from MiniMax
  H3 Reference To Video. Its length is what gets rendered, and the overlap eats
  its first chunks.
- `Overlap Chunks` (default 2) is how much of the previous clip the model sees to
  continue from. One chunk is 5 frames and each extra one adds 17, so 2 chunks is
  22 frames, about 0.9 s. More overlap buys smoother continuity and costs new
  footage per stage.

Three outputs, and the last two exist because the overlap has to come back off
after decoding:

- `latent` goes to the KSampler.
- `overlap_frames` feeds **Image Batch Extend With Overlap** (`side=source`,
  `mode=cut`) to drop the regenerated head from the picture.
- `trim_seconds` feeds **Trim Audio Duration**'s `start_index`. It is the same
  overlap measured on the audio latent grid (1/40 s). Cutting the sound at the
  video frame time instead drifts a few milliseconds every stage, and those add
  up over a long chain.

The seam is hard on purpose. Nothing is blended or faded: the planted tail is
pinned at "keep" and the model does the mixing itself over the following frames,
which is what makes the continuation move like the clip it came from rather than
dissolve into it. The overlap is regenerated context, so it is thrown away in
pixel space afterwards, and only what comes after it survives.

It refuses rather than guesses: a `previous` and a `new` latent of different
sizes, a previous clip shorter than the overlap you asked for, or a new latent no
longer than the overlap all stop with a message saying which.

---

[← All 😺NKD Basic Tools nodes](../README.md)
