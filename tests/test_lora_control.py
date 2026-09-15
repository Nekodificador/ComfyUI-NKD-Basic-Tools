"""Self-check for the generic LoRA block engine. No ComfyUI needed:

    python custom_nodes/ComfyUI-NKD-Basic-Tools/tests/test_lora_control.py
"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lora_control_core import (  # noqa: E402
    analyze, block_of, delta_norm, filter_state_dict, parse_blocks, select, split_base,
)


def test_block_of():
    # Every key format seen in the wild maps to the same block names, and the
    # FLUX double/single split falls out of the naming with no special case.
    cases = {
        "lora_unet_double_blocks_3_img_attn_proj": ("double_blocks", 3),
        "diffusion_model.double_blocks.3.img_attn.proj": ("double_blocks", 3),
        "transformer.transformer_blocks.12.attn.to_q": ("transformer_blocks", 12),
        "transformer.single_transformer_blocks.12.attn.to_q": ("single_transformer_blocks", 12),
        "lora_unet_single_blocks_7_linear1": ("single_blocks", 7),
        "lora_unet_blocks_41_self_attn_q": ("blocks", 41),
        "diffusion_model.layers.7.attention.qkv": ("layers", 7),
        "lycoris_layers_5_attention_out": ("layers", 5),
    }
    for key, expected in cases.items():
        assert block_of(key) == expected, f"{key} -> {block_of(key)}, expected {expected}"

    # Numbers that are not block indices must not invent a block.
    for key in ("time_embed.0.linear", "final_layer.adaLN.1", "txt_in.proj"):
        got = block_of(key)
        assert got is None or "block" in got[0] or "layer" in got[0], f"{key} -> {got}"
    assert block_of("time_embed.0.linear") is None


def test_split_base():
    assert split_base("x.lora_down.weight") == ("x", "down")
    assert split_base("x.lora_A.weight") == ("x", "down")
    assert split_base("x.lora_B.weight") == ("x", "up")
    assert split_base("x.alpha") == ("x", "alpha")
    assert split_base("x.bias") is None


def test_delta_norm_is_exact():
    # The Gram trick must equal the honest ||up @ down||_F, and must be strictly
    # below ||up||.||down|| (the bound the upstream node uses) on real factors.
    torch.manual_seed(0)
    up, down = torch.randn(64, 8), torch.randn(8, 32)
    direct = float((up @ down).norm())
    assert abs(delta_norm(up, down) - direct) < 1e-3, (delta_norm(up, down), direct)
    assert direct < float(up.norm()) * float(down.norm())

    # Conv-shaped factors (4D) must flatten, not crash.
    up4, down4 = torch.randn(32, 4, 1, 1), torch.randn(4, 16, 3, 3)
    direct4 = float((up4.reshape(32, 4) @ down4.reshape(4, -1)).norm())
    assert abs(delta_norm(up4, down4) - direct4) < 1e-3


def test_analyze():
    torch.manual_seed(0)
    sd = {}

    def add(base, scale):
        sd[f"{base}.lora_down.weight"] = torch.randn(4, 16) * scale
        sd[f"{base}.lora_up.weight"] = torch.randn(16, 4) * scale
        sd[f"{base}.alpha"] = torch.tensor(4.0)

    add("lora_unet_double_blocks_0_img_attn_proj", 1.0)
    add("lora_unet_double_blocks_0_img_mlp_0", 1.0)   # same block, two layers
    add("lora_unet_double_blocks_1_img_attn_proj", 5.0)  # the loud one
    add("lora_unet_single_blocks_10_linear1", 0.2)    # file order puts 10 before 2
    add("lora_unet_single_blocks_2_linear1", 0.2)
    add("lora_unet_time_in_in_layer", 0.1)            # no block index -> other

    a = analyze(sd)
    assert a["lora_type"] == "LoRA"
    assert a["rank"] == 4
    # Groups in file order (double first), indices numeric — not 0, 10, 2.
    assert a["order"] == ["double_blocks_0", "double_blocks_1",
                          "single_blocks_2", "single_blocks_10", "other"]
    assert a["blocks"]["double_blocks_0"]["layers"] == 2
    assert a["blocks"]["double_blocks_1"]["score"] == 100.0, "loudest block must peak at 100"
    assert a["blocks"]["single_blocks_2"]["score"] < 20.0
    assert abs(sum(b["share"] for b in a["blocks"].values()) - 100.0) < 0.1
    assert a["unmatched_sample"] == ["lora_unet_time_in_in_layer"]

    # alpha/rank must actually scale the result (alpha 4 / rank 4 == 1 here,
    # so halving alpha must halve the norm).
    sd["lora_unet_double_blocks_1_img_attn_proj.alpha"] = torch.tensor(2.0)
    b = analyze(sd)
    before = a["blocks"]["double_blocks_1"]["norm"]
    after = b["blocks"]["double_blocks_1"]["norm"]
    assert abs(after - before / 2) < 1e-3, (before, after)


NAMES = (["double_blocks_0", "double_blocks_1", "double_blocks_2"]
         + [f"single_blocks_{i}" for i in range(12)] + ["other"])


def test_select():
    assert select("*", NAMES) == NAMES
    assert select("double_blocks_1", NAMES) == ["double_blocks_1"]
    assert select("double_blocks_0-1", NAMES) == ["double_blocks_0", "double_blocks_1"]
    assert select("single_blocks_*", NAMES) == [f"single_blocks_{i}" for i in range(12)]
    assert select("single_blocks", NAMES) == [f"single_blocks_{i}" for i in range(12)]
    assert select("other", NAMES) == ["other"]
    # A range must not bleed into the neighbouring group, and 1-9 must not
    # swallow 10/11 by string comparison.
    assert select("single_blocks_1-9", NAMES) == [f"single_blocks_{i}" for i in range(1, 10)]
    assert select("nope_0-3", NAMES) == []


def test_parse_blocks():
    w = parse_blocks("", NAMES)
    assert set(w.values()) == {1.0}, "no rules means every block untouched"

    w = parse_blocks("""
        # comment line
        single_blocks_*: 0.5
        single_blocks_3: off      # later line wins
        double_blocks_0-1: 1.5
        garbage without a colon
        other: nonsense
    """, NAMES)
    assert w["single_blocks_0"] == 0.5
    assert w["single_blocks_3"] == 0.0
    assert w["double_blocks_0"] == w["double_blocks_1"] == 1.5
    assert w["double_blocks_2"] == 1.0
    assert w["other"] == 1.0, "an unparseable value must be ignored, not applied"


def test_filter_state_dict_scales_once():
    # The whole point: halving a block must halve the delta, not cube it.
    torch.manual_seed(0)
    base = "lora_unet_double_blocks_0_img_attn_proj"
    sd = {
        f"{base}.lora_down.weight": torch.randn(4, 16),
        f"{base}.lora_up.weight": torch.randn(16, 4),
        f"{base}.alpha": torch.tensor(4.0),
        "lora_unet_double_blocks_1_img_attn_proj.lora_down.weight": torch.randn(4, 16),
        "lora_unet_double_blocks_1_img_attn_proj.lora_up.weight": torch.randn(16, 4),
    }
    full = analyze(sd)["blocks"]["double_blocks_0"]["norm"]

    names = analyze(sd)["order"]
    half = analyze(filter_state_dict(sd, parse_blocks("double_blocks_0: 0.5", names)))
    assert abs(half["blocks"]["double_blocks_0"]["norm"] - full / 2) < 1e-3, (
        full, half["blocks"]["double_blocks_0"]["norm"])
    assert half["blocks"]["double_blocks_1"]["norm"] > 0, "untouched block survives"

    off = filter_state_dict(sd, parse_blocks("double_blocks_0: off", names))
    assert not any(k.startswith(base) for k in off), "an off block leaves no tensors"
    assert len(off) == 2

    # A half-dropped pair would load as a broken LoRA instead of erroring, so
    # check every surviving base still has both factors.
    for out in (off, filter_state_dict(sd, parse_blocks("*: 0.3", names))):
        bases = {k.rsplit(".lora_", 1)[0] for k in out if ".lora_" in k}
        for b in bases:
            assert f"{b}.lora_up.weight" in out and f"{b}.lora_down.weight" in out, b


def test_strength_folds_in_once():
    # Baking the strength dial must multiply the delta ONCE, combined with the
    # block weight. Applying it as a second pass over the tensors would square it,
    # which is exactly the bug this node exists to avoid.
    torch.manual_seed(0)
    base = "lora_unet_double_blocks_0_img_attn_proj"
    sd = {
        f"{base}.lora_down.weight": torch.randn(4, 16),
        f"{base}.lora_up.weight": torch.randn(16, 4),
        "lora_unet_double_blocks_1_img_attn_proj.lora_down.weight": torch.randn(4, 16),
        "lora_unet_double_blocks_1_img_attn_proj.lora_up.weight": torch.randn(16, 4),
    }
    names = analyze(sd)["order"]
    full = analyze(sd)["blocks"]

    for block_w, strength in ((1.0, 0.5), (0.5, 0.5), (0.25, 2.0), (1.0, -1.0)):
        weights = parse_blocks(f"double_blocks_0: {block_w}", names)
        weights = {b: w * strength for b, w in weights.items()}
        got = analyze(filter_state_dict(sd, weights))["blocks"]
        want = abs(block_w * strength)
        ratio = got["double_blocks_0"]["norm"] / full["double_blocks_0"]["norm"]
        assert abs(ratio - want) < 1e-3, (block_w, strength, ratio, want)
        # the untouched block still carries the strength, nothing else
        other = got["double_blocks_1"]["norm"] / full["double_blocks_1"]["norm"]
        assert abs(other - abs(strength)) < 1e-3, (strength, other)

    # strength 0 mutes everything, which the caller reports rather than writing
    # an empty file
    weights = {b: w * 0.0 for b, w in parse_blocks("", names).items()}
    assert filter_state_dict(sd, weights) == {}


if __name__ == "__main__":
    test_block_of()
    test_split_base()
    test_delta_norm_is_exact()
    test_analyze()
    test_select()
    test_parse_blocks()
    test_filter_state_dict_scales_once()
    test_strength_folds_in_once()
    print("ok")
