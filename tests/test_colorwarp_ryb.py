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

    # monotonic increasing on [0, 360) (modulo the single 360-wrap of the table)
    xs = np.linspace(0, 359.9, 4000)
    ys = np.unwrap(ryb.display_to_hue(xs), period=360.0)
    assert np.all(np.diff(ys) >= -1e-9), "not monotonic"

    # default (RYB) anchors land on measured OKLCh hues of the anchor colors:
    # display 0 -> sRGB red, 120 -> yellow, 240 -> blue.
    from color_core import oklab
    for disp, rgb in [(0.0, (1, 0, 0)), (120.0, (1, 1, 0)), (240.0, (0, 0, 1))]:
        want = oklab.oklab_to_oklch(oklab.srgb_to_oklab(np.array(rgb, float)))[2]
        assert abs(ryb.display_to_hue(disp) - want) < 1e-3, (disp, want)

    # RGB wheel mode: display 120 -> sRGB green, 240 -> blue.
    for disp, rgb in [(0.0, (1, 0, 0)), (120.0, (0, 1, 0)), (240.0, (0, 0, 1))]:
        want = oklab.oklab_to_oklch(oklab.srgb_to_oklab(np.array(rgb, float)))[2]
        got = ryb.display_to_hue(disp, ryb.RGB_ANCHORS)
        assert abs(got - want) < 1e-3, (disp, got, want)

    # every mode round-trips (wrap window not starting at 0)
    for table in (ryb.RYB_ANCHORS, ryb.RGB_ANCHORS, ryb.OKLCH_ANCHORS):
        yy = ryb.display_to_hue(x, table)
        bb = ryb.hue_to_display(yy, table)
        dd = (bb - x + 180) % 360 - 180
        assert np.abs(dd).max() < 1e-6, np.abs(dd).max()

    # custom anchor table still round-trips
    anchors = [(0, 0), (90, 45), (180, 200), (270, 300), (360, 360)]
    y2 = ryb.display_to_hue(x, anchors)
    back2 = ryb.hue_to_display(y2, anchors)
    d2 = (back2 - x + 180) % 360 - 180
    assert np.abs(d2).max() < 1e-6

    print("ryb OK")


if __name__ == "__main__":
    demo()
