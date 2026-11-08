"""Checks for NKD Mask Painter. Plain asserts, no framework.

    python tests/test_mask_painter.py
"""

import os
import sys
import tempfile
import types

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402

import folder_paths  # noqa: E402

_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_PACK]
sys.modules["nkdbt"] = _pkg

from nkdbt import nkd_mask_painter as mp  # noqa: E402

_TMP = tempfile.mkdtemp()
folder_paths.get_input_directory = lambda: os.path.join(_TMP, "input")
folder_paths.get_temp_directory = lambda: os.path.join(_TMP, "temp")
os.makedirs(os.path.join(_TMP, "input"), exist_ok=True)
os.makedirs(os.path.join(_TMP, "temp"), exist_ok=True)

H, W = 8, 10


def _run(layer="", mode="Use as start", mask=None, img=None, change="clear_mask", uid="1"):
    mp.NKDMaskPainter.hidden = types.SimpleNamespace(unique_id=uid)
    img = torch.zeros(1, H, W, 3) if img is None else img
    r = mp.NKDMaskPainter.execute(img, layer, change, mode, mask)
    return r.result[1][0].numpy(), r.ui.as_dict()


def _left():
    m = np.zeros((H, W), np.float32); m[:, :5] = 1
    return m


def _top():
    m = np.zeros((H, W), np.float32); m[:4] = 1
    return m


def test_layer_alpha_is_the_mask():
    name = mp._save_layer(_left())
    out, ui = _run(name, uid="a")
    assert np.allclose(out, _left()) and "nkd_layer" not in ui


def test_set_ops_leave_the_layer_alone():
    name = mp._save_layer(_left())
    up = torch.from_numpy(_top()).unsqueeze(0)
    for mode, ref in (("Add", np.maximum(_left(), _top())),
                      ("Subtract", np.clip(_left() - _top(), 0, 1)),
                      ("Intersect", np.minimum(_left(), _top()))):
        out, ui = _run(name, mode, up, uid="b")
        assert np.allclose(out, ref, atol=1e-2), mode
        assert "nkd_layer" not in ui and "nkd_upstream" in ui, mode


def test_use_as_start_bakes_only_when_empty():
    up = torch.from_numpy(_top()).unsqueeze(0)
    out, ui = _run("", "Use as start", up, uid="c")
    assert np.allclose(out, _top()) and ui["nkd_layer"][0].startswith("nkd_masks/")
    out, ui = _run(mp._save_layer(_left()), "Use as start", up, uid="c")
    assert np.allclose(out, _left()) and "nkd_layer" not in ui


def test_replace_bakes_on_change_only():
    up = torch.from_numpy(_top()).unsqueeze(0)
    out, ui = _run("", "Replace", up, uid="d")
    assert np.allclose(out, _top()) and "nkd_layer" in ui
    out, ui = _run(mp._save_layer(_left()), "Replace", up, uid="d")
    assert np.allclose(out, _left()) and "nkd_layer" not in ui


def test_image_change_clears():
    name = mp._save_layer(_left())
    _run(name, img=torch.zeros(1, H, W, 3), uid="e")
    out, ui = _run(name, img=torch.ones(1, H, W, 3), uid="e")
    assert out.max() == 0 and ui["nkd_layer"] == [""]
    out, ui = _run(name, img=torch.zeros(1, H, W, 3), change="keep_mask", uid="e")
    assert np.allclose(out, _left()) and "nkd_layer" not in ui


def test_legacy_backup_is_migrated():
    d = os.path.join(_TMP, "input", "nkd_masks")
    os.makedirs(d, exist_ok=True)
    Image.fromarray((_left() * 255).astype(np.uint8)).save(os.path.join(d, "9_mask.png"))
    out, ui = _run("$9-3", uid="9")
    assert np.allclose(out, _left())
    assert ui["nkd_layer"][0].startswith("nkd_masks/nkd_mask_")
    out, ui = _run("$5-1", uid="5")
    assert out.max() == 0 and ui["nkd_layer"] == [""]


def test_layer_is_resized_to_the_image():
    name = mp._save_layer(np.ones((4, 5), np.float32))
    out, _ = _run(name, uid="f")
    assert out.shape == (H, W) and out.min() > 0.99


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
