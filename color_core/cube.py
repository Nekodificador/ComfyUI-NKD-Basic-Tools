"""Read/write .cube 3D LUTs. LUT arrays are (N,N,N,3) indexed [r,g,b]."""
import numpy as np


def write(path, lut, title="NKD Color Warp"):
    lut = np.asarray(lut, dtype=np.float64)
    N = lut.shape[0]
    lines = [f'TITLE "{title}"', f"LUT_3D_SIZE {N}", "DOMAIN_MIN 0.0 0.0 0.0",
             "DOMAIN_MAX 1.0 1.0 1.0", ""]
    # red fastest: iterate b (outer), g (mid), r (inner)
    for bi in range(N):
        for gi in range(N):
            for ri in range(N):
                r, g, b = lut[ri, gi, bi]
                lines.append(f"{r:.6f} {g:.6f} {b:.6f}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def read(path):
    vals = []
    N = None
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or s.startswith("TITLE") or s.startswith("DOMAIN"):
                continue
            if s.startswith("LUT_3D_SIZE"):
                N = int(s.split()[1])
                continue
            parts = s.split()
            if len(parts) == 3:
                vals.append([float(x) for x in parts])
    arr = np.array(vals, dtype=np.float64)  # order: red fastest
    lut = np.empty((N, N, N, 3), dtype=np.float64)
    k = 0
    for bi in range(N):
        for gi in range(N):
            for ri in range(N):
                lut[ri, gi, bi] = arr[k]
                k += 1
    return lut
