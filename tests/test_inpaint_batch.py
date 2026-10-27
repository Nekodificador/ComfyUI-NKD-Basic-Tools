"""A mask batch with one image: one crop per mask, in order, whatever Separate Regions says.
Run from the pack: python tests/test_inpaint_batch.py (needs ComfyUI two folders up)."""
import os
import sys
import types

import torch

_PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(_PACK)))
_pkg = types.ModuleType("nkdbt")
_pkg.__path__ = [_PACK]
sys.modules["nkdbt"] = _pkg
from nkdbt.nkd_crop_stitch import NKDInpaintCrop  # noqa: E402


def crops(image, mask, separate):
    out = NKDInpaintCrop.execute(image, mask, False, True, 0, 0, 1.0, 10, "Automatic", 1.0, 1024, 64, 2048,
                                 separate_regions=separate, region_min_area=5.0, max_regions=1)
    return out.args[1], out.args[2], [d.crop_box for d in out.args[4]]


def demo():
    image = torch.rand(1, 256, 384, 3)
    m = torch.zeros(4, 256, 384)
    m[0, 20:60, 20:60] = 1          # small: under the 5 % min area, kept anyway
    m[1, 100:180, 200:300] = 1
    m[2, 200:240, 30:90] = 1
    # m[3] is empty: no crop
    for separate in (False, True):
        images, masks, boxes = crops(image, m, separate)
        assert len(images) == 3 and all(x.shape[0] == 1 for x in masks), (separate, len(images))   # no cap of 1
        assert boxes[0][0] <= 20 and boxes[1][0] <= 200 <= boxes[1][2] and boxes[2][1] <= 200   # in the given order
    video = torch.rand(4, 256, 384, 3)
    images, masks, boxes = crops(video, m, False)
    assert len(images) == 1 and images[0].shape[0] == 4   # frames keep one crop over all of them
    print("inpaint batch self-check OK:", boxes)


if __name__ == "__main__":
    demo()
