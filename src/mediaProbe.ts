/**
 * Resolve which FILE feeds a node's input, by walking the graph — no probing, no caching.
 *
 * Trimmed copy of the same-named functions in ComfyUI-NKD-Preview-Tools'
 * `src/timeline/media.ts` (canonical source — copy verbatim from there if this drifts).
 * Preview Tools' version also does thumbnailing/probing/waveforms for its timeline; none of
 * that is needed here, so only the graph-walk + URL builder came along. The one Timeline-
 * specific carve-out (stop at `NKDTimeline`/`NKDAudioTimeline`, which remix their input) is
 * dropped — this pack has no such node.
 */
import { api } from "../../scripts/api.js";

export type MediaRef = { filename: string; subfolder: string; type: string };

export function viewUrl(ref: MediaRef): string {
  const q = new URLSearchParams({
    filename: ref.filename, type: ref.type || "input", subfolder: ref.subfolder || "",
  });
  return api.apiURL(`/view?${q}`);
}

const FILE_WIDGETS = ["file", "video", "audio", "image", "filename", "path"];
const looksLikeFile = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v !== "none" && /\.[a-z0-9]{2,5}$/i.test(v);

/**
 * Walks up the link connected to `slotName` looking for the node that actually owns a file.
 * Covers `Load Image/Video → this node` (the dominant case) and short chains through nodes
 * with no file of their own.
 */
export function resolveSource(node: any, slotName: string, maxDepth = 6,
                              depth = 0): MediaRef | null {
  if (depth > maxDepth) return null;
  const slot = node?.inputs?.find((i: any) => i.name === slotName || i.name?.endsWith(`.${slotName}`));
  if (!slot || slot.link == null) return null;
  const link = node.graph?.getLink(slot.link);
  const src = link && node.graph?.getNodeById(link.origin_id);
  if (!src) return null;

  for (const name of FILE_WIDGETS) {
    const w = src.widgets?.find((x: any) => x.name === name);
    if (w && looksLikeFile(w.value)) {
      const raw = String(w.value);
      const m = /^(.*?)\s*\[(\w+)\]$/.exec(raw);
      const clean = m ? m[1] : raw;
      const cut = clean.lastIndexOf("/");
      return {
        filename: cut >= 0 ? clean.slice(cut + 1) : clean,
        subfolder: cut >= 0 ? clean.slice(0, cut) : "",
        type: m ? m[2] : "input",
      };
    }
  }
  for (const inp of src.inputs ?? []) {
    if (inp.link == null) continue;
    const up = resolveSource(src, inp.name, maxDepth, depth + 1);
    if (up) return up;
  }
  return null;
}

/** What kind of media is wired into a slot, read from the LINK (the socket itself is
 *  multi-type and cannot say what is actually connected). */
export type MediaKind = "video" | "image" | "mask" | "audio";

export function slotKind(node: any, slotName: string): MediaKind | null {
  const slot = node?.inputs?.find(
    (i: any) => i.name === slotName || i.name?.endsWith(`.${slotName}`));
  if (!slot || slot.link == null) return null;
  const link = node.graph?.getLink(slot.link);
  let type = link?.type;
  if (!type && link) {
    const src = node.graph?.getNodeById(link.origin_id);
    type = src?.outputs?.[link.origin_slot]?.type;
  }
  const t = String(type ?? "").toUpperCase();
  if (t.includes("VIDEO")) return "video";
  if (t.includes("AUDIO")) return "audio";
  if (t.includes("MASK")) return "mask";
  if (t.includes("IMAGE")) return "image";
  return null;
}
