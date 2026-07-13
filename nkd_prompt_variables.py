"""NKD Prompt Variables — a prompt box with wired variables, Weavy-style.

The text holds {variable_N} tokens (rendered as chips by the frontend widget);
each token resolves to whatever string arrives on its input socket. Sockets
grow as you connect (Autogrow). Feed a variable from 😺NKD String Split and the
prompt resolves once per list item — a full multiprompt with two nodes.
"""
from __future__ import annotations
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io, ui

from .helpers import _resolve_prompts

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
            is_input_list=True,
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
                io.Boolean.Input("randomize_all", default=False,
                                 display_name="Randomize All",
                                 tooltip="When a variable receives a list, pick one "
                                         "random item instead of generating one prompt "
                                         "per item. Shift-click a chip in the text to "
                                         "randomize just that variable."),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff,
                             control_after_generate=True,
                             display_name="Seed",
                             tooltip="Drives the random picks — same seed, same "
                                     "choices."),
            ],
            outputs=[
                io.String.Output(display_name="prompt", is_output_list=True,
                                 tooltip="The resolved prompt(s). Lists on plain "
                                         "variables produce one prompt per item."),
            ],
        )

    @classmethod
    def execute(cls, text, variables: io.Autogrow.Type, randomize_all,
                seed) -> io.NodeOutput:
        # is_input_list: plain widgets arrive as single-value lists; the
        # variables dict carries the FULL list wired into each socket.
        text = text[0] if isinstance(text, list) else text
        randomize_all = randomize_all[0] if isinstance(randomize_all, list) else randomize_all
        seed = seed[0] if isinstance(seed, list) else seed
        prompts = _resolve_prompts(text, dict(variables), randomize_all, seed)
        if not prompts:
            prompts = [""]
        preview = "\n".join(f"[{i + 1}] {p}" for i, p in enumerate(prompts)) \
            if len(prompts) > 1 else prompts[0]
        if len(preview) > 2000:
            preview = preview[:2000] + "…"
        return io.NodeOutput(prompts, ui=ui.PreviewText(preview))


class NKDPromptVariablesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDPromptVariables]


NODE_CLASS_MAPPINGS = {"NKDPromptVariables": NKDPromptVariables}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDPromptVariables": "😺NKD Prompt Variables"}
