"""Paths that come from a request or a widget stay inside their base folder."""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _safe_join, _safe_name


def test_safe_join_stays_inside():
    with tempfile.TemporaryDirectory() as td:
        inside = _safe_join(td, "sub", "a.png")
        assert inside and inside.startswith(os.path.realpath(td))
        assert _safe_join(td, "..", "x") is None
        assert _safe_join(td, "sub/../../x") is None
        assert _safe_join(td, os.path.abspath(os.sep)) is None
        assert _safe_join(td, "", "a.png") == os.path.join(os.path.realpath(td), "a.png")


def test_safe_name_is_a_bare_file_name():
    assert _safe_name("../../etc/passwd", "d") == "passwd"
    assert _safe_name("my lut (v2)", "d") == "my_lut_v2"
    assert _safe_name("..", "d") == "d"
    assert _safe_name("", "d") == "d"


if __name__ == "__main__":
    test_safe_join_stays_inside(); test_safe_name_is_a_bare_file_name(); print("ok")
