"""NKD Loader — one node that stands in for a set of loader nodes.

The recipe is captured in the frontend from real loader nodes (any pack) and
saved inside the workflow. On execute the node expands into those loaders, so
caching, errors and model-path resolution stay owned by each loader.

Recipe JSON: {"name": str, "nodes": [{"class_type": str, "inputs": {...},
"models": [{"name": str, "url": str, "directory": str}]}],
"outputs": [{"node": i, "out": j, "type": str, "label": str}]}. An input value
{"from": i, "out": j} links to output j of recipe node i. `models` is the
download metadata the frontend writes onto each loader when the node is
unpacked or converted to a subgraph; execute ignores it.
"""
from __future__ import annotations
import json
import folder_paths
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


def model_directories(names, listings):
    """Which models/ folder holds each file, looked up in the server's own file lists.

    `listings` is {folder type: files it holds}. A file is matched by the exact value its
    loader widget carries, subfolder included; a name that isn't listed gets no folder rather
    than a guessed one.
    """
    out = {}
    for folder, files in listings.items():
        have = set(files)
        for name in names:
            if name not in out and name in have:
                out[name] = folder
    return out


def _register_model_dir_route():
    try:
        from server import PromptServer  # type: ignore
        from aiohttp import web  # type: ignore
    except ImportError:
        return
    from .helpers import same_origin_only

    @PromptServer.instance.routes.get("/nkd_loader/model_dirs")
    @same_origin_only
    async def model_dirs(request):
        names = request.query.getall("name", [])
        # custom_nodes is in there too, and walking it means tens of thousands of files.
        listings = {f: folder_paths.get_filename_list(f)
                    for f in folder_paths.folder_names_and_paths if f != "custom_nodes"}
        return web.json_response(model_directories(names, listings))


_register_model_dir_route()
