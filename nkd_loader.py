"""NKD Loader — one node that stands in for a set of loader nodes.

The recipe is captured in the frontend from real loader nodes (any pack) and
saved inside the workflow. On execute the node expands into those loaders, so
caching, errors and model-path resolution stay owned by each loader.

Recipe JSON: {"name": str, "nodes": [{"class_type": str, "inputs": {...}}],
"outputs": [{"node": i, "out": j, "type": str, "label": str}]}. An input value
{"from": i, "out": j} links to output j of recipe node i.
"""
from __future__ import annotations
import json
import nodes
from comfy_api.latest import io
from comfy_execution.graph_utils import GraphBuilder

MAX_OUTPUTS = 10


class NKDLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDLoader",
            display_name="😺NKD Loader",
            category="😺NKD Nodes/Loaders",
            description="Loads a saved combination of models (diffusion model, text encoders, VAE, "
                        "upscalers, adapters…). Save presets by selecting loader nodes and choosing "
                        "\"Save as NKD Loader preset\" in the canvas menu.",
            inputs=[io.String.Input("recipe", default="", socketless=True, multiline=False)],
            outputs=[io.AnyType.Output(f"out_{i}") for i in range(MAX_OUTPUTS)],
            enable_expand=True,
        )

    @classmethod
    def execute(cls, recipe: str) -> io.NodeOutput:
        if not recipe:
            raise ValueError("NKD Loader: choose a preset first.")
        recipe = json.loads(recipe)
        g = GraphBuilder()
        built = []
        for entry in recipe["nodes"]:
            class_type = entry["class_type"]
            if class_type not in nodes.NODE_CLASS_MAPPINGS:
                raise ValueError(f"NKD Loader: preset \"{recipe['name']}\" needs the node {class_type}, which is not installed.")
            inputs = {k: built[v["from"]].out(v["out"]) if isinstance(v, dict) else v
                      for k, v in entry["inputs"].items()}
            built.append(g.node(class_type, **inputs))
        outs = [built[o["node"]].out(o["out"]) for o in recipe["outputs"][:MAX_OUTPUTS]]
        outs += [None] * (MAX_OUTPUTS - len(outs))
        return io.NodeOutput(*outs, expand=g.finalize())
