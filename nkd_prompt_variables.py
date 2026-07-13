"""NKD Prompt Variables — a prompt box with wired variables, Weavy-style.

The text holds {variable_N} tokens (rendered as chips by the frontend widget);
each token resolves to whatever string arrives on its input socket. Sockets
grow as you connect (Autogrow). Feed a variable from 😺NKD String Split and the
prompt resolves once per list item — a full multiprompt with two nodes.
"""
from __future__ import annotations
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from .helpers import _apply_variables

_DEFAULT_TEXT = ""


class NKDPromptVariables(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="NKDPromptVariables",
            display_name="😺NKD Prompt Variables",
            category="😺NKD Nodes/Basic",
            description=(
                "Prompt box with variables: write your prompt, drop variable "
                "chips into it, and each chip is filled by whatever text "
                "arrives on its input. Wire a list into a variable and the "
                "prompt resolves once per item."
            ),
            is_output_node=True,
            inputs=[
                io.String.Input("text", multiline=True, default=_DEFAULT_TEXT,
                                socketless=True,
                                tooltip="The prompt. {variable_N} marks where each "
                                        "variable lands."),
                io.Autogrow.Input("variables",
                                  template=io.Autogrow.TemplatePrefix(
                                      input=io.String.Input("var"),
                                      prefix="variable_",
                                      min=1,
                                      max=16,
                                  )),
            ],
            outputs=[
                io.String.Output(display_name="prompt",
                                 tooltip="The prompt with every variable filled in."),
            ],
        )

    @classmethod
    def execute(cls, text, variables: io.Autogrow.Type) -> io.NodeOutput:
        resolved = _apply_variables(text, dict(variables))
        preview = resolved if len(resolved) <= 2000 else resolved[:2000] + "…"
        return io.NodeOutput(resolved, ui=ui.PreviewText(preview))


class NKDPromptVariablesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDPromptVariables]


NODE_CLASS_MAPPINGS = {"NKDPromptVariables": NKDPromptVariables}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDPromptVariables": "😺NKD Prompt Variables"}
