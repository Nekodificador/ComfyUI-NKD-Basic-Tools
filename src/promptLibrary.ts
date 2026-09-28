// Saved variables for 😺NKD Prompt Variables — one library shared by every node and
// workflow, kept in the ComfyUI user folder through the core userdata API.
import { reactive } from "vue";
import { api } from "../../scripts/api.js";

export type SavedVar = { name: string; value: string };

const FILE = "nkd_prompt_variables.json";
// Same rule as the backend token (`{@name}` in helpers.py): letters in any script,
// digits, _ and -.
export const NAME_RE = /^[\p{L}\p{N}_-]{1,40}$/u;

// What a typed name becomes: spaces to _, anything else not allowed dropped.
export function cleanName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 40);
}

export const library = reactive({ items: [] as SavedVar[] });

let loading: Promise<void> | null = null;
let saveTimer: number | undefined;

export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    try {
      const res = await api.getUserData(FILE);
      if (res.status !== 200) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        library.items = data.filter((v: any) => NAME_RE.test(v?.name) && typeof v.value === "string");
      }
    } catch { /* no library yet */ }
  })();
  return loading;
}

export function saveLibrary(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    api.storeUserData(FILE, library.items, { overwrite: true, stringify: true, throwOnError: false })
      .catch(() => { /* keep editing; the next change retries */ });
  }, 400);
}
