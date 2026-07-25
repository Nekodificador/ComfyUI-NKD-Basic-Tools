"""Extract a skin locus from a "skin check" 3D LUT and print it as the TS table
the 3D scope draws (SKIN_LOCUS in src/colorCore.ts).

A skin-check LUT darkens everything EXCEPT skin, so the locus is simply the set
of lattice nodes the LUT leaves alone. We read those inputs, convert to OKLCh,
and report the hue wedge plus the chroma ceiling per lightness slice.

    python tools/extract_skin_locus.py "path/to/Skin Check.3dl"

Paste the printed block over SKIN_LOCUS. Re-run whenever the LUT is re-authored
— the numbers in the source are a snapshot of one specific LUT, not a law.

Note: a LUT that comes out as identity (max deviation ~0) carries no locus. That
is a real thing that happens with broken exports; the script says so instead of
printing a table of noise.
"""
import sys
import numpy as np

# Hue is meaningless on the neutral axis, and near-black is untouched by the
# LUT simply because there is nothing left to darken — both would poison the
# wedge bounds with noise.
MIN_CHROMA = 0.02
MIN_L = 0.22
PASSTHROUGH = 0.02  # |out - in| below this = "the LUT left it alone"
L_STEP = 0.05


def load_3dl(path):
    """Lustre .3dl → (lattice 0..1, out[N,N,N,3] 0..1, N). Blue varies fastest."""
    lattice, rows = None, []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            v = s.split()
            if lattice is None and len(v) > 4:
                lattice = [int(x) for x in v]
                continue
            if len(v) == 3:
                rows.append([int(x) for x in v])
    if lattice is None or not rows:
        raise SystemExit(f"{path}: not a .3dl I can read")
    out = np.array(rows, dtype=float)
    n = len(lattice)
    if len(rows) != n ** 3:
        raise SystemExit(f"{path}: {len(rows)} entries, expected {n ** 3}")
    return np.array(lattice) / lattice[-1], out.reshape(n, n, n, 3) / out.max(), n


def to_oklch(rgb):
    """sRGB → (L, C, hue°). Mirrors color_core/oklab.py, vectorized."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    lum = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return lum, np.hypot(a, bb), np.degrees(np.arctan2(bb, a)) % 360


def main(path):
    lattice, out, n = load_3dl(path)
    grid = np.meshgrid(lattice, lattice, lattice, indexing="ij")
    inp = np.stack(grid, -1)
    dev = np.linalg.norm(out - inp, axis=-1)

    print(f"{path}\n  {n}^3 nodes, mean deviation {dev.mean():.4f}, max {dev.max():.4f}")
    if dev.max() < 0.01:
        raise SystemExit("  this LUT is an IDENTITY — it transforms nothing, so "
                         "there is no locus in it. Check the export.")

    kept = dev < PASSTHROUGH
    lum, chroma, hue = to_oklch(inp[kept])
    ok = (chroma > MIN_CHROMA) & (lum > MIN_L)
    lum, chroma, hue = lum[ok], chroma[ok], hue[ok]
    print(f"  locus: {len(lum)} nodes ({100 * kept.mean():.2f}% of the cube)")

    # p1/p99, not min/max: the raw extremes chase a single cube-corner node.
    hue_lo, hue_hi = np.percentile(hue, 1), np.percentile(hue, 99)
    slope = np.polyfit(lum, hue, 1)[0]
    print(f"  hue wedge {hue_lo:.1f}°..{hue_hi:.1f}°   twist {slope:.1f}°/L "
          f"(corr {np.corrcoef(lum, hue)[0, 1]:.3f})")
    if abs(slope) > 15:
        print("  NOTE: this LUT's wedge twists with lightness; the scope draws a "
              "straight wedge, so the volume will not follow it.")

    rows = []
    for lo in np.arange(0.20, 0.95, L_STEP):
        m = (lum >= lo) & (lum < lo + L_STEP)
        if m.sum() < 5:
            continue
        rows.append((round(float(lo + L_STEP / 2), 3),
                     round(float(np.percentile(chroma[m], 98)), 4)))

    print("\n// regenerate with tools/extract_skin_locus.py")
    print(f"hueLo: {hue_lo:.1f}, hueHi: {hue_hi:.1f},")
    print("envelope: [" + ", ".join(f"[{a}, {b}]" for a, b in rows) + "],")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
