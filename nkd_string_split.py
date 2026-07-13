"""NKD String Split — turn one block of text into a list of strings.

The list output uses ComfyUI's native list mechanism: every downstream node
runs once per item (e.g. one prompt per line → N generations, no extra wiring).
"""
from __future__ import annotations
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from .helpers import _split_text

_DELIMITERS = {
    "New Line": "\n",
    "Comma": ",",
    "Period": ".",
    "Slash": "/",
    "Pipe": "|",
    "Semicolon": ";",
}


class NKDStringSplit(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDStringSplit",
            display_name="😺NKD String Split",
            category="😺NKD Nodes/Basic",
            description=(
                "Split one block of text into a list of strings. Downstream "
                "nodes run once per item — one prompt per piece, no extra "
                "wiring. Handy for lists written by an LLM."
            ),
            is_output_node=True,
            inputs=[
                io.String.Input("text", multiline=True, default="",
                                tooltip="The text to split."),
                io.Combo.Input("delimiter",
                               options=[*_DELIMITERS.keys(), "Custom"],
                               default="New Line",
                               display_name="Delimiter",
                               tooltip="Character that separates the pieces."),
                io.String.Input("custom_delimiter", default="",
                                display_name="Custom Delimiter",
                                tooltip="Your own separator, used when Delimiter is "
                                        "Custom. \\n and \\t are understood."),
                io.Boolean.Input("trim_whitespace", default=True,
                                 display_name="Trim Whitespace",
                                 tooltip="Remove spaces and line breaks around each piece."),
                io.Boolean.Input("skip_empty", default=True,
                                 display_name="Skip Empty",
                                 tooltip="Drop pieces that end up empty."),
                io.Boolean.Input("remove_numbering", default=False,
                                 display_name="Remove List Numbering",
                                 tooltip="Strip leading markers like '1.', '2)' or '-' "
                                         "from each piece — for numbered lists written "
                                         "by an LLM."),
            ],
            outputs=[
                io.String.Output(display_name="strings", is_output_list=True,
                                 tooltip="One item per piece. Downstream nodes run "
                                         "once per item."),
                io.Int.Output(display_name="count",
                              tooltip="How many pieces came out."),
            ],
        )

    @classmethod
    def execute(cls, text, delimiter, custom_delimiter, trim_whitespace,
                skip_empty, remove_numbering) -> io.NodeOutput:
        delim = _DELIMITERS.get(delimiter)
        if delim is None:
            delim = custom_delimiter.replace("\\n", "\n").replace("\\t", "\t")
        items = _split_text(text, delim, trim_whitespace, skip_empty, remove_numbering)
        if not items:
            items = [""]

        preview = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(items))
        if len(preview) > 2000:
            preview = preview[:2000] + "…"
        return io.NodeOutput(items, len(items), ui=ui.PreviewText(preview))


class NKDStringSplitExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDStringSplit]


NODE_CLASS_MAPPINGS = {"NKDStringSplit": NKDStringSplit}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDStringSplit": "😺NKD String Split"}
