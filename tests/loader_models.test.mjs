// What a NKD Loader preset declares for its model files. The rule that matters: the declared
// name is the widget value verbatim, subfolder included.
import assert from "node:assert";
import { isModelFile, modelRefs } from "../src/loaderModels.ts";

assert.ok(isModelFile("flux2-klein\\flux-2-klein-9b.safetensors"));
assert.ok(isModelFile("model.gguf"));
assert.ok(!isModelFile("default"));
assert.ok(!isModelFile(42));

// One entry per model file, in input order; everything else is left out.
assert.deepStrictEqual(
  modelRefs(["flux2-klein\\klein.safetensors", "default", 1, "qwen_3_8b.safetensors"]),
  [{ name: "flux2-klein\\klein.safetensors" }, { name: "qwen_3_8b.safetensors" }]);

// The subfolder stays in the name; the folder comes from the server's lists.
assert.deepStrictEqual(
  modelRefs(["flux2-klein\\klein.safetensors"], [], { "flux2-klein\\klein.safetensors": "diffusion_models" }),
  [{ name: "flux2-klein\\klein.safetensors", directory: "diffusion_models" }]);

// A link already declared on the loader node is kept, and wins over the looked-up folder.
assert.deepStrictEqual(
  modelRefs(["ae.safetensors"],
            [{ name: "ae.safetensors", url: "https://huggingface.co/x/resolve/main/ae.safetensors", directory: "vae" }],
            { "ae.safetensors": "wrong" }),
  [{ name: "ae.safetensors", url: "https://huggingface.co/x/resolve/main/ae.safetensors", directory: "vae" }]);

// Metadata of a file the node no longer loads is dropped, so switching model in the preset
// editor can't leave a link pointing at another file.
assert.deepStrictEqual(
  modelRefs(["new.safetensors"], [{ name: "old.safetensors", url: "https://huggingface.co/x/resolve/main/old.safetensors" }]),
  [{ name: "new.safetensors" }]);

// Sources are merged field by field: a link typed in the preset survives the workflow's own
// entry, which may only know the folder.
assert.deepStrictEqual(
  modelRefs(["ae.safetensors"],
            [{ name: "ae.safetensors", url: "https://huggingface.co/x/resolve/main/ae.safetensors" },
             { name: "ae.safetensors", directory: "vae" }]),
  [{ name: "ae.safetensors", url: "https://huggingface.co/x/resolve/main/ae.safetensors", directory: "vae" }]);

// A later link replaces an earlier one.
assert.deepStrictEqual(
  modelRefs(["ae.safetensors"],
            [{ name: "ae.safetensors", url: "https://huggingface.co/old/resolve/main/ae.safetensors" },
             { name: "ae.safetensors", url: "https://huggingface.co/new/resolve/main/ae.safetensors" }]),
  [{ name: "ae.safetensors", url: "https://huggingface.co/new/resolve/main/ae.safetensors" }]);

// The same file on two inputs is declared once.
assert.deepStrictEqual(modelRefs(["a.safetensors", "a.safetensors"]), [{ name: "a.safetensors" }]);

console.log("loader models OK");
