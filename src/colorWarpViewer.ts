// 😺NKD Color Warp — the editor, in the shared NKD modal chrome (vanilla TS, no Vue).
// The frame, title bar, Esc / backdrop / ✕ and the footer come from nkd_modal; every exit
// path serialises and tears down. Left pane = RYB polar net, right pane = image / live LUT
// preview. Each control floats over the pane it acts on (shared UI kit, .nkd-ui-*).
// The node's `mesh` string widget is the single source of truth — parsed on
// open, written back on change/close.
import {
  Mesh, meshFromDict, meshIdentity, meshToDict, srgbToHsl, srgbToEngine,
  WHEEL_MODES, WheelModeName, wheelColumnHues, RADIAL_MODES, RadialModeName,
} from "./colorCore";
import { ColorWarpGrid, ColorWarpLumaStrip } from "./colorWarpGrid";
import { ColorWarpPreview } from "./colorWarpPreview";
import { ColorWarpScope3D } from "./colorWarpScope3D";
import { openNkdModal, nkdFloat, nkdIcon, nkdSep, nkdHelp, type NkdShortcuts } from "./nkd_modal";

export interface ColorWarpViewerOpts {
  image: HTMLImageElement | HTMLCanvasElement | null;
  mesh: string;
  onChange?: (json: string) => void;
  onClose?: (json: string) => void;
}

export interface ColorWarpViewerHandle {
  // Feed a resolved frame after open (e.g. the nkd-colorwarp-source push event).
  // scatter16: optional 16-bit RGB companion for a quantization-free cloud.
  setImage(src: CanvasImageSource, w: number, h: number,
           scatter16?: { data: Uint16Array; width: number; height: number }): void;
  close(): void;
}

// Single-instance guard: only one overlay at a time.
let active: { destroy: () => void } | null = null;

const PANEL = "#0d0f13";
const BAR_BG = "#1a1c22";
const ACCENT = "#4ab4ff";
const BORDER = "#3a3d46";
const TEXT = "#c8d0e0";

// TEMP debug (2026-07-23, off 2026-07-24): forced a 6×4 grid for node-naming
// over text. Superseded by the Spokes/Rings density selects. Labels stay.
const DEBUG_GRID = false;

const SHORTCUTS: NkdShortcuts = [
  ["Wheel", [
    ["Move a node", [], "drag it"],
    ["Move one node only", [], "turn Pin on"],
    ["Lock to hue or saturation", ["Shift"], "drag"],
    ["Reset a node", [], "double-click it"],
    ["Change its luma", ["Alt"], "wheel"],
    ["See the region a cell affects", ["Alt"], "hover the wheel"],
    ["Reset everything", ["R"]],
  ]],
  ["Image", [
    ["Move the node behind a colour", [], "drag on the image"],
    ["Change that colour's luma", ["Alt"], "wheel"],
    ["See the original", ["\\"], "hold, or hold Before"],
  ]],
  ["Editor", [
    ["Clear the selection, then close", ["Esc"]],
    ["Shortcuts", ["?"]],
  ]],
];

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
  catch { mesh = meshIdentity(12, 6, wheelColumnHues(12)); }
  if (DEBUG_GRID) mesh = meshIdentity(6, 4, wheelColumnHues(6));

  let sourceCanvas = toCanvas(opts.image);

  // --- Shell: the shared modal. Any way out saves, except a programmatic close. --------
  let silent = false;
  const modal = openNkdModal({
    title: "😺 Color Warp",
    hint: "drag a node · hold \\ for the original · ? for the shortcuts",
    onClose: () => {
      const json = meshJson(mesh);
      teardown();
      if (!silent) opts.onClose?.(json);
    },
  });
  const body = modal.body;

  // The controls, as round buttons for the floats. Toggles keep their state in `.on`.
  const pinBtn = nkdIcon("thumbtack", "Pin: move a single node instead of dragging its neighbours along", () => {});
  const resetBtn = nkdIcon("replay", "Reset all (R)", () => {});
  // DaVinci-style grid density: spokes (radial arms) and rings, independently.
  const spokesSel = mkSelect("Spokes", [4, 6, 8, 12, 16, 24, 32], mesh.hue_segments);
  const ringsSel = mkSelect("Rings", [2, 3, 4, 6, 8, 10, 12, 16], mesh.sat_rings);
  const wheelBtn = nkdIcon(WHEEL_MODES.ryb.label, "Wheel projection: click to cycle RYB, RGB, OKLCh. Only the view changes.", () => {}, true);
  const radialBtn = nkdIcon(RADIAL_MODES.neutral.label, "Radial scale: click to cycle Neutrals (magnifies the low-chroma core), Linear, Sqrt.", () => {}, true);
  const scopeBtn = nkdIcon("box", "3D vectorscope", () => {});
  const trailsBtn = nkdIcon("share-alt", "Trails in the 3D vectorscope", () => {});
  const lumaBtn = nkdIcon("chart-line", "Hue / Luma strip under the wheel", () => {});
  const labelsBtn = nkdIcon("tag", "Node labels (A1…), for talking about nodes", () => {});
  const beforeBtn = nkdIcon("Before", "Hold to see the original (\\)", () => {}, true);
  beforeBtn.insertAdjacentHTML("afterbegin", '<i class="pi pi-eye"></i>');

  const leftPane = mkPane();
  const rightPane = mkPane();
  leftPane.style.borderRight = `1px solid ${BORDER}`;
  body.append(leftPane, rightPane);

  // Left pane: wheel on top, Hue/Luma strip along the bottom (DaVinci-style).
  const LUMA_H = 118;
  // canvas is a replaced element: top+bottom alone won't stretch it — height
  // must be explicit or it collapses to its intrinsic size (tiny wheel).
  // Luma strip starts HIDDEN (toolbar toggle) — wheel owns the full height.
  const gridCanvas = document.createElement("canvas");
  // The wheel stops short of the pane's bottom: that strip is the floating bar's seat, so the
  // bar never covers the rim nodes.
  const BAR_SEAT = 58;
  gridCanvas.style.cssText = `position:absolute;left:0;top:0;width:100%;height:calc(100% - ${BAR_SEAT}px)`;
  leftPane.appendChild(gridCanvas);
  const lumaCanvas = document.createElement("canvas");
  lumaCanvas.style.cssText =
    `position:absolute;left:0;right:0;bottom:0;height:${LUMA_H}px;width:100%;` +
    `border-top:1px solid ${BORDER};display:none`;
  leftPane.appendChild(lumaCanvas);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  rightPane.appendChild(previewCanvas);

  // 3D vectorscope (3DLC-style): floating mini-window over the preview (like
  // the hue readout), expandable to the full pane with the corner icon.
  const SCOPE_MINI =
    `position:absolute;left:10px;bottom:10px;width:300px;height:240px;` +
    `border:1px solid ${BORDER};border-radius:6px;overflow:hidden;display:none;` +
    `box-shadow:0 2px 10px rgba(0,0,0,0.5);z-index:5;background:#0d0f13`;
  const SCOPE_FULL = "position:absolute;inset:0;overflow:hidden;display:none;z-index:5;background:#0d0f13";
  const scopeBox = document.createElement("div");
  scopeBox.style.cssText = SCOPE_MINI;
  const scopeCanvas = document.createElement("canvas");
  scopeCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  const scopeExpand = document.createElement("button");
  scopeExpand.textContent = "⤢";
  scopeExpand.title = "Expand / restore";
  scopeExpand.style.cssText =
    `position:absolute;top:6px;right:6px;z-index:2;background:rgba(20,22,28,0.85);` +
    `border:1px solid ${BORDER};color:${TEXT};border-radius:4px;padding:2px 7px;` +
    `cursor:pointer;font:12px Inter,system-ui,sans-serif;line-height:1.3`;
  scopeBox.append(scopeCanvas, scopeExpand);
  rightPane.appendChild(scopeBox);

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
  modal.overlay.appendChild(tip);

  // Each control floats over the pane it acts on. Wheel: projection and scale top left, the
  // strip and labels top right, and along the bottom what you reach for while warping.
  nkdFloat(leftPane, "left:14px;top:14px", true, wheelBtn, radialBtn);
  nkdFloat(leftPane, "right:14px;top:14px", true, lumaBtn, labelsBtn);
  const BAR_AT = 14;
  const leftBar = nkdFloat(leftPane,
    `left:20px;right:20px;bottom:${BAR_AT}px;margin:0 auto;width:fit-content;flex-wrap:wrap;justify-content:center;border-radius:20px`,
    false, pinBtn, nkdSep(), spokesSel.wrap, ringsSel.wrap, nkdSep(), resetBtn);
  // Image: the scope and the shortcuts top right, Before along the bottom.
  nkdFloat(rightPane, "right:14px;top:14px", true, scopeBtn, trailsBtn, nkdSep(),
    nkdHelp(modal, rightPane, SHORTCUTS));
  // Bottom RIGHT, not centred: the mini 3D scope opens from the bottom left corner.
  nkdFloat(rightPane, "right:14px;bottom:14px", false, beforeBtn);
  // Esc: the shortcuts sheet first (nkdHelp's), then a box-selection, then the editor.
  const helpEsc = modal.beforeEsc;
  modal.beforeEsc = () => !!helpEsc?.() || grid.clearSelection();

  // --- render engines: RYB grid (left) + WebGL LUT preview (right) ---------
  const grid = new ColorWarpGrid(gridCanvas);
  const luma = new ColorWarpLumaStrip(lumaCanvas, grid);
  const preview = new ColorWarpPreview(previewCanvas);
  const scope = new ColorWarpScope3D(scopeCanvas);

  // Live edit from the grid (or the luma strip, which routes through the grid)
  // → rebake preview + write back to the node.
  grid.cb.onEdit = (json, commit) => {
    try { mesh = meshFromDict(JSON.parse(json)); } catch { /* keep */ }
    preview.setMesh(mesh, !commit); // draft-quality LUT while dragging
    scope.setMesh(mesh);
    luma.refresh(); // dl can change from the wheel side too (Alt+wheel, resets)
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
  // The grid already reports ENGINE coords (OKLCh hue + sat).
  grid.cb.onGridCursor = (engineHue, sat, alt, inside) => {
    if (alt && inside) preview.setMask(engineHue, sat);
    else preview.clearMask();
  };

  grid.setMesh(mesh);
  preview.setMesh(mesh);
  scope.setMesh(mesh);
  if (sourceCanvas) {
    grid.setSource(sourceCanvas);
    preview.setSource(sourceCanvas);
    scope.setSource(sourceCanvas, null);
  }

  // Toolbar wiring.
  pinBtn.onclick = () => { grid.pin = !grid.pin; setToggle(pinBtn, grid.pin); };
  resetBtn.onclick = () => grid.resetAll();
  spokesSel.sel.onchange = () => grid.setDensity(parseInt(spokesSel.sel.value), undefined);
  ringsSel.sel.onchange = () => grid.setDensity(undefined, parseInt(ringsSel.sel.value));
  // 3D scope: mini-window toggle + expand-to-pane icon.
  let scopeOn = false;
  let scopeFull = false;
  function applyScopeLayout() {
    scopeBox.style.cssText = scopeFull ? SCOPE_FULL : SCOPE_MINI;
    scopeBox.style.display = scopeOn ? "block" : "none";
    scopeExpand.textContent = scopeFull ? "⤡" : "⤢";
    scope.setVisible(scopeOn);
    if (scopeOn) scope.resize();
  }
  scopeBtn.onclick = () => {
    scopeOn = !scopeOn;
    setToggle(scopeBtn, scopeOn);
    applyScopeLayout();
  };
  scopeExpand.onclick = () => {
    scopeFull = !scopeFull;
    applyScopeLayout();
  };
  trailsBtn.onclick = () => {
    scope.trails = !scope.trails;
    setToggle(trailsBtn, scope.trails);
    scope.setTrails(scope.trails);
  };
  // Luma strip show/hide — the wheel reclaims the full pane height when off.
  let lumaOn = false;
  lumaBtn.onclick = () => {
    lumaOn = !lumaOn;
    setToggle(lumaBtn, lumaOn);
    lumaCanvas.style.display = lumaOn ? "block" : "none";
    gridCanvas.style.height = `calc(100% - ${BAR_SEAT + (lumaOn ? LUMA_H : 0)}px)`;
    leftBar.style.bottom = `${BAR_AT + (lumaOn ? LUMA_H : 0)}px`;   // the bar rides above the strip
    requestAnimationFrame(render);
  };
  // Before/after: the original shows while the button or `\` is held.
  const showOriginal = (on: boolean) => {
    preview.setOriginal(on);
    beforeBtn.classList.toggle("on", on);
  };
  beforeBtn.addEventListener("pointerdown", () => showOriginal(true));
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    beforeBtn.addEventListener(ev, () => showOriginal(false));
  }
  // Node coordinate labels (A1…): only for discussing nodes over text.
  labelsBtn.onclick = () => {
    grid.labels = !grid.labels;
    setToggle(labelsBtn, grid.labels);
    grid.refresh();
  };
  // Wheel mode: cycles the display projection (RYB → RGB → OKLCh). The mesh is
  // engine-space, so this only reprojects the view — data untouched.
  wheelBtn.onclick = () => {
    const order: WheelModeName[] = ["ryb", "rgb", "oklch"];
    const next = order[(order.indexOf(grid.getWheelMode()) + 1) % order.length];
    grid.setWheelMode(next);
    wheelBtn.textContent = WHEEL_MODES[next].label;
    luma.refresh(); // the strip's x-axis is the wheel projection
  };
  // Radial mode: the same idea on the RADIUS. Neutrals (default) magnifies the
  // low-chroma core where footage actually lives; Linear is the metric-honest
  // disc; Sqrt spreads continuously. Wheel + 3D floor must move together.
  radialBtn.onclick = () => {
    const order: RadialModeName[] = ["neutral", "linear", "sqrt"];
    const next = order[(order.indexOf(grid.getRadialMode()) + 1) % order.length];
    grid.setRadialMode(next);
    scope.setRadialMode(next);
    radialBtn.textContent = RADIAL_MODES[next].label;
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
    // Indicator in ENGINE coords: the dot lands on the mesh cell that actually
    // warps this pixel, whatever wheel mode is active.
    const [engHue, engSat] = srgbToEngine(rgb);
    grid.setIndicator(engHue, Math.min(engSat, 1), `rgb(${R},${G},${B})`);
  });
  previewCanvas.addEventListener("pointerleave", () => {
    readout.style.display = "none";
    grid.setIndicator(null);
  });

  // 3DLC-style REMOTE editing: click-drag on the IMAGE grabs the grid node
  // governing the SOURCE color under the cursor and replays the pointer deltas
  // 1:1 on the disc. Shift = axis-locked hue/sat gesture; Alt+wheel = luma;
  // a node inside a box-selection moves/adjusts the whole pack — same rules
  // as on the grid, because the same drag machinery runs underneath.
  previewCanvas.style.cursor = "crosshair";
  let remoteDrag: { startX: number; startY: number } | null = null;
  const nodeUnderCursor = (e: MouseEvent): [number, number] | null => {
    const src = preview.readSourcePixel(e.clientX, e.clientY);
    if (!src) return null;
    const [h, s] = srgbToEngine(src);
    return grid.nodeForEngine(h, Math.min(s, 1));
  };
  previewCanvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const node = nodeUnderCursor(e);
    if (!node) return;
    grid.beginRemoteDrag(node[0], node[1], e.shiftKey);
    remoteDrag = { startX: e.clientX, startY: e.clientY };
    previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  previewCanvas.addEventListener("pointermove", (e) => {
    if (remoteDrag) grid.moveRemoteDrag(e.clientX - remoteDrag.startX, e.clientY - remoteDrag.startY);
  });
  const endRemote = (e: PointerEvent) => {
    if (!remoteDrag) return;
    remoteDrag = null;
    try { previewCanvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    grid.endRemoteDrag();
  };
  previewCanvas.addEventListener("pointerup", endRemote);
  previewCanvas.addEventListener("pointercancel", endRemote);
  previewCanvas.addEventListener("wheel", (e) => {
    if (!e.altKey) return;
    e.preventDefault();
    const node = nodeUnderCursor(e);
    if (node) grid.nudgeLuma(node[0], node[1], e.deltaY);
  }, { passive: false });

  function render() { grid.resize(); luma.resize(); preview.resize(); scope.resize(); }

  const ro = new ResizeObserver(render);
  ro.observe(body);
  requestAnimationFrame(render);

  // --- teardown ------------------------------------------------------------
  let destroyed = false;
  function teardown() {
    if (destroyed) return;
    destroyed = true;
    ro.disconnect();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKeyUp, true);
    grid.dispose();
    luma.dispose();
    preview.dispose();
    scope.dispose();
    if (active && active.destroy === destroy) active = null;
  }
  /** Close without saving: a second viewer opening, or the node going away. */
  function destroy() {
    silent = true;
    modal.close();
  }
  // Esc belongs to the shell (see beforeEsc above); these are the editor's own keys.
  const onKey = (e: KeyboardEvent) => {
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
    if (e.key === "\\") { e.stopPropagation(); showOriginal(true); return; }
    const k = e.key.toLowerCase();
    if (k === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.stopPropagation(); e.preventDefault(); grid.resetAll(); }
  };
  window.addEventListener("keydown", onKey, true);
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === "\\") showOriginal(false); };
  window.addEventListener("keyup", onKeyUp, true);
  modal.addPrimary("Save & close");

  active = { destroy };

  return {
    setImage(src: CanvasImageSource, w: number, h: number,
             scatter16?: { data: Uint16Array; width: number; height: number }) {
      const c = toCanvas(src, w, h);
      if (!c) return;
      sourceCanvas = c;
      grid.setSource(c);
      grid.setScatter16(scatter16 ?? null);
      preview.setSource(c);
      scope.setSource(c, scatter16 ?? null);
      render();
    },
    close() { destroy(); },
  };
}

// Labeled <select> for the density controls. Ensures the current value is
// always an option (e.g. a mesh saved at a density not in the preset list).
function mkSelect(label: string, values: number[], current: number): { wrap: HTMLElement; sel: HTMLSelectElement } {
  const wrap = document.createElement("label");
  wrap.style.cssText = "display:inline-flex;align-items:center;gap:2px;padding-left:8px;color:#9aa1b2;cursor:pointer";
  wrap.textContent = label;
  const sel = document.createElement("select");
  sel.style.cssText =
    "background:transparent;border:0;color:#dcdce0;border-radius:999px;height:24px;" +
    "padding:0 4px;font:600 11px system-ui,sans-serif;cursor:pointer";
  const vals = values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
  for (const v of vals) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = String(v);
    if (v === current) o.selected = true;
    sel.appendChild(o);
  }
  // Mouse wheel over the dropdown steps through the values (up = higher).
  sel.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const i = sel.selectedIndex + (e.deltaY < 0 ? 1 : -1);
    if (i < 0 || i >= sel.options.length) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("change"));
  }, { passive: false });
  wrap.appendChild(sel);
  return { wrap, sel };
}

function setToggle(b: HTMLButtonElement, on: boolean) {
  b.classList.toggle("on", on);
}

function mkPane(): HTMLElement {
  const p = document.createElement("div");
  p.style.cssText = `position:relative;flex:1 1 0;min-width:0;overflow:hidden;background:${PANEL}`;
  return p;
}
