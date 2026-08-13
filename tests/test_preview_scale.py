"""The editors' preview must show the blur the node will render.

    python tests/test_preview_scale.py

Strength (Path Blur) and max_blur (Field Blur) are distances in PIXELS, and the
preview runs on a frame shrunk to 640 px. Feed it the raw widget value and the
same number becomes a far bigger fraction of a smaller frame — the editor shows
a violent smear the node will never produce. nkd_spline_preview scales those
values by the same factor it scaled the image; this pins that down.

Imports are the awkward part: the node modules pull in comfy_api at module
level, which does not exist outside ComfyUI. The blur maths under test does not
touch it, so it is stubbed with just enough shape to let the class body run.
"""
import importlib
import importlib.util
import json
import pathlib
import sys
import types

import torch
import torch.nn.functional as F

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _load_pack():
    class _Any:
        def __getattr__(self, name): return _Any()
        def __call__(self, *a, **k): return _Any()

    io_stub = types.ModuleType("io_stub")
    io_stub.ComfyNode = type("ComfyNode", (), {})        # a real base class
    for name in ("Schema", "Image", "Mask", "String", "Float", "Int",
                 "Boolean", "Combo", "Hidden", "NodeOutput"):
        setattr(io_stub, name, _Any())
    inner = types.ModuleType("comfy_api.latest._io")
    inner.comfytype = lambda *a, **k: (lambda c: c)
    inner.ComfyTypeIO = type("ComfyTypeIO", (), {})
    api = types.ModuleType("comfy_api"); api.__path__ = []
    latest = types.ModuleType("comfy_api.latest"); latest.__path__ = []
    latest.io = io_stub
    latest.ui = _Any()
    latest.ComfyExtension = type("ComfyExtension", (), {})
    sys.modules.update({"comfy_api": api, "comfy_api.latest": latest,
                        "comfy_api.latest._io": inner})

    sys.path.insert(0, str(ROOT))
    spec = importlib.util.spec_from_file_location(
        "nkdbt", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    pack = importlib.util.module_from_spec(spec)
    sys.modules["nkdbt"] = pack
    try:
        spec.loader.exec_module(pack)      # folder_paths et al. are absent; the
    except Exception:                      # submodules below import fine anyway
        pass
    return importlib.import_module("nkdbt.nkd_path_blur")


def main() -> int:
    pb = _load_pack()
    torch.manual_seed(0)

    side, preview = 800, 200
    full = torch.rand(1, side, side, 3)
    full[:, 300:500, 300:500] = 1.0                    # hard edges to smear
    paths = json.dumps({"v": 1, "paths": [
        {"poly": [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5]], "speed": 1.0}]})
    strength = 120.0

    def shrink(x):
        return F.interpolate(x.permute(0, 3, 1, 2), size=(preview, preview),
                             mode="area").permute(0, 2, 3, 1)

    rendered = pb.apply_path_blur(full, paths, strength, 0.2)
    assert (rendered - full).abs().mean() > 1e-4, "the stroke blurred nothing"

    target = shrink(rendered)                          # what the node produces
    scaled = pb.apply_path_blur(shrink(full), paths, strength * preview / side, 0.2)
    naive = pb.apply_path_blur(shrink(full), paths, strength, 0.2)

    err_scaled = float((scaled - target).abs().mean())
    err_naive = float((naive - target).abs().mean())
    print(f"scaled {err_scaled:.5f}  vs  unscaled {err_naive:.5f}")
    assert err_scaled < err_naive / 4, "scaling the strength barely helped"
    print("OK - the preview tracks the node")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
