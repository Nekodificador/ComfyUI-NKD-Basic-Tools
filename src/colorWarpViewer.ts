// 😺NKD Color Warp — fullscreen viewer overlay (vanilla TS, no Vue).
// Copies the VFX Tools overlay lifecycle (fixed fullscreen div on document.body,
// z-index 100000, Esc / backdrop / Close → serialize + teardown, single-instance
// guard). Left pane = RYB polar net, right pane = image / live LUT preview.
// The node's `mesh` string widget is the single source of truth — parsed on
// open, written back on change/close.
import { Mesh, meshFromDict, meshIdentity, meshToDict } from "./colorCore";
import { ColorWarpGrid } from "./colorWarpGrid";
import { ColorWarpPreview } from "./colorWarpPreview";

export interface ColorWarpViewerOpts {
  image: HTMLImageElement | HTMLCanvasElement | null;
  mesh: string;
  onChange?: (json: string) => void;
  onClose?: (json: string) => void;
}

export interface ColorWarpViewerHandle {
  // Feed a resolved frame after open (e.g. the nkd-colorwarp-source push event).
  setImage(src: CanvasImageSource, w: number, h: number): void;
  close(): void;
}

// Single-instance guard: only one overlay at a time.
let active: { destroy: () => void } | null = null;

const PANEL = "#111318";
const BAR_BG = "#1a1c22";
const ACCENT = "#4ab4ff";
const BORDER = "#3a3d46";
const TEXT = "#c8d0e0";

function meshJson(m: Mesh): string {
  return JSON.stringify(meshToDict(m));
}

// Normalise any source into an offscreen canvas we can read pixels from and
// upload to WebGL — grid scatter and the preview both consume it.
function toCanvas(src: CanvasImageSource | null, w?: number, h?: number): HTMLCanvasElement | null {
  if (!src) return null;
  const width = w || (src as any).naturalWidth || (src as any).width || 0;
  const height = h || (src as any).naturalHeight || (src as any).height || 0;
  if (!width || !height) return null;
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  try { ctx.drawImage(src, 0, 0, width, height); } catch { return null; }
  return c;
}

export function openColorWarpViewer(opts: ColorWarpViewerOpts): ColorWarpViewerHandle {
  if (active) active.destroy();

  let mesh: Mesh;
  try { mesh = meshFromDict(JSON.parse(opts.mesh)); }
  catch { mesh = meshIdentity(); }

  let sourceCanvas = toCanvas(opts.image);

  // --- DOM shell -----------------------------------------------------------
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;` +
    `background:${PANEL};color:${TEXT};font:11px Inter,system-ui,sans-serif;`;

  const bar = document.createElement("div");
  bar.style.cssText =
    `display:flex;align-items:center;gap:10px;padding:8px 14px;background:${BAR_BG};` +
    `border-bottom:1px solid rgba(255,255,255,0.07);flex:0 0 auto`;
  const title = document.createElement("span");
  title.textContent = "😺 Color Warp";
  title.style.cssText = "font-weight:600;font-size:13px";
  const hint = document.createElement("span");
  hint.textContent = "RYB polar net over the pixel cloud · live LUT preview";
  hint.style.cssText = "opacity:0.7;font-size:11px";
  const spacer = document.createElement("span");
  spacer.style.cssText = "flex:1 1 auto";
  const saveBtn = mkBtn("Save & close", ACCENT);
  const closeBtn = mkBtn("✕", TEXT);
  closeBtn.style.padding = "4px 9px";
  bar.append(title, hint, spacer, saveBtn, closeBtn);

  const body = document.createElement("div");
  body.style.cssText = "flex:1 1 auto;min-height:0;display:flex";

  const leftPane = mkPane();
  const rightPane = mkPane();
  leftPane.style.borderRight = `1px solid ${BORDER}`;
  body.append(leftPane, rightPane);

  const gridCanvas = document.createElement("canvas");
  gridCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  leftPane.appendChild(gridCanvas);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  rightPane.appendChild(previewCanvas);

  host.append(bar, body);
  document.body.appendChild(host);

  // --- render engines: RYB grid (left) + WebGL LUT preview (right) ---------
  const grid = new ColorWarpGrid(gridCanvas);
  const preview = new ColorWarpPreview(previewCanvas);
  grid.setMesh(mesh);
  preview.setMesh(mesh);
  if (sourceCanvas) { grid.setSource(sourceCanvas); preview.setSource(sourceCanvas); }

  function render() { grid.resize(); preview.resize(); }

  const ro = new ResizeObserver(render);
  ro.observe(body);
  requestAnimationFrame(render);

  // --- teardown ------------------------------------------------------------
  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    ro.disconnect();
    window.removeEventListener("keydown", onKey, true);
    grid.dispose();
    preview.dispose();
    host.remove();
    if (active && active.destroy === destroy) active = null;
  }
  function closeWith(commit: boolean) {
    const json = meshJson(mesh);
    destroy();
    if (commit) opts.onClose?.(json);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); closeWith(true); }
  };
  window.addEventListener("keydown", onKey, true);
  host.addEventListener("pointerdown", (e) => { if (e.target === host) closeWith(true); });
  saveBtn.onclick = () => closeWith(true);
  closeBtn.onclick = () => closeWith(true);

  active = { destroy };

  return {
    setImage(src: CanvasImageSource, w: number, h: number) {
      const c = toCanvas(src, w, h);
      if (!c) return;
      sourceCanvas = c;
      grid.setSource(c);
      preview.setSource(c);
      render();
    },
    close() { closeWith(false); },
  };
}

function mkBtn(label: string, color: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    `background:#252830;border:1px solid ${BORDER};color:${color};border-radius:4px;` +
    `padding:4px 12px;cursor:pointer;font:inherit`;
  if (color === ACCENT) { b.style.borderColor = ACCENT; b.style.fontWeight = "600"; }
  return b;
}

function mkPane(): HTMLElement {
  const p = document.createElement("div");
  p.style.cssText = `position:relative;flex:1 1 0;min-width:0;overflow:hidden;background:${PANEL}`;
  return p;
}
