"""Self-check for the prompt variable resolver. Pure python:
python tests/test_prompt_variables.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _apply_variables


def demo():
    # Basic substitution
    out = _apply_variables("a photo of {variable_0} in {variable_1}",
                           {"variable_0": "a red fox", "variable_1": "the snow"})
    assert out == "a photo of a red fox in the snow"

    # Unconnected variable → empty, leftover double spaces collapsed
    out = _apply_variables("a photo of {variable_0} outside",
                           {"variable_0": None})
    assert out == "a photo of outside"

    # Same variable used twice
    out = _apply_variables("{variable_0}, then {variable_0} again",
                           {"variable_0": "twice"})
    assert out == "twice, then twice again"

    # Unknown tokens survive untouched (no variables dict entry)
    out = _apply_variables("keep {not_a_var} as is", {"variable_0": "x"})
    assert out == "keep {not_a_var} as is"

    # Newlines preserved; edges trimmed
    out = _apply_variables("  {variable_0}\nline two  ", {"variable_0": "line one"})
    assert out == "line one\nline two"

    print("prompt variables self-check OK")


if __name__ == "__main__":
    demo()
