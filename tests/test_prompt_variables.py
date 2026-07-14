"""Self-check for the prompt variable resolver. Pure python:
python tests/test_prompt_variables.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import _resolve_prompts


def demo():
    # Single values → one prompt
    out = _resolve_prompts("a photo of {variable_0} in {variable_1}",
                           {"variable_0": ["a red fox"], "variable_1": ["the snow"]})
    assert out == ["a photo of a red fox in the snow"]

    # Unconnected variable → empty, extra spaces collapsed
    out = _resolve_prompts("a photo of {variable_0} outside", {"variable_0": None})
    assert out == ["a photo of outside"]

    # Chip insertion leaves "{var} ," → space before punctuation cleaned
    out = _resolve_prompts("a portrait of {variable_0} , cinematic",
                           {"variable_0": ["a fox"]})
    assert out == ["a portrait of a fox, cinematic"]

    # List mapping: one prompt per item; a shorter PLAIN list HOLDS its last
    # item once it runs out (i=2 has no 3rd color → keeps "blue").
    out = _resolve_prompts("{variable_0} wearing {variable_1}",
                           {"variable_0": ["a man", "a woman", "a kid"],
                            "variable_1": ["red", "blue"]})
    assert len(out) == 3
    assert out[0] == "a man wearing red"
    assert out[1] == "a woman wearing blue"
    assert out[2] == "a kid wearing blue"  # plain: holds the last item

    # cycle {name:c}: the short list WRAPS back to the first instead of holding
    out = _resolve_prompts("{variable_0} wearing {variable_1:c}",
                           {"variable_0": ["a man", "a woman", "a kid"],
                            "variable_1": ["red", "blue"]})
    assert out[2] == "a kid wearing red"  # cycle: 2 % 2 == 0 → "red"

    # {name:r} → random pick, seeded and reproducible; mapped var drives count
    vars_ = {"variable_0": ["a", "b", "c"], "variable_1": ["x", "y", "z"]}
    r1 = _resolve_prompts("{variable_0} + {variable_1:r}", vars_, seed=42)
    r2 = _resolve_prompts("{variable_0} + {variable_1:r}", vars_, seed=42)
    assert r1 == r2                                   # reproducible
    assert len(r1) == 3                               # count from mapped var
    assert [p.split(" + ")[0] for p in r1] == ["a", "b", "c"]  # mapping intact
    assert all(p.split(" + ")[1] in "xyz" for p in r1)

    # BUG (reported by Neko): the ONLY list-bearing variable gets marked
    # random via shift-click, the other variable is unconnected/single-value.
    # Count must still follow the randomized variable's list, not collapse to 1.
    out = _resolve_prompts("{variable_0:r} wearing {variable_1}",
                           {"variable_0": ["a", "b", "c", "d", "e"], "variable_1": None})
    assert len(out) == 5
    assert all(p.split(" wearing")[0] in "abcde" for p in out)

    # Mixed lengths: count follows the LONGEST list, random var draws from its own
    out = _resolve_prompts("{variable_0} + {variable_1:r}",
                           {"variable_0": ["a", "b", "c", "d", "e"],
                            "variable_1": ["x", "y", "z"]})
    assert len(out) == 5
    assert all(p.split(" + ")[1] in "xyz" for p in out)

    # randomize_all → single prompt, every variable random
    ra = _resolve_prompts("{variable_0} + {variable_1}", vars_,
                          randomize_all=True, seed=7)
    assert len(ra) == 1
    a, b = ra[0].split(" + ")
    assert a in "abc" and b in "xyz"

    # Repeated random variable keeps the same pick within one prompt
    rep = _resolve_prompts("{variable_0:r} and {variable_0:r}",
                           {"variable_0": ["p", "q", "r", "s", "t"]}, seed=3)
    left, right = rep[0].split(" and ")
    assert left == right

    # Different seeds eventually differ
    outs = {_resolve_prompts("{variable_0:r}", {"variable_0": list("abcdefgh")},
                             seed=s)[0] for s in range(10)}
    assert len(outs) > 1

    print("prompt variables self-check OK")


if __name__ == "__main__":
    demo()
