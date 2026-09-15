"""Generic per-block LoRA analysis — no architecture table.

Blocks are derived from the tensor key itself (``<name>_<index>``), so this
works on FLUX, Wan, Qwen, Klein, Krea, MiniMax H3 and whatever ships next
without a line of per-model code.

Impact per block is the Frobenius norm of the weight delta the LoRA adds,
computed exactly and cheaply via the Gram trick (see ``delta_norm``).

Pure Python + torch; no ComfyUI imports, so ``tests/test_lora_control.py``
runs it standalone.
"""
from __future__ import annotations

import re

import torch

# Tokens that carry no block identity. Walking back from the index token, the
# first one of these ends the block name: `lora_unet_double_blocks_3` -> "double_blocks".
_NOISE = frozenset({
    "lora", "lycoris", "unet", "diffusion", "model", "net", "base",
    "weight", "default",
})

# suffix -> role. Order matters: longest first, so `.lora_down.weight` is not
# eaten by `.weight`.
_SUFFIXES = (
    (".lora_up.weight", "up"),
    (".lora_down.weight", "down"),
    (".lora_B.weight", "up"),
    (".lora_A.weight", "down"),
    (".lora_b.weight", "up"),
    (".lora_a.weight", "down"),
    (".hada_w1_a", "hada"), (".hada_w1_b", "hada"),
    (".hada_w2_a", "hada"), (".hada_w2_b", "hada"),
    (".lokr_w1_a", "lokr"), (".lokr_w1_b", "lokr"),
    (".lokr_w2_a", "lokr"), (".lokr_w2_b", "lokr"),
    (".lokr_w1", "lokr"), (".lokr_w2", "lokr"),
    (".dora_scale", "dora"),
    (".diff_b", "diff"), (".diff", "diff"),
    (".alpha", "alpha"),
    # Bare A/B factors (some control-LoRAs ship these, e.g. Krea depth control).
    # Last, so the longer `.lora_A.weight` forms above always win.
    (".B", "up"), (".A", "down"),
)

_TYPE_OF_ROLE = {"hada": "LoHa", "lokr": "LoKR", "diff": "full-diff"}


def split_base(key: str):
    """Split a tensor key into (base, role). Returns None for unknown keys."""
    for suffix, role in _SUFFIXES:
        if key.endswith(suffix):
            return key[: -len(suffix)], role
    return None


def block_of(base: str):
    """Derive (block_name, index) from a tensor base name, or None.

    Finds the first numeric path segment whose preceding words name a block or
    a layer, and uses those words as the block group. That is what separates
    `single_transformer_blocks.12` from `transformer_blocks.12` for free —
    no per-architecture regex.
    """
    toks = re.split(r"[._]", base)
    for i, tok in enumerate(toks):
        if not tok.isdigit():
            continue
        name_toks = []
        for prev in reversed(toks[:i]):
            if prev in _NOISE:
                break
            name_toks.append(prev)
        name_toks.reverse()
        # Drop a repeated word's earlier copies, keeping the last: the diffusers
        # prefix collapses (`transformer.transformer_blocks` -> transformer_blocks)
        # without eating the qualifier in `transformer.single_transformer_blocks`.
        deduped = [t for j, t in enumerate(name_toks) if t not in name_toks[j + 1:]]
        name = "_".join(deduped)
        if "block" in name or "layer" in name:
            return name, int(tok)
    return None


def delta_norm(up: torch.Tensor, down: torch.Tensor) -> float:
    """Exact ||up @ down||_F without ever forming the product.

    ||BA||_F^2 = tr(B^T B . A A^T), and both Grams are only rank x rank, so this
    costs O(r*d) instead of O(d^2). Beats ||B||.||A||, which is merely an upper
    bound (submultiplicativity) and overstates blocks with misaligned factors.
    """
    b = up.reshape(up.shape[0], -1).float()      # (out, r)
    a = down.reshape(down.shape[0], -1).float()  # (r, in)
    gb = b.T @ b                                  # (r, r)
    ga = a @ a.T                                  # (r, r)
    return float(torch.clamp((gb * ga.T).sum(), min=0.0).sqrt())


def analyze(state_dict: dict) -> dict:
    """Group a LoRA state dict into blocks and score each one by impact."""
    parts: dict[str, dict] = {}
    order: list[str] = []
    for key, value in state_dict.items():
        split = split_base(key)
        if split is None:
            continue
        base, role = split
        entry = parts.get(base)
        if entry is None:
            entry = parts[base] = {}
            order.append(base)
        entry[role] = value

    types = set()
    ranks: dict[int, int] = {}
    energy: dict[str, float] = {}       # block -> sum of squared norms
    layers: dict[str, int] = {}
    block_order: list[str] = []
    sort_key: dict[str, tuple] = {}     # block -> (group rank, index)
    groups_seen: list[str] = []
    unmatched: list[str] = []

    for base in order:
        entry = parts[base]
        norm = 0.0

        if "up" in entry and "down" in entry:
            types.add("LoRA")
            rank = entry["down"].shape[0]
            ranks[rank] = ranks.get(rank, 0) + 1
            norm = delta_norm(entry["up"], entry["down"])
            alpha = entry.get("alpha")
            if alpha is not None and rank:
                norm *= float(alpha.reshape(-1)[0]) / rank
        else:
            # ponytail: LoHa/LoKR/diff get the product-of-norms proxy, not the
            # exact delta. Ranking within the same type still holds, which is
            # what the panel needs; exact needs per-format reconstruction.
            for role, tensor in entry.items():
                if role == "alpha":
                    continue
                types.add(_TYPE_OF_ROLE.get(role, "LoRA"))
                n = float(tensor.float().norm())
                norm = n if norm == 0.0 else norm * n

        found = block_of(base)
        if found is None:
            block = "other"
            if len(unmatched) < 12:
                unmatched.append(base)
        else:
            group, index = found
            block = f"{group}_{index}"
            if group not in groups_seen:
                groups_seen.append(group)
            sort_key[block] = (groups_seen.index(group), index)

        if block not in energy:
            energy[block] = 0.0
            layers[block] = 0
            block_order.append(block)
        # Norms add in quadrature: the result is the true Frobenius norm of the
        # whole block's delta, not the inflated linear sum.
        energy[block] += norm * norm
        layers[block] += 1

    norms = {b: energy[b] ** 0.5 for b in energy}
    # 'other' is a heterogeneous bucket — on models with many loose projections
    # its pooled energy outweighs any single block and would flatten every real
    # score. Reference the peak to real blocks; 'other' may read above 100.
    peak = max((n for b, n in norms.items() if b != "other"), default=0.0) or 1.0
    total = sum(energy.values()) or 1.0

    blocks = {
        b: {
            "score": round(100.0 * norms[b] / peak, 1),
            "share": round(100.0 * energy[b] / total, 2),
            "norm": round(norms[b], 5),
            "layers": layers[b],
        }
        for b in block_order
    }

    # Groups keep the order they first appear in the file (double before single
    # in every trainer seen so far); inside a group, sort numerically — the file
    # itself is usually alphabetical, which would read 0, 1, 10, 11, 2...
    ordered = sorted((b for b in block_order if b != "other"), key=sort_key.get)
    if "other" in blocks:
        ordered.append("other")

    lora_type = types.pop() if len(types) == 1 else ("mixed" if types else "unknown")
    return {
        "lora_type": lora_type,
        "rank": max(ranks, key=ranks.get) if ranks else None,
        "order": ordered,
        "blocks": blocks,
        "unmatched_sample": unmatched,
    }


# ---------------------------------------------------------------------------
# Block selection
# ---------------------------------------------------------------------------

def split_block(name: str):
    """`double_blocks_7` -> ("double_blocks", 7); `other` -> ("other", None)."""
    group, _, index = name.rpartition("_")
    if group and index.isdigit():
        return group, int(index)
    return name, None


def select(selector: str, block_names) -> list[str]:
    """Resolve one selector against the known block names.

    `*`/`all` · `double_blocks_7` · `double_blocks_0-3` · `single_blocks_*`
    """
    selector = selector.strip()
    if selector in ("*", "all"):
        return list(block_names)
    if selector in block_names:
        return [selector]
    if selector.endswith("_*"):
        selector = selector[:-2]

    group, _, span = selector.rpartition("_")
    if group and "-" in span:
        lo, _, hi = span.partition("-")
        if lo.isdigit() and hi.isdigit():
            lo, hi = int(lo), int(hi)
            return [
                n for n in block_names
                if split_block(n)[0] == group
                and split_block(n)[1] is not None
                and lo <= split_block(n)[1] <= hi
            ]
    return [n for n in block_names if split_block(n)[0] == selector]


def parse_blocks(text: str, block_names, default: float = 1.0) -> dict[str, float]:
    """Parse the block rule text into per-block multipliers (0.0 == off).

    One `selector: value` per line, later lines override earlier ones. Blocks
    no rule mentions keep `default`, so a rule file survives swapping the LoRA.
    """
    weights = {b: default for b in block_names}
    if not text or not text.strip():
        return weights

    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        selector, _, value = line.partition(":")
        value = value.strip().lower()
        if value in ("off", "no", "false"):
            weight = 0.0
        elif value in ("on", "yes", "true"):
            weight = default
        else:
            try:
                weight = float(value)
            except ValueError:
                continue
        for block in select(selector, block_names):
            weights[block] = weight
    return weights


# Scaling a LoRA means scaling the product up@down exactly ONCE. These roles are
# the single factor to touch per format; scaling every tensor of a pair would
# square the multiplier (and cube it once alpha joins in).
_SCALED_ROLE = {"LoRA": "up", "LoHa": "hada", "LoKR": "lokr", "full-diff": "diff"}


def filter_state_dict(state_dict: dict, weights: dict[str, float],
                      default: float = 1.0) -> dict:
    """Drop blocks set to 0 and scale the rest by their multiplier."""
    scaled_once: set[str] = set()
    out = {}
    for key, value in state_dict.items():
        split = split_base(key)
        base, role = split if split else (key, None)
        found = block_of(base)
        block = f"{found[0]}_{found[1]}" if found else "other"

        weight = weights.get(block, default)
        if weight == 0.0:
            continue
        if weight != 1.0 and base not in scaled_once and role in _SCALED_ROLE.values():
            out[key] = value * weight
            scaled_once.add(base)
        else:
            out[key] = value
    return out


# ---------------------------------------------------------------------------
# Quantized-model detection
#
# Ported from shootthesound/comfyUI-Realtime-Lora (MIT) — ComfyUI's hook system
# walks weights assuming plain nn.Linear, so GGUF / fp8 layers raise or hang at
# sample time. Scheduling must fall back to a flat apply on those.
# ---------------------------------------------------------------------------

_FP8_DTYPES = tuple(
    dt for dt in (
        getattr(torch, "float8_e4m3fn", None),
        getattr(torch, "float8_e5m2", None),
        getattr(torch, "float8_e4m3fnuz", None),
        getattr(torch, "float8_e5m2fnuz", None),
    ) if dt is not None
)


def is_quantized(model_patcher) -> tuple[bool, str]:
    """(is_quantized, label). Conservative: any failure reports not quantized."""
    try:
        inner = getattr(model_patcher, "model", None)
        target = getattr(inner, "diffusion_model", None) or inner
        if target is None:
            return (False, "")

        for module in target.modules():
            cls = type(module).__name__.lower()
            if "ggml" in cls or "gguf" in cls:
                return (True, "GGUF")
            if hasattr(module, "scale_weight") or hasattr(module, "weight_scale"):
                return (True, "fp8 (scaled)")

        for i, param in enumerate(target.parameters()):
            if "ggml" in type(param).__name__.lower() or hasattr(param, "tensor_type"):
                return (True, "GGUF")
            if _FP8_DTYPES and param.dtype in _FP8_DTYPES:
                return (True, "fp8")
            if i >= 400:
                break
        return (False, "")
    except Exception:
        return (False, "")
