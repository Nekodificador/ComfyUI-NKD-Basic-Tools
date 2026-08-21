# 😺NKD Frequency Separate / 😺NKD Frequency Combine

**Use it to** retouch like a pro: split an image into a soft **base** (low
frequency) and a **detail** layer (high frequency), then recombine. The classic
job is restoring texture after a relight — take the pores/fabric detail from the
original and the lighting from the relit result, and get the relit image back
with all its micro-detail intact.

<img width="1604" height="1106" alt="image" src="https://github.com/user-attachments/assets/2545613e-cb73-4b32-aac3-2ddc8fd9588b" />


```
original ─▶ 😺NKD Frequency Separate ─┬─ high_frequency ─▶ 😺NKD Frequency Combine ─▶ result
                                      └─ (its detail)         ▲
                             relit image ───────────────── low_frequency
```

- **Four ways to build the base:** `Gaussian` (fast, classic), `Guided`
  (edge-safe, no halo), `Rolling Guidance` (erases texture by size but keeps
  shapes), `Median` (spot blemishes). `Radius` sets the detail scale.
- **`Divide` vs `Subtract`** detail mode — Divide (a ratio) is lighting-invariant,
  which is what makes detail transfer between differently-lit images clean.
- **`Luminance` detail** keeps texture achromatic, so recombining never shifts
  color; `RGB` carries chromatic detail too.
- Processes in **linear light** for correct results (toggle off for classic
  gamma). `mode` and `linear` must match between the two nodes.
- Live in-node preview with a **wipe slider** (high frequency ◄ | ► low
  frequency) so you can see exactly what each layer holds. Run its blue play
  button to preview even when the source arrives through a resize or subgraph.
- The preview's **`1:1` button** crops the visible area at native resolution and
  drag-pans it — the only honest way to judge the detail layer, since a fitted
  view destroys the very high frequency you're looking at. The fitted view
  scales `radius` to its own downscale and shows the effective value in the hint
  (`r8 → r2 @ 31%`), so it never lies about the frequency you're getting.
- Optional `mask` output confines the detail to a region (e.g. skin only).

---

[← All 😺NKD Basic Tools nodes](../README.md)
