"""Self-check for the text splitter. Pure python:
python tests/test_string_split.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _split_text


def demo():
    # Basic newline split with trim + skip empty
    out = _split_text("a cat\n\n  a dog  \nan owl\n", "\n")
    assert out == ["a cat", "a dog", "an owl"]

    # LLM slash-separated prompt list
    out = _split_text("neon city / rainy street / cyberpunk alley", "/")
    assert out == ["neon city", "rainy street", "cyberpunk alley"]

    # Numbered LLM list → markers stripped, content intact
    text = "1. a red fox\n2) a blue whale\n- a green bird\n* 2 cats playing"
    out = _split_text(text, "\n", remove_numbering=True)
    assert out == ["a red fox", "a blue whale", "a green bird", "2 cats playing"]
    # Digits without punctuation survive
    assert _split_text("2 cats", "\n", remove_numbering=True) == ["2 cats"]

    # No trim / keep empties
    out = _split_text("a,,b", ",", trim=False, skip_empty=False)
    assert out == ["a", "", "b"]

    # Empty delimiter → whole text as one item
    assert _split_text("a/b", "") == ["a/b"]

    # Everything filtered out → empty list (node substitutes [""])
    assert _split_text("  \n \n", "\n") == []

    print("string split self-check OK")


if __name__ == "__main__":
    demo()
