import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from color_core import ryb


def demo():
    x = np.linspace(0, 360, 721, endpoint=True)

    # forward then inverse is identity (bijective)
    y = ryb.display_to_hue(x)
    back = ryb.hue_to_display(y)
    d = (back - x + 180) % 360 - 180
    assert np.abs(d).max() < 1e-6, np.abs(d).max()

    # monotonic increasing on [0, 360)
    xs = np.linspace(0, 359.9, 4000)
    ys = ryb.display_to_hue(xs)
    assert np.all(np.diff(ys) >= -1e-9), "not monotonic"

    # default anchors: display 0->hue 0 (red), 120->60 (yellow), 240->240 (blue)
    assert abs(ryb.display_to_hue(0.0)) < 1e-6
    assert abs(ryb.display_to_hue(120.0) - 60.0) < 1e-6
    assert abs(ryb.display_to_hue(240.0) - 240.0) < 1e-6

    # custom anchor table still round-trips
    anchors = [(0, 0), (90, 45), (180, 200), (270, 300), (360, 360)]
    y2 = ryb.display_to_hue(x, anchors)
    back2 = ryb.hue_to_display(y2, anchors)
    d2 = (back2 - x + 180) % 360 - 180
    assert np.abs(d2).max() < 1e-6

    print("ryb OK")


if __name__ == "__main__":
    demo()
