// 😺NKD Color Warp — fullscreen viewer overlay (vanilla TS, no Vue).
// Copies the VFX Tools overlay lifecycle (fixed fullscreen div on document.body,
// z-index 100000, Esc / backdrop / Close → serialize + teardown, single-instance
// guard). Left pane = RYB polar net, right pane = image / live LUT preview.
// The node's `mesh` string widget is the single source of truth — parsed on
// open, written back on change/close.
import { Mesh, meshFromDict, meshIdentity, meshToDict, srgbToHsl, displayToHue, hueToDisplay } from "./colorCore";
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
  hint.textContent = "drag nodes · Shift = ring/sector · Alt+wheel = luma · Alt over grid = mask · dbl-click resets";
  hint.style.cssText = "opacity:0.7;font-size:11px";
  const spacer = document.createElement("span");
  spacer.style.cssText = "flex:1 1 auto";

  // Toolbar toggles (Smooth default on / Pin) + Reset all + density.
  const smoothBtn = mkToggle("Smooth", true);
  const pinBtn = mkToggle("Pin", false);
  const resetBtn = mkBtn("Reset all", TEXT);
  const densBtn = mkBtn("Segments: 12", TEXT);

  const saveBtn = mkBtn("Save & close", ACCENT);
  const closeBtn = mkBtn("✕", TEXT);
  closeBtn.style.padding = "4px 9px";
  bar.append(title, hint, spacer, smoothBtn, pinBtn, resetBtn, densBtn, saveBtn, closeBtn);

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

  // Floating tooltip (hover/drag over a node) — nkd-curve-style.
  const tip = document.createElement("div");
  tip.style.cssText =
    `position:fixed;pointer-events:none;z-index:100001;display:none;` +
    `background:${BAR_BG};border:1px solid ${BORDER};border-radius:4px;` +
    `padding:4px 7px;font:11px Inter,system-ui,sans-serif;color:${TEXT};` +
    `white-space:pre;box-shadow:0 2px 8px rgba(0,0,0,0.4)`;

  // HSL readout panel (hover over the preview) — H in degrees is the priority
  // colorblind aid, so it's the big number.
  const readout = document.createElement("div");
  readout.style.cssText =
    `position:absolute;top:10px;left:10px;pointer-events:none;display:none;` +
    `background:rgba(20,22,28,0.92);border:1px solid ${BORDER};border-radius:6px;` +
    `padding:8px 11px;font:11px Inter,system-ui,sans-serif;color:${TEXT};` +
    `box-shadow:0 2px 10px rgba(0,0,0,0.5);min-width:120px`;
  rightPane.appendChild(readout);

  host.append(bar, body, tip);
  document.body.appendChild(host);

  // --- render engines: RYB grid (left) + WebGL LUT preview (right) ---------
  const grid = new ColorWarpGrid(gridCanvas);
  const preview = new ColorWarpPreview(previewCanvas);

  // Live edit from the grid → rebake preview + write back to the node.
  grid.cb.onEdit = (json, commit) => {
    try { mesh = meshFromDict(JSON.parse(json)); } catch { /* keep */ }
    preview.setMesh(mesh);
    opts.onChange?.(json);
  };
  grid.cb.onHover = (info, cx, cy) => {
    if (!info) { tip.style.display = "none"; return; }
    tip.textContent =
      `ring ${info.ri} · seg ${info.sj}\n` +
      `dh ${info.dh.toFixed(1)}  ds ${info.ds.toFixed(2)}  dl ${info.dl.toFixed(2)}`;
    tip.style.display = "block";
    tip.style.left = (cx + 14) + "px";
    tip.style.top = (cy + 14) + "px";
  };
  // Alt over the grid → preview affected-region mask at the cursor cell.
  grid.cb.onGridCursor = (disp, sat, alt, inside) => {
    if (alt && inside) preview.setMask(displayToHue(disp), sat);
    else preview.clearMask();
  };

  grid.setMesh(mesh);
  preview.setMesh(mesh);
  if (sourceCanvas) { grid.setSource(sourceCanvas); preview.setSource(sourceCanvas); }

  // Toolbar wiring.
  smoothBtn.onclick = () => { grid.smooth = !grid.smooth; setToggle(smoothBtn, grid.smooth); };
  pinBtn.onclick = () => { grid.pin = !grid.pin; setToggle(pinBtn, grid.pin); };
  resetBtn.onclick = () => grid.resetAll();
  densBtn.onclick = () => {
    const cur = grid.getMesh()?.hue_segments ?? 12;
    const next = cur === 12 ? 8 : 12;
    grid.setDensity(next);
    densBtn.textContent = `Segments: ${next}`;
  };

  // Preview hover → HSL readout + grid indicator dot (Phase 7.1).
  previewCanvas.addEventListener("pointermove", (e) => {
    const rgb = preview.readPixel(e.clientX, e.clientY);
    if (!rgb) { readout.style.display = "none"; grid.setIndicator(null); return; }
    const [h, s, l] = srgbToHsl(rgb);
    const R = Math.round(rgb[0] * 255), G = Math.round(rgb[1] * 255), B = Math.round(rgb[2] * 255);
    readout.innerHTML =
      `<div style="font-size:22px;font-weight:700;color:${ACCENT};line-height:1">${h.toFixed(0)}°</div>` +
      `<div style="opacity:0.75;margin-top:2px">hue</div>` +
      `<div style="margin-top:6px">S ${(s * 100).toFixed(0)}%  L ${(l * 100).toFixed(0)}%</div>` +
      `<div style="opacity:0.75;margin-top:2px">rgb ${R}, ${G}, ${B}</div>`;
    readout.style.display = "block";
    grid.setIndicator(hueToDisplay(h), s, `rgb(${R},${G},${B})`);
  });
  previewCanvas.addEventListener("pointerleave", () => {
    readout.style.display = "none";
    grid.setIndicator(null);
  });

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

function mkToggle(label: string, on: boolean): HTMLButtonElement {
  const b = mkBtn(label, TEXT);
  (b as any)._label = label;
  setToggle(b, on);
  return b;
}

function setToggle(b: HTMLButtonElement, on: boolean) {
  b.style.color = on ? "#0b0d12" : TEXT;
  b.style.background = on ? ACCENT : "#252830";
  b.style.borderColor = on ? ACCENT : BORDER;
  b.style.fontWeight = on ? "600" : "400";
}

function mkPane(): HTMLElement {
  const p = document.createElement("div");
  p.style.cssText = `position:relative;flex:1 1 0;min-width:0;overflow:hidden;background:${PANEL}`;
  return p;
}
