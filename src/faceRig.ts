/**
 * 😺NKD Face Rig — the in-node canvas editor.
 *
 * A rig, not a slider bank: the handles sit on the face itself, anchored to
 * the detected landmarks, and the face re-renders live while a handle moves.
 * The backend (`nkd_face_rig_routes.py`) keeps the prepared source cached, so
 * a preview frame costs one warp + decode (~25 ms); the client keeps exactly
 * one request in flight and sends the next when the last returns, which
 * settles at whatever rate the hardware sustains — no debounce to mis-guess.
 *
 * Lives *inside the node*, Relight-style, not in a modal: `mountFaceRig` puts
 * the whole editor into any container. `main.ts` hosts it as a DOM widget
 * (with `sizeDomWidgetToContent` doing the node-sizing dance); the dev
 * harness mounts the same thing into a bare div. No ComfyUI imports here.
 */
import { ensureNkdModalStyles, nkdButton, nkdToggle } from "./nkd_modal";

// ── state ──────────────────────────────────────────────────────────────────
// Mirrors nkd_face_rig_axes.STATE_DEFAULTS / serialise(): same field names,
// same "omit when default" discipline, so both sides read each other's JSON.

export interface RigState {
  w: Record<string, number>;      // axis name -> weight
  p: Record<string, number>;      // preset name -> intensity
  rot: [number, number, number];  // pitch / yaw / roll, degrees
  scale: number;
  trans: [number, number];
  ortho: boolean;
  mirror: boolean;
}

const STATE_DEFAULTS: Omit<RigState, "w" | "p"> = {
  rot: [0, 0, 0], scale: 0, trans: [0, 0], ortho: false, mirror: true,
};

export function deserialise(text: string): RigState {
  const state: RigState = { w: {}, p: {}, ...structuredClone(STATE_DEFAULTS) };
  if (!text) return state;
  try {
    const raw = JSON.parse(text);
    for (const [k, v] of Object.entries(raw.w ?? {})) state.w[k] = Number(v);
    for (const [k, v] of Object.entries(raw.p ?? {})) state.p[k] = Number(v);
    for (const k of Object.keys(STATE_DEFAULTS) as (keyof typeof STATE_DEFAULTS)[]) {
      if (k in raw) (state as any)[k] = raw[k];
    }
  } catch { /* hand-typed junk in the widget -> empty pose, same as the backend */ }
  return state;
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function serialise(s: RigState): string {
  const out: any = { v: 1, w: {} };
  for (const [k, v] of Object.entries(s.w)) if (v) out.w[k] = r5(v);
  const p: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.p)) if (v) p[k] = r5(v);
  if (Object.keys(p).length) out.p = p;
  for (const k of Object.keys(STATE_DEFAULTS) as (keyof typeof STATE_DEFAULTS)[]) {
    let v = (s as any)[k];
    if (Array.isArray(v)) v = v.map((n: number) => r5(n));
    if (JSON.stringify(v) !== JSON.stringify((STATE_DEFAULTS as any)[k])) out[k] = v;
  }
  return JSON.stringify(out);
}

// ── the controls ───────────────────────────────────────────────────────────
// What each handle means, in axis weights. This is UI semantics — which axis
// goes on which screen direction of which handle — so it lives here, not in
// the axis library. Axis ranges (lo/hi) come from the backend library and are
// clamped there too; the numbers here are only the screen mapping.
//
// Directions are screen directions on the aligned crop: +x right, +y down.
// "Inward" for a lateral pair means toward the face's midline, so the left
// and right controls of a pair map the same gesture to opposite screen x —
// which is what makes mirroring copy values verbatim (side is semantic).

type AxisDir = { axis: string; per: number };  // weight change per +1 unit drag

interface Control {
  id: string;
  kind: "pad" | "slider";
  anchor: string;                 // key into the anchors the backend returns
  side: "L" | "R" | "C";
  label: string;
  // pad: x/y each may carry one axis per sign (one-sided axes) or one both ways
  xPos?: AxisDir; xNeg?: AxisDir; yPos?: AxisDir; yNeg?: AxisDir;
  mirror?: string;                // the control on the other side
}

// One unit of drag = the handle crossing its own radius. Weights are clamped
// to each axis's range from the library.
const CONTROLS: Control[] = [
  { id: "brow_L", kind: "pad", anchor: "brow_L", side: "L", label: "brow",
    yNeg: { axis: "au1_2_L", per: 1 },          // up = raise
    xPos: { axis: "au4_L", per: 1 },            // inward (right, for the left brow) = furrow
    mirror: "brow_R" },
  { id: "brow_R", kind: "pad", anchor: "brow_R", side: "R", label: "brow",
    yNeg: { axis: "au1_2_R", per: 1 },
    xNeg: { axis: "au4_R", per: 1 },
    mirror: "brow_L" },
  { id: "lid_L", kind: "slider", anchor: "lid_L", side: "L", label: "eyelid",
    yPos: { axis: "au45_L", per: 1 },           // down = close
    mirror: "lid_R" },
  { id: "lid_R", kind: "slider", anchor: "lid_R", side: "R", label: "eyelid",
    yPos: { axis: "au45_R", per: 1 },
    mirror: "lid_L" },
  // gaze is NOT here: it lives in the eye gizmo in the corner of the viewer,
  // because a floating pad between the eyes overlapped brows and corners.
  // The mouth corners both drive the same central axes — the latent space has
  // no honest left/right smile split (kp14 IS the right corner; the real pair
  // is 5x weaker). Two handles, one gesture: grab whichever corner is closer.
  { id: "corner_L", kind: "pad", anchor: "corner_L", side: "C", label: "smile · pucker",
    yNeg: { axis: "au12", per: 1 },             // up = smile, down = frown
    xPos: { axis: "au18", per: 1 },             // inward = pucker
    xNeg: { axis: "au20", per: 1 } },           // outward = stretch
  { id: "corner_R", kind: "pad", anchor: "corner_R", side: "C", label: "smile · pucker",
    yNeg: { axis: "au12", per: 1 },
    xNeg: { axis: "au18", per: 1 },
    xPos: { axis: "au20", per: 1 } },
  { id: "jaw", kind: "slider", anchor: "jaw", side: "C", label: "jaw",
    yPos: { axis: "au26", per: 1 } },           // down = open
];

// Rig colour convention (Maya/Blender): left blue, right red, centre yellow.
const SIDE_COLOR = { L: "#4a90ff", R: "#ff5c5c", C: "#ffd24a" } as const;
const ACTIVE_COLOR = "#ffffff";
const HANDLE_R = 17;            // handle radius, px on screen
const FINE = 0.1;               // Shift gain
const ROT_MAX = 20;
const UNDO_DEPTH = 30;

interface AxisInfo { name: string; label: string; group: string; side: string; lo: number; hi: number }

// ── the editor ─────────────────────────────────────────────────────────────

export interface FaceRigOpts {
  nodeId: string;
  json: string;
  /** Full-size source frame as a data URL, read fresh on demand. */
  frame?: () => string | null;
  /** Is an image actually wired in? Without this gate the backend's per-node
   *  cache can answer for a freshly created node whose id collides with an
   *  old one, and the editor shows a face nobody connected. */
  hasSource?: () => boolean;
  /** Read fresh per request — these are node widgets the user can change. */
  cropFactor: () => number;
  srcRatio: () => number;
  apiBase?: string;
  onChange?: (json: string) => void;
  /** "reset pose" also zeroes the preset dials, which live in node widgets. */
  onPresetsReset?: () => void;
}

export interface FaceRigMount {
  root: HTMLDivElement;
  serialise(): string;
  /** Replace the pose from outside (workflow load / configure). */
  setJson(json: string): void;
  /** The preset dials are node widgets; the host pushes their values here
   *  and the preview follows live. */
  setPresets(p: Record<string, number>): void;
  /** Ask for a fresh final render — e.g. after the image input connects. */
  retry(): void;
  /** The upstream picture changed (new file, new run): resend the frame so
   *  the backend re-prepares. Fingerprinted, so a false alarm costs nothing. */
  refreshSource(): void;
  destroy(): void;
}

export function mountFaceRig(host: HTMLElement, opts: FaceRigOpts): FaceRigMount {
  ensureNkdModalStyles();          // the shared button/slider/label classes
  const api = opts.apiBase ?? "";
  let state = deserialise(opts.json);

  // library: axis ranges. Arrives async; until then drags clamp to a
  // conservative [-1, 1]. The preset dials are native node widgets — the
  // host pushes their values in through setPresets.
  const axisInfo = new Map<string, AxisInfo>();

  let anchors: Record<string, [number, number]> = {};
  let outlines: Record<string, [number, number][]> = {};
  let frameImg: HTMLImageElement | null = null;

  // ── DOM: one column — canvas, head, presets, options, status ────────────
  const root = document.createElement("div");
  root.className = "nkd-facerig";
  root.style.cssText =
    "display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;" +
    "padding:4px 2px 12px;font:12px system-ui,sans-serif;color:#c8d0e0;";

  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "position:relative;width:100%;";
  const canvas = document.createElement("canvas");
  // No border: with box-sizing it shrinks the content box under the backing
  // store and every hit-test lands a couple of pixels off the drawing.
  canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:default;" +
    "background:#0b0d12;border-radius:6px;";
  canvasWrap.appendChild(canvas);

  // Loading overlay: preparing a photo costs seconds (engine load, detector,
  // landmarks) and an editor that sits frozen through it reads as broken.
  // Shown only when a request has been in flight for a while, so 50 ms drag
  // frames never flash it.
  if (!document.getElementById("nkd-facerig-styles")) {
    const st = document.createElement("style");
    st.id = "nkd-facerig-styles";
    st.textContent =
      ".nkd-fr-loading{position:absolute;inset:0;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:8px;background:rgba(11,13,18,0.45);" +
      "border-radius:6px;pointer-events:none;}" +
      ".nkd-fr-loading span{color:rgba(255,255,255,0.6);font-size:11px;}" +
      ".nkd-fr-dots{display:flex;gap:6px;}" +
      ".nkd-fr-dots i{width:7px;height:7px;border-radius:50%;background:#4ab4ff;" +
      "animation:nkd-fr-bounce 1.1s ease-in-out infinite;}" +
      ".nkd-fr-dots i:nth-child(2){animation-delay:0.18s}" +
      ".nkd-fr-dots i:nth-child(3){animation-delay:0.36s}" +
      "@keyframes nkd-fr-bounce{0%,80%,100%{transform:scale(0.7);opacity:0.4}" +
      "40%{transform:scale(1.15);opacity:1}}";
    document.head.appendChild(st);
  }
  const loading = document.createElement("div");
  loading.className = "nkd-fr-loading";
  loading.style.display = "none";
  loading.innerHTML = "<div class='nkd-fr-dots'><i></i><i></i><i></i></div><span>preparing…</span>";
  canvasWrap.appendChild(loading);
  let loadingTimer = 0;
  function loadingSoon() {
    if (!loadingTimer) {
      loadingTimer = window.setTimeout(() => { loading.style.display = "flex"; }, 300);
    }
  }
  function loadingDone() {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = 0; }
    loading.style.display = "none";
  }

  root.appendChild(canvasWrap);
  const ctx = canvas.getContext("2d")!;

  const optRow = document.createElement("div");
  optRow.style.cssText = "display:flex;gap:6px;";
  const mirrorBtn = nkdToggle("mirror L ↔ R", state.mirror, (on) => {
    state.mirror = on;
    commit();
  }, "Dragging a paired handle moves its twin too");
  const resetBtn = nkdButton("reset pose", () => {
    pushUndo();
    state = { w: {}, p: {}, ...structuredClone(STATE_DEFAULTS), mirror: state.mirror };
    opts.onPresetsReset?.();        // the dials are node widgets — zero them too
    drawOverlay();
    // A full commit, not a drag frame: only a "final" render re-measures the
    // anchors, and the handles must jump back with the face, not one head
    // wiggle later.
    commit();
  });
  mirrorBtn.style.flex = resetBtn.style.flex = "1 1 0";
  optRow.append(mirrorBtn, resetBtn);
  root.appendChild(optRow);

  const statusRow = document.createElement("div");
  statusRow.style.cssText = "display:flex;gap:8px;min-height:14px;font-size:11px;";
  const status = document.createElement("span");
  status.className = "nkd-modal-status";
  const warn = document.createElement("span");
  warn.className = "nkd-modal-status bad";
  const hint = document.createElement("span");
  // One line, ellipsized on narrow nodes: wrapping grew the row after the
  // height was measured and the bottom got clipped.
  hint.style.cssText = "color:rgba(255,255,255,0.3);margin-left:auto;min-width:0;" +
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  hint.title = "Shift = fine · Alt = one side · double-click = reset · Ctrl+Z = undo";
  hint.textContent = "Shift fine · Alt one side · dblclick reset · Ctrl+Z";
  statusRow.append(status, warn, hint);
  root.appendChild(statusRow);

  host.appendChild(root);

  // ── undo (Ctrl+Z while the pointer is over the editor) ──────────────────
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  function pushUndo() {
    undoStack.push(serialise(state));
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(json: string) {
    // The preset dials live in node widgets, outside the undo stack — keep
    // whatever they currently say rather than resurrecting an old mirror.
    const p = state.p;
    state = deserialise(json);
    state.p = p;
    mirrorBtn.classList.toggle("on", state.mirror);
    drawOverlay();
    commit();                       // final render -> anchors re-measured too
  }
  function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    // In-node, the editor only owns the shortcut while the mouse is on it —
    // everywhere else Ctrl+Z belongs to the graph.
    if (!root.matches(":hover")) return;
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey) {
      if (redoStack.length) { undoStack.push(serialise(state)); restore(redoStack.pop()!); }
    } else if (undoStack.length) {
      redoStack.push(serialise(state)); restore(undoStack.pop()!);
    }
  }
  window.addEventListener("keydown", onKey, true);

  // ── preview loop: one request in flight, never a queue ──────────────────
  let inflight = false;
  let wanted: "drag" | "final" | null = null;
  let firstRender = true;
  let sentCrop: number | null = null;  // crop_factor the backend prepared with
  let token = 0;

  function poseChanged() {
    drawOverlay();
    // Always render live. On a busy GPU the one-in-flight loop self-paces to
    // whatever the hardware gives — a few fps of real feedback still beats a
    // preview that plays dead until the mouse lets go. (An earlier build
    // switched to commit-only past 250 ms and it read as "the sliders are
    // broken", which is worse than honest lag.)
    requestRender("drag");
  }

  function commit() {
    opts.onChange?.(serialise(state));
    requestRender("final");
  }

  function requestRender(quality: "drag" | "final") {
    // "final" outranks "drag" if both got asked for while busy.
    wanted = wanted === "final" ? "final" : quality;
    if (inflight) return;
    void pump();
  }

  async function pump() {
    while (wanted) {
      const quality = wanted;
      wanted = null;
      if (opts.hasSource && !opts.hasSource()) {
        // Nothing wired in: show nothing, whatever the backend has cached.
        frameImg = null;
        anchors = {};
        outlines = {};
        warn.textContent = "";
        status.textContent = "";
        drawAll();
        break;
      }
      inflight = true;
      loadingSoon();
      const t0 = performance.now();
      const my = ++token;
      try {
        const crop = opts.cropFactor();
        const body: any = {
          node: opts.nodeId, rig: serialise(state), quality,
          crop_factor: crop, src_ratio: opts.srcRatio(),
        };
        // The frame rides along whenever the backend may need to (re)prepare:
        // first request of a session, or the crop_factor widget changed. It
        // fingerprints, so an unchanged picture costs nothing — and a changed
        // upstream image or crop re-prepares instead of showing a stale face.
        if (sentCrop !== crop) {
          const f = opts.frame?.();
          if (f) { body.frame = f; sentCrop = crop; }
        }
        let res = await fetch(api + "/nkd/facerig/preview", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        let data = await res.json();
        if (data.needsFrame) {
          const frame = opts.frame?.();
          if (!frame) { warn.textContent = "connect an image, then drag a handle"; break; }
          body.frame = frame;
          sentCrop = crop;
          res = await fetch(api + "/nkd/facerig/preview", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          data = await res.json();
        }
        if (data.error) { warn.textContent = data.error; break; }
        if (my !== token) continue;             // a newer render superseded this
        warn.textContent = data.warning ?? "";
        if (data.anchors && (quality === "final" || !Object.keys(anchors).length)) {
          anchors = data.anchors;
          outlines = data.outlines ?? {};
        }
        await setFrame(data.image);
        const dt = performance.now() - t0;
        // The very first round-trip pays for loading the engine and preparing
        // the photo; it says nothing about drag latency.
        if (firstRender) firstRender = false;
        status.textContent = `${dt.toFixed(0)} ms`;
      } catch (e: any) {
        warn.textContent = String(e?.message ?? e);
        break;
      } finally {
        inflight = false;
        loadingDone();
      }
    }
    inflight = false;
    loadingDone();
  }

  function setFrame(dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { frameImg = img; layout(); drawAll(); resolve(); };
      img.onerror = () => resolve();
      img.src = dataUrl;
    });
  }

  // ── canvas geometry ─────────────────────────────────────────────────────
  // The crop is square (512); the canvas is as wide as the node gives us and
  // square, HiDPI-aware. All rig math runs in normalised crop coords 0..1.
  let view = { size: 300, dpr: 1 };

  function layout() {
    const size = Math.max(64, Math.floor(root.clientWidth || host.clientWidth || 300));
    // The graph zooms the node with a CSS transform, so the canvas may be
    // *displayed* far larger than its logical size. Back it with the pixels
    // it is actually shown at (visual px × devicePixelRatio) or zooming in
    // shows a stretched, pixelated face. Capped: the source crop is 512 and
    // past ~3x the extra pixels carry nothing.
    const rectW = canvas.getBoundingClientRect().width;
    const zoom = rectW > 0 ? rectW / size : 1;
    const scale = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * zoom));
    const px = Math.round(size * scale);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
      canvas.style.height = size + "px";
    }
    view = { size, dpr: scale };
  }

  // ── the head gizmo: a sphere in the corner of the preview ───────────────
  // Relight's global-light idiom: drag inside the sphere to turn/nod, drag
  // the ring around it to tilt. Lives on the picture so the whole pose is
  // edited in one place, but pinned to a corner rather than floating over
  // somebody's hair.
  const GIZMO_R = 30;               // sphere radius, logical px
  const GIZMO_RING = 11;            // tilt ring width
  const gizmoCenter = (): [number, number] => {
    const m = GIZMO_R + GIZMO_RING + 10;
    return [view.size - m, view.size - m];
  };
  // The gaze gizmo: an eye in the opposite corner, iris = 2-DOF pad. Same
  // idiom as the head sphere — fixed, always visible, off the face.
  const GAZE_RX = 32;               // eye half-width
  const GAZE_RY = 20;               // eye half-height
  const gazeCenter = (): [number, number] =>
    [GAZE_RX + 16, view.size - GAZE_RY - 18];
  const gazeVal = (): [number, number] => [
    (state.w["au61"] ?? 0) - (state.w["au62"] ?? 0),   // +x = look right
    (state.w["au64"] ?? 0) - (state.w["au63"] ?? 0),   // +y = look down
  ];

  type GizmoZone = "sphere" | "ring" | "gaze" | null;
  function gizmoZone(x: number, y: number): GizmoZone {
    // Below this the corner gizmos would sit on top of the face handles —
    // a collapsed or tiny canvas must not turn a smile drag into a head roll.
    if (view.size < 200) return null;
    const [gx, gy] = gizmoCenter();
    const d = Math.hypot(x - gx, y - gy);
    if (d <= GIZMO_R) return "sphere";
    if (d <= GIZMO_R + GIZMO_RING + 4) return "ring";
    const [ex, ey] = gazeCenter();
    const nx = (x - ex) / (GAZE_RX + 5), ny = (y - ey) / (GAZE_RY + 6);
    if (nx * nx + ny * ny <= 1) return "gaze";
    return null;
  }
  let gizmoActive: GizmoZone = null;

  function drawGazeGizmo() {
    const [ex, ey] = gazeCenter();
    const on = gizmoActive === "gaze";
    ctx.save();
    ctx.lineWidth = 1;
    // Almond outline: two arcs corner to corner.
    ctx.fillStyle = "rgba(11,13,18,0.55)";
    ctx.strokeStyle = on ? ACTIVE_COLOR : "rgba(200,208,224,0.5)";
    ctx.beginPath();
    ctx.moveTo(ex - GAZE_RX, ey);
    ctx.quadraticCurveTo(ex, ey - GAZE_RY * 2, ex + GAZE_RX, ey);
    ctx.quadraticCurveTo(ex, ey + GAZE_RY * 2, ex - GAZE_RX, ey);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Iris + pupil at the current gaze.
    const [vx, vy] = gazeVal();
    const ix = ex + vx * (GAZE_RX - 12);
    const iy = ey + vy * (GAZE_RY - 8);
    ctx.strokeStyle = on ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = on ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.arc(ix, iy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (on || vx !== 0 || vy !== 0) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("gaze", ex - GAZE_RX, ey - GAZE_RY - 8);
    }
    ctx.restore();
  }

  function drawHeadGizmo() {
    const [gx, gy] = gizmoCenter();
    const rollRad = (state.rot[2] * Math.PI) / 180;
    ctx.save();
    ctx.lineWidth = 1;

    // Tilt ring: a dial. The tick sits at 12 o'clock and leans with the roll,
    // 1:1 in degrees, with an arc showing how far from upright it is.
    const rr = GIZMO_R + GIZMO_RING / 2 + 2;
    ctx.strokeStyle = gizmoActive === "ring" ? ACTIVE_COLOR : "rgba(200,208,224,0.45)";
    ctx.beginPath();
    ctx.arc(gx, gy, rr, 0, Math.PI * 2);
    ctx.stroke();
    if (state.rot[2] !== 0) {
      ctx.strokeStyle = SIDE_COLOR.C;
      ctx.beginPath();
      ctx.arc(gx, gy, rr, -Math.PI / 2, -Math.PI / 2 + rollRad, rollRad < 0);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const tx = gx + rr * Math.sin(rollRad), ty = gy - rr * Math.cos(rollRad);
    ctx.strokeStyle = gizmoActive === "ring" ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.moveTo(gx + (rr - 6) * Math.sin(rollRad), gy - (rr - 6) * Math.cos(rollRad));
    ctx.lineTo(gx + (rr + 6) * Math.sin(rollRad), gy - (rr + 6) * Math.cos(rollRad));
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineWidth = 1;

    // Sphere: dimmed ground, meridians hinting a ball, crosshair, and the
    // yaw/pitch box exactly like the old trackpad's.
    ctx.fillStyle = "rgba(11,13,18,0.55)";
    ctx.beginPath();
    ctx.arc(gx, gy, GIZMO_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gizmoActive === "sphere" ? ACTIVE_COLOR : "rgba(200,208,224,0.5)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,208,224,0.18)";
    ctx.beginPath();
    ctx.ellipse(gx, gy, GIZMO_R * 0.55, GIZMO_R, 0, 0, Math.PI * 2);
    ctx.moveTo(gx - GIZMO_R, gy);
    ctx.lineTo(gx + GIZMO_R, gy);
    ctx.stroke();
    const bx = gx + (state.rot[1] / ROT_MAX) * (GIZMO_R - 7);
    const by = gy + (state.rot[0] / ROT_MAX) * (GIZMO_R - 7);
    ctx.strokeStyle = gizmoActive === "sphere" ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.strokeRect(bx - 4.5, by - 4.5, 9, 9);

    // Degrees, spelled out: past ~12° the warp starts trading the picture's
    // edges for the pose, and the number is how you notice you asked for 20.
    if (gizmoActive || state.rot.some((v) => v !== 0)) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${state.rot[1].toFixed(0)}° ${state.rot[0].toFixed(0)}° ${state.rot[2].toFixed(0)}°`,
                   gx, gy - GIZMO_R - GIZMO_RING - 8);
      ctx.textAlign = "left";
    }
    ctx.restore();
  }

  const toScreen = (p: [number, number]) => [p[0] * view.size, p[1] * view.size] as [number, number];

  // Where a control's handle currently sits on screen: its anchor plus its
  // value offset (the draggable box inside the wireframe).
  function handleOffset(c: Control): [number, number] {
    const get = (d?: AxisDir) => (d ? (state.w[d.axis] ?? 0) / d.per : 0);
    let dx = 0, dy = 0;
    if (c.kind === "pad") {
      dx = get(c.xPos) - get(c.xNeg);
      dy = get(c.yPos) - get(c.yNeg);
    } else {
      dy = get(c.yPos) - get(c.yNeg);
    }
    return [dx * HANDLE_R, dy * HANDLE_R];
  }

  function handleCenter(c: Control): [number, number] | null {
    const a = anchors[c.anchor];
    if (!a) return null;
    const [ax, ay] = toScreen(a);
    const [dx, dy] = handleOffset(c);
    return [ax + dx, ay + dy];
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  let active: Control | null = null;
  let hover: Control | null = null;

  // The face handles hide until the pointer is on one — they sit on the very
  // picture being judged, and nine wireframes over a face is a fence, not a
  // rig. Each control fades in/out over FADE_MS; the head gizmo in the
  // corner is outside the face and stays.
  // setTimeout, not requestAnimationFrame: rAF stalls whenever the tab is
  // not compositing, and a stalled fade means handles that never appear.
  const FADE_MS = 100;
  const fadeA = new Map<string, number>();     // control id -> current alpha
  let fadeTimer = 0;
  let lastFadeTs = 0;
  const targetAlpha = (c: Control) =>
    active === c || (!active && hover === c) ? 1 : 0;
  function stepFade() {
    fadeTimer = 0;
    const now = performance.now();
    const dt = lastFadeTs ? now - lastFadeTs : 16;
    lastFadeTs = now;
    let busy = false;
    for (const c of CONTROLS) {
      const cur = fadeA.get(c.id) ?? 0;
      const tgt = targetAlpha(c);
      if (cur === tgt) continue;
      const step = dt / FADE_MS;
      fadeA.set(c.id, cur < tgt ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step));
      busy = true;
    }
    drawOverlay();
    if (busy) fadeTimer = window.setTimeout(stepFade, 16);
    else lastFadeTs = 0;
  }
  function kickFade() {
    if (!fadeTimer) { lastFadeTs = 0; fadeTimer = window.setTimeout(stepFade, 0); }
  }

  // Which feature outline belongs to which handle, so the person's own brow
  // or lip contour appears with its control and fades with it.
  const OUTLINE_FOR: Record<string, string[]> = {
    brow_L: ["brow_L"], brow_R: ["brow_R"],
    lid_L: ["eye_L"], lid_R: ["eye_R"],
    corner_L: ["lips"], corner_R: ["lips"], jaw: ["lips"],
  };
  function outlineAlpha(name: string): number {
    let a = 0;
    for (const c of CONTROLS) {
      if (OUTLINE_FOR[c.id]?.includes(name)) a = Math.max(a, fadeA.get(c.id) ?? 0);
    }
    return a;
  }

  function drawAll() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.size, view.size);
    if (frameImg) ctx.drawImage(frameImg, 0, 0, view.size, view.size);
    else {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("connect an image", view.size / 2, view.size / 2);
      ctx.textAlign = "left";
    }
    drawOverlay(true);
  }

  function drawOverlay(alreadyCleared = false) {
    if (!alreadyCleared) { drawAll(); return; }
    ctx.lineWidth = 1;

    // Feature outlines — the person's own brow and lips, fading in with the
    // control they belong to.
    for (const [name, pts] of Object.entries(outlines)) {
      if (!pts?.length) continue;
      const oa = outlineAlpha(name);
      if (oa <= 0.01) continue;
      const side = name.endsWith("_L") ? "L" : name.endsWith("_R") ? "R" : "C";
      ctx.globalAlpha = oa * 0.33;
      ctx.strokeStyle = SIDE_COLOR[side as keyof typeof SIDE_COLOR];
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toScreen(p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    for (const c of CONTROLS) {
      const a = anchors[c.anchor];
      if (!a) continue;
      const fa = fadeA.get(c.id) ?? 0;
      if (fa <= 0.01) continue;
      const [ax, ay] = toScreen(a);
      const isActive = active === c || (!active && hover === c);
      const color = isActive ? ACTIVE_COLOR : SIDE_COLOR[c.side];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (c.kind === "pad") {
        ctx.globalAlpha = fa * 0.9;
        ctx.beginPath();
        ctx.arc(ax, ay, HANDLE_R, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = fa * 0.9;
        ctx.beginPath();
        ctx.moveTo(ax, ay - HANDLE_R);
        ctx.lineTo(ax, ay + HANDLE_R);
        ctx.stroke();
        ctx.beginPath();                        // end caps
        ctx.moveTo(ax - 4, ay - HANDLE_R); ctx.lineTo(ax + 4, ay - HANDLE_R);
        ctx.moveTo(ax - 4, ay + HANDLE_R); ctx.lineTo(ax + 4, ay + HANDLE_R);
        ctx.stroke();
      }

      // The draggable box, offset by the current value.
      const [hx, hy] = handleCenter(c)!;
      ctx.globalAlpha = fa;
      if (c.kind === "pad") {
        ctx.strokeRect(hx - 4.5, hy - 4.5, 9, 9);
      } else {
        ctx.beginPath();                        // triangle, rig-slider style
        ctx.moveTo(hx - 5, hy);
        ctx.lineTo(hx + 4, hy - 5);
        ctx.lineTo(hx + 4, hy + 5);
        ctx.closePath();
        ctx.stroke();
      }
      if (isActive) {
        ctx.globalAlpha = fa * 0.8;
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.label, ax, ay - HANDLE_R - 6);
        ctx.textAlign = "left";
      }
    }
    ctx.globalAlpha = 1;
    if (frameImg && view.size >= 200) { drawHeadGizmo(); drawGazeGizmo(); }
  }

  // ── interaction ─────────────────────────────────────────────────────────

  function pick(x: number, y: number): Control | null {
    let best: Control | null = null;
    let bestD = 22;                             // generous grab radius
    for (const c of CONTROLS) {
      const hc = handleCenter(c);
      if (!hc) continue;
      const d = Math.hypot(hc[0] - x, hc[1] - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function clampAxis(name: string, v: number): number {
    const info = axisInfo.get(name);
    const lo = info?.lo ?? -1, hi = info?.hi ?? 1;
    return Math.max(lo, Math.min(hi, v));
  }

  function setAxis(name: string, v: number, mirrorFrom?: Control, noMirror = false) {
    v = clampAxis(name, v);
    if (v) state.w[name] = v; else delete state.w[name];
    // Semantic mirror: same axis name on the other side gets the same value —
    // the screen-direction flip is in the other control's own mapping.
    if (!noMirror && state.mirror && mirrorFrom?.mirror) {
      const twin = name.endsWith("_L") ? name.slice(0, -2) + "_R"
        : name.endsWith("_R") ? name.slice(0, -2) + "_L" : null;
      if (twin && axisInfo.has(twin)) {
        const tv = clampAxis(twin, v);
        if (tv) state.w[twin] = tv; else delete state.w[twin];
      }
    }
  }

  // The graph zooms the node with a CSS transform, so pointer coordinates
  // arrive in *visual* pixels while everything is drawn in the canvas's
  // logical pixels. Every hit-test and every drag delta must convert, or the
  // handles only line up at 100% zoom.
  const zoomScale = () => {
    const r = canvas.getBoundingClientRect();
    return r.width > 0 ? view.size / r.width : 1;
  };
  const canvasXY = (e: PointerEvent | MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const k = r.width > 0 ? view.size / r.width : 1;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };

  canvas.addEventListener("pointermove", (e) => {
    if (active || gizmoActive) return;
    const [x, y] = canvasXY(e);
    const z = frameImg ? gizmoZone(x, y) : null;
    const h = z ? null : pick(x, y);
    if (h !== hover) { hover = h; kickFade(); }
    canvas.style.cursor = z || h ? "grab" : "default";
  });

  canvas.addEventListener("pointerleave", () => {
    if (active || gizmoActive) return;
    if (hover) { hover = null; kickFade(); }
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("dblclick", (e) => {
    const [x, y] = canvasXY(e);
    const z = frameImg ? gizmoZone(x, y) : null;
    if (z) {
      pushUndo();
      if (z === "sphere") { state.rot[0] = 0; state.rot[1] = 0; }
      else if (z === "ring") state.rot[2] = 0;
      else for (const a of ["au61", "au62", "au63", "au64"]) delete state.w[a];
      poseChanged();
      commit();
      return;
    }
    const c = pick(x, y);
    if (!c) return;
    pushUndo();
    for (const d of [c.xPos, c.xNeg, c.yPos, c.yNeg]) {
      if (!d) continue;
      delete state.w[d.axis];
      if (state.mirror) {
        const twin = d.axis.endsWith("_L") ? d.axis.slice(0, -2) + "_R"
          : d.axis.endsWith("_R") ? d.axis.slice(0, -2) + "_L" : null;
        if (twin) delete state.w[twin];
      }
    }
    poseChanged();
    commit();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const [px, py] = canvasXY(e);
    const z = frameImg ? gizmoZone(px, py) : null;
    if (z) { startGizmoDrag(e, z, px, py); return; }
    const c = pick(px, py);
    if (!c) {
      // No handles yet (no source prepared)? A click is the retry button.
      if (!frameImg) requestRender("final");
      return;
    }
    e.preventDefault();
    e.stopPropagation();                        // the graph must not pan
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    active = c;
    kickFade();
    canvas.style.cursor = "grabbing";
    pushUndo();

    // Incremental scrub, the arc-gizmo doctrine: the value accumulates from
    // pointer deltas, so Shift changes the gain mid-drag without a jump.
    // Alt breaks the mirror for this drag: one raised brow, a wink.
    const k = zoomScale();
    let prevX = e.clientX, prevY = e.clientY;
    const move = (ev: PointerEvent) => {
      const gain = (ev.shiftKey ? FINE : 1) * k / HANDLE_R;
      const dx = (ev.clientX - prevX) * gain;
      const dy = (ev.clientY - prevY) * gain;
      prevX = ev.clientX; prevY = ev.clientY;
      const noMir = ev.altKey;
      const bump = (pos?: AxisDir, neg?: AxisDir, d = 0) => {
        if (!d) return;
        if (pos && neg) {
          // Two one-sided axes on one direction: drain the opposing one first.
          const cur = (state.w[pos.axis] ?? 0) - (state.w[neg.axis] ?? 0);
          const next = cur + d;
          setAxis(pos.axis, Math.max(0, next), c, noMir);
          setAxis(neg.axis, Math.max(0, -next), c, noMir);
        } else if (pos) {
          setAxis(pos.axis, (state.w[pos.axis] ?? 0) + d, c, noMir);
        } else if (neg) {
          setAxis(neg.axis, (state.w[neg.axis] ?? 0) - d, c, noMir);
        }
      };
      if (c.kind === "pad") bump(c.xPos, c.xNeg, dx);
      bump(c.yPos, c.yNeg, dy);
      poseChanged();
    };
    const up = (ev: PointerEvent) => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* gone */ }
      active = null;
      kickFade();
      canvas.style.cursor = "grab";
      commit();
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  });

  function startGizmoDrag(e: PointerEvent, zone: "sphere" | "ring" | "gaze", px: number, py: number) {
    e.preventDefault();
    e.stopPropagation();                        // the graph must not pan
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    gizmoActive = zone;
    canvas.style.cursor = "grabbing";
    pushUndo();
    const k = zoomScale();
    const [gx, gy] = gizmoCenter();
    // Sphere: 1:1 with the pointer — the gain is the inverse of how the box
    // is drawn, so it tracks the cursor instead of racing ahead of it.
    const g = ROT_MAX / (GIZMO_R - 7);
    // Ring: angular — the roll follows the pointer's angle around the centre,
    // so the tick stays under the finger like a real dial.
    let prevX = e.clientX, prevY = e.clientY;
    let prevAngle = Math.atan2(px - gx, -(py - gy));
    // gaze: the iris tracks the cursor 1:1 across its own travel; the pair
    // of one-sided axes on each direction drains the opposite side first,
    // same as a face pad.
    const drain = (pos: string, neg: string, d: number) => {
      if (!d) return;
      const cur = (state.w[pos] ?? 0) - (state.w[neg] ?? 0);
      const next = Math.max(-1, Math.min(1, cur + d));
      if (next >= 0) { state.w[pos] = next; delete state.w[neg]; }
      else { state.w[neg] = -next; delete state.w[pos]; }
      if (!state.w[pos]) delete state.w[pos];
      if (!state.w[neg]) delete state.w[neg];
    };
    const move = (ev: PointerEvent) => {
      const fine = ev.shiftKey ? FINE : 1;
      if (zone === "gaze") {
        drain("au61", "au62", (ev.clientX - prevX) * k * fine / (GAZE_RX - 12));
        drain("au64", "au63", (ev.clientY - prevY) * k * fine / (GAZE_RY - 8));
        prevX = ev.clientX; prevY = ev.clientY;
      } else if (zone === "sphere") {
        state.rot[1] = Math.max(-ROT_MAX, Math.min(ROT_MAX,
          state.rot[1] + (ev.clientX - prevX) * k * g * fine));
        state.rot[0] = Math.max(-ROT_MAX, Math.min(ROT_MAX,
          state.rot[0] + (ev.clientY - prevY) * k * g * fine));
        prevX = ev.clientX; prevY = ev.clientY;
      } else {
        const [mx, my] = canvasXY(ev);
        const angle = Math.atan2(mx - gx, -(my - gy));
        let d = angle - prevAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        prevAngle = angle;
        state.rot[2] = Math.max(-ROT_MAX, Math.min(ROT_MAX,
          state.rot[2] + (d * 180 / Math.PI) * fine));
      }
      poseChanged();
    };
    const up = (ev: PointerEvent) => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* gone */ }
      gizmoActive = null;
      canvas.style.cursor = "grab";
      commit();
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  // The container has no box until the node lays out; retry until it does.
  // ResizeObserver keeps canvas size in step with node resizes after that.
  function ensureLaidOut(tries = 0) {
    layout();
    if (view.size <= 64 && tries < 20) setTimeout(() => ensureLaidOut(tries + 1), 50);
    else drawAll();
  }
  const ro = new ResizeObserver(() => { layout(); drawAll(); });
  ro.observe(root);
  // Graph zoom is a CSS transform: it changes the *visual* size without
  // touching any layout box, so no ResizeObserver fires. A low-rate poll
  // catches it and re-backs the canvas at the new resolution.
  let lastRectW = 0;
  const zoomPoll = window.setInterval(() => {
    const w = canvas.getBoundingClientRect().width;
    if (Math.abs(w - lastRectW) > 1) {
      lastRectW = w;
      layout();
      drawAll();
    }
  }, 400);
  ensureLaidOut();

  // Boot: library for axis ranges, then the first frame.
  void fetch(api + "/nkd/facerig/library").then(async (r) => {
    const lib = await r.json();
    for (const a of lib.axes ?? []) axisInfo.set(a.name, a);
  }).catch(() => { /* editor still works, with default clamps */ });
  requestRender("final");

  // Introspection for the dev harness and for `window.NKD_DEBUG` sessions.
  (window as any).__nkdFaceRig = {
    get state() { return state; },
    get anchors() { return anchors; },
    canvas,
    handleXY: (id: string) => handleCenter(CONTROLS.find((c) => c.id === id)!),
    serialise: () => serialise(state),
  };

  return {
    root,
    serialise: () => serialise(state),
    retry: () => requestRender("final"),
    refreshSource() {
      sentCrop = null;                // forces the frame onto the next request
      requestRender("final");
    },
    setJson(json: string) {
      const p = state.p;              // the dials belong to the node widgets
      state = deserialise(json);
      state.p = p;
      mirrorBtn.classList.toggle("on", state.mirror);
      drawOverlay();
      requestRender("final");
    },
    setPresets(p: Record<string, number>) {
      state.p = p;
      poseChanged();                  // live, like dragging a handle
    },
    destroy() {
      window.removeEventListener("keydown", onKey, true);
      ro.disconnect();
      clearInterval(zoomPoll);
      if (fadeTimer) clearTimeout(fadeTimer);
      root.remove();
    },
  };
}
