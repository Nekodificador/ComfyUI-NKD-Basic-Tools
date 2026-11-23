/**
 * The download metadata a preset carries for its model files, so the loaders it unpacks into
 * declare it the way a shared workflow does (`properties.models`).
 *
 * `name` is the widget value verbatim, subfolder and all: that is what ComfyUI offers the
 * download for, and a plain file name next to a `flux2-klein\\file.safetensors` widget buys
 * nothing.
 */
export type ModelRef = { name: string; url?: string; directory?: string };

const MODEL_EXT = /\.(safetensors|gguf|ckpt|pt|pth|bin|sft|onnx)$/i;

export const isModelFile = (v: unknown): v is string => typeof v === "string" && MODEL_EXT.test(v);

/**
 * One entry per model file the node loads. `known` is what is already declared for those files
 * — the loader node the preset was captured from, the preset as it stands, the recipe saved in
 * the workflow — merged field by field, later wins, so a link from one source survives an entry
 * from another that only knows the folder. `dirs` supplies the folder for the rest. A file with
 * neither url nor folder is still listed, so the dialog names it even when nobody has filled a
 * link yet.
 */
export function modelRefs(values: unknown[], known: ModelRef[] = [], dirs: Record<string, string> = {}): ModelRef[] {
  const prev = new Map<string, ModelRef>();
  for (const m of known) {
    if (!m || typeof m.name !== "string") continue;
    const at = prev.get(m.name) ?? { name: m.name };
    if (m.url) at.url = m.url;
    if (m.directory) at.directory = m.directory;
    prev.set(m.name, at);
  }
  const refs: ModelRef[] = [];
  for (const v of values) {
    if (!isModelFile(v) || refs.some((r) => r.name === v)) continue;
    const was = prev.get(v);
    const directory = was?.directory || dirs[v];
    refs.push({ name: v, ...(was?.url ? { url: was.url } : {}), ...(directory ? { directory } : {}) });
  }
  return refs;
}
