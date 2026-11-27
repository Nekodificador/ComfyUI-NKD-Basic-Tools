/**
 * 😺NKD spline overlay — the editor mounted in the shared NKD modal chrome.
 *
 * A 320px in-node widget cannot be drawn in accurately, so all three spline
 * nodes open here instead: a button on the node, the editor filling a framed
 * panel over the graph. Chrome comes from `nkd_modal` (copied verbatim from NKD
 * VFX Tools — do not fork it).
 */
import { api } from "../../scripts/api.js";
import { openNkdModal, nkdButton, nkdToggle, nkdSlider, nkdFloat, nkdIcon, nkdSep, nkdHelp,
         type NkdModal, type NkdShortcuts } from "./nkd_modal";
import { SplineEditor, type EditorMode, type ViewMode } from "./splineEditor";

export type SplineOverlayOpts = {
  mode: EditorMode;
  title: string;
  image: CanvasImageSource | null;
  imageW: number;
  imageH: number;
  json: string;
  onChange: (json: string) => void;
  /** `save` is true only for the primary button, not Esc / ✕ / backdrop. */
  onClose: (json: string, save: boolean) => void;
  /** Backend preview: which node's cached frame, and under which key the
   *  geometry goes. Absent for Vector Mask, whose preview is client-side. */
  nodeId?: string;
  previewKind?: "field" | "path";
  previewKey?: "pins" | "paths";
  /** The node's own settings, read fresh so the preview tracks its widgets. */
  previewParams?: () => Record<string, unknown>;
  /** Write a node widget back from the editor's own controls. */
  onSetting?: (name: string, value: number) => void;
};

export type SplineOverlayHandle = {
  setImage(img: CanvasImageSource, w: number, h: number): void;
  close(): void;
};

// What the title bar no longer has room to say, for the shortcuts sheet (?).
const VIEW_KEYS: NkdShortcuts[number] = ["View", [
  ["Zoom", [], "wheel"],
  ["Pan", ["Alt"], "drag"],
  ["Fit the view", ["F"]],
  ["Cycle the backdrop", ["V"]],
  ["Hide the curves", ["H"]],
]];
const SELECT_KEYS: [string, string[], string?][] = [
  ["Box-select points", ["Shift"], "drag empty space"],
  ["Delete a point", ["Shift"], "click it"],
];
const SHORTCUTS: Record<EditorMode, NkdShortcuts> = {
  shape: [
    ["Drawing", [
      ["Add a point", [], "click"],
      ["Close the shape", [], "click the first point, or double-click empty space"],
      ["Insert a point", [], "click on the curve"],
      ["Hard corner", [], "double-click a point"],
      ["Finish the shape", ["Enter"]],
      ["Deselect", [], "click away from a finished shape"],
    ]],
    ["Feather", [
      ["Pull out a feather clone", ["Ctrl"], "drag a point"],
      ["Set how far the edge fades", [], "drag the clone"],
      ["Remove a clone", ["Shift"], "click it"],
      ["Fine slider steps", ["Shift"], "drag"],
    ]],
    ["Selection", SELECT_KEYS],
    VIEW_KEYS,
  ],
  path: [
    ["Drawing", [
      ["Draw a stroke", [], "click along the movement"],
      ["Finish the stroke", ["Enter"]],
      ["Insert a point", [], "click on the stroke"],
      ["Give a point its own speed", ["Ctrl"], "drag it"],
    ]],
    ["Selection", SELECT_KEYS],
    VIEW_KEYS,
  ],
  pin: [
    ["Pins", [
      ["Drop a pin", [], "click"],
      ["Set its blur", [], "drag the ring"],
      ["Fine blur", ["Shift"], "drag the ring"],
      ["Widen its reach", ["Ctrl"], "drag the pin"],
    ]],
    ["Selection", SELECT_KEYS],
    VIEW_KEYS,
  ],
};
const SHORT_HINT: Record<EditorMode, string> = {
  shape: "click to add points · close on the first point · ? for the shortcuts",
  path: "click to draw a stroke in the direction of movement · ? for the shortcuts",
  pin: "click to drop a pin · drag the ring to set its blur · ? for the shortcuts",
};

export function openSplineOverlay(opts: SplineOverlayOpts): SplineOverlayHandle {
  let refreshBar = () => {};

  let note = "";

  const editor = new SplineEditor({
    mode: opts.mode,
    onEdit: (json) => {
      opts.onChange(json);
      requestPreview(json);
    },
    onState: () => refreshBar(),
  });

  /**
   * Ask the backend for the real result.
   *
   * Fired on commit — the end of a drag — not on every move: this is a round
   * trip, and the vector overlay already carries the live feedback in between.
   * A token guards against a slow reply landing after a newer one.
   */
  let token = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shut = false;

  const post = (json: string, frame?: string | null) => api.fetchApi("/nkd/spline/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      node: opts.nodeId,
      kind: opts.previewKind,
      params: {
        ...(opts.previewParams?.() ?? {}),
        [opts.previewKey!]: json,
        ...(frame ? { frame } : {}),
      },
    }),
  });

  // One render in flight at a time, and the newest state always gets one. This used to be a
  // trailing debounce: every change pushed the request back, so a slider being dragged showed
  // nothing until the pointer stopped. Now the preview follows the drag at whatever rate the
  // backend can render — the request that just finished is immediately followed by the latest.
  let busy = false;
  let wanted: string | null = null;
  let queued = false;
  function requestPreview(json: string): void {
    if (shut || !opts.previewKind || !opts.previewKey || opts.nodeId == null) return;
    wanted = json;
    // Never RE-arm a pending start: re-arming on every change is the debounce all over again
    // (measured: 50 changes at 16 ms gave one render, at the very end).
    if (busy || queued) return;
    queued = true;
    timer = setTimeout(() => { queued = false; void renderWanted(); }, 30);   // coalesce one gesture's burst
  }
  async function renderWanted(): Promise<void> {
    if (shut || wanted == null) return;
    const json = wanted;
    wanted = null;
    busy = true;
    {
      const mine = ++token;
      note = "rendering…";
      refreshBar();
      try {
        let res = await post(json);
        if (mine !== token) return;
        if (res.status === 204) {
          // The backend has no frame for this node because it has never run.
          // Send it the one already on screen rather than telling the user to
          // go and queue the graph.
          const frame = editor.sourceFrame();
          if (!frame) { note = "run the graph once to preview"; return; }
          res = await post(json, frame);
          if (mine !== token) return;
        }
        const err = res.headers.get("X-NKD-Error");
        if (err) { note = `preview failed: ${err}`; return; }
        if (!res.ok) {
          note = res.status === 404
            ? "preview route missing — restart ComfyUI"
            : `preview failed (HTTP ${res.status})`;
          return;
        }
        const bitmap = await createImageBitmap(await res.blob());
        if (mine !== token) { bitmap.close?.(); return; }
        editor.preview = bitmap;
        note = "";
        editor.draw();
      } catch (e: any) {
        if (mine === token) note = `preview failed: ${e?.message ?? e}`;
      } finally {
        if (mine === token) refreshBar();
        busy = false;
        if (wanted != null) void renderWanted();
      }
    }
  }

  const modal: NkdModal = openNkdModal({
    title: opts.title,
    hint: SHORT_HINT[opts.mode],
    onClose: (reason) => {
      // Anything still being drawn becomes a real shape on the way out, so what
      // gets saved is what is on screen.
      editor.finishShape();
      const json = editor.serialise();
      editor.destroy();
      opts.onClose(json, reason === "save");
    },
  });
  // The canvas fills the editor; every control floats over its edges. What you reach for
  // WHILE drawing — the kind of curve, add or subtract, the feather — sits in a bar along the
  // bottom, next to the work. No sidebar: that is for settings you set up once, and this
  // editor has none. The footer keeps the status and Save.
  const stage = document.createElement("div");
  stage.style.cssText = "position:relative;flex:1 1 auto;min-width:0;min-height:0;";
  stage.appendChild(editor.canvas);
  modal.body.appendChild(stage);
  const leftTools: HTMLElement[] = [], rightTools: HTMLElement[] = [], barTools: HTMLElement[] = [];
  // A footer-style button, as a text button of a floating bar. Keeps its click and `.on`.
  const asText = <T extends HTMLElement>(b: T): T => { b.className = "txt"; return b; };
  // A footer-style button or toggle, turned into a round icon button for a float. It keeps
  // its own click and `.on` handling; only the look changes.
  const asIcon = <T extends HTMLElement>(b: T, icon: string): T => {
    b.classList.remove("nkd-modal-btn");
    b.innerHTML = `<i class="pi pi-${icon}"></i>`;
    return b;
  };
  editor.deserialise(opts.json);
  // Seed from the node before the first paint, so the pin gizmos show real
  // pixels and the live shader matches straight away.
  const settings = opts.previewParams?.() ?? {};
  if (Number.isFinite(Number(settings.max_blur))) editor.maxBlur = Number(settings.max_blur);
  if (Number.isFinite(Number(settings.falloff))) editor.falloff = Number(settings.falloff);
  if (Number.isFinite(Number(settings.strength))) editor.strength = Number(settings.strength);
  editor.setImage(opts.image, opts.imageW, opts.imageH);

  // Normalized coordinates survive a resize, but a change of aspect silently
  // distorts every shape — so say so rather than let it pass unnoticed.
  const savedAspect = readAspect(opts.json);
  const status = document.createElement("span");
  status.className = "nkd-modal-status";
  modal.footerLeft.appendChild(status);

  /* ── Controls ────────────────────────────────────────────────────────── */

  if (opts.mode !== "pin") {
    const setType = (t: "bezier" | "bspline") => {
      editor.newType = t;
      if (editor.activeShape) editor.setActiveProp("type", t);
      refreshBar();
    };
    const bezier = nkdButton("Bezier", () => setType("bezier"),
      "Points sit on the curve, with pen handles. Best for tracing an exact outline.");
    const bspline = nkdButton("B-spline", () => setType("bspline"),
      "Smooth with far fewer points and no handles to wrangle — the roto standard. " +
      "The points steer the curve rather than sitting on it, so it can never " +
      "overshoot, however close together you put them. Double-click a point for a " +
      "hard corner.");
    barTools.push(asText(bezier), asText(bspline));

    if (opts.mode === "shape") {
      const setOp = (o: "add" | "sub") => {
        editor.newOp = o;
        if (editor.activeShape) editor.setActiveProp("op", o);
        refreshBar();
      };
      const add = nkdButton("Add", () => setOp("add"), "This shape adds to the mask.");
      const sub = nkdButton("Subtract", () => setOp("sub"),
        "This shape cuts out of the shapes before it — the way to make a hole.");
      barTools.push(nkdSep(), asText(add), asText(sub));

      const feather = nkdSlider("Feather",
        { min: 0, max: 128, step: 0.5, value: 0, width: 200, fine: 0.05, def: 0, kit: "bar",
          format: (v) => `${v.toFixed(2)} px` },
        (v) => editor.setActiveProp("feather", v),
        "Soften this shape's edge evenly, before it is combined with the others. " +
        "Hold Shift while dragging for fine control — the radius is continuous, " +
        "so a fraction of a pixel is a real difference and not a rounding.");
      barTools.push(nkdSep(), feather);

      const fill = nkdToggle("Fill", true, (on) => { editor.showFill = on; editor.draw(); },
        "Tint the inside of each shape, so you can tell them apart.");
      rightTools.push(asIcon(fill, "circle-fill"));

      const noFeather = nkdButton("Clear feather", () => editor.clearFeather(),
        "Remove every feather clone and put all the edges back to hard. With " +
        "points box-selected it only clears those.");
      barTools.push(asText(noFeather));

      refreshBar = () => {
        const soft = editor.featherCount;
        noFeather.textContent = soft ? `Clear feather (${soft})` : "Clear feather";
        (noFeather as HTMLButtonElement).disabled = soft === 0;
        const s = editor.activeShape;
        bezier.classList.toggle("on", (s?.type ?? editor.newType) === "bezier");
        bspline.classList.toggle("on", (s?.type ?? editor.newType) === "bspline");
        add.classList.toggle("on", (s?.op ?? editor.newOp) === "add");
        sub.classList.toggle("on", (s?.op ?? editor.newOp) === "sub");
        feather.setDisabled(!s);
        if (s) feather.sync(s.feather);
        setStatus(`${editor.shapes.length} shape${editor.shapes.length === 1 ? "" : "s"}`);
      };
    } else {
      // Speed and Strength multiply, which the two bare names do not say. So the stroke's own
      // slider is named for what it belongs to and shows the distance it works out to, and the
      // global one says it is the ceiling.
      const speed = nkdSlider("Stroke speed",
        { min: 0, max: 2, step: 0.05, value: 1, width: 150, def: 1, kit: "bar",
          format: (v) => `x${v.toFixed(2)} = ${Math.round(v * editor.strength)} px` },
        (v) => editor.setActiveProp("speed", v),
        "This stroke only: how fast it moves compared with the others. It multiplies " +
        "Strength — x1 smears by the full Strength, x0.5 by half, x0 not at all. " +
        "The number after the = is the distance that works out to.");
      barTools.push(nkdSep(), speed);

      // Strength and Spread live on the node, but they decide what the strokes DO: tuning the
      // strokes without them means closing, changing the node and reopening. Mirrored here and
      // written straight back, like Field Blur's Max Blur and Falloff. Neither touches the
      // geometry, so each has to ask for a new backend preview itself.
      let spread = Number.isFinite(Number(settings.spread)) ? Number(settings.spread) : 0.15;
      let quality = Number.isFinite(Number(settings.quality)) ? Number(settings.quality) : 1;
      const setNumber = (name: "strength" | "spread" | "quality", v: number) => {
        if (name === "strength") editor.strength = v; else if (name === "spread") spread = v; else quality = v;
        opts.onSetting?.(name, v);
        // The last result stays up until the new one lands: Path Blur has no live shader to
        // fall back on (Field Blur does), so dropping it would blank the picture mid-drag.
        editor.draw();                           // the stroke gizmos are drawn from Strength
        requestPreview(editor.serialise());
        if (name === "strength") refreshBar();   // the stroke's own readout is in pixels of it
      };
      const strength = nkdSlider("Strength",
        { min: 0, max: 256, step: 1, value: editor.strength, width: 160, def: 24, kit: "bar",
          format: (v) => `${Math.round(v)} px at x1` },
        (v) => setNumber("strength", v),
        "Every stroke: how far a pixel travels where a stroke at speed x1 passes. It is the " +
        "overall amount; each stroke's own speed scales it. Very high values break the smear " +
        "into visible steps — raise Quality.");
      const spreadS = nkdSlider("Spread",
        { min: 0.02, max: 1, step: 0.01, value: spread, width: 140, def: 0.15, kit: "bar",
          format: (v) => v.toFixed(2) },
        (v) => setNumber("spread", v),
        "How far each stroke's influence reaches, as a fraction of the image. Small keeps the " +
        "blur tight around the strokes; large blends them into one smooth field.");
      const qualityS = nkdSlider("Quality",
        { min: 0.25, max: 8, step: 0.25, value: quality, width: 110, def: 1, kit: "bar",
          format: (v) => `x${v.toFixed(2)}` },
        (v) => setNumber("quality", v),
        "How many samples a long smear may use. Raise it when a strong blur shows repeated " +
        "ghost copies instead of a smooth streak. Slower the higher it goes.");
      barTools.push(nkdSep(), strength, spreadS, qualityS);

      refreshBar = () => {
        strength.sync(editor.strength);
        spreadS.sync(spread);
        qualityS.sync(quality);
        const s = editor.activeShape;
        bezier.classList.toggle("on", (s?.type ?? editor.newType) === "bezier");
        bspline.classList.toggle("on", (s?.type ?? editor.newType) === "bspline");
        speed.setDisabled(!s);
        if (s) speed.sync(s.speed);
        setStatus(`${editor.shapes.length} stroke${editor.shapes.length === 1 ? "" : "s"}`);
      };
    }

    leftTools.push(
      nkdIcon("check", "Finish: stop adding to this one; the next click starts a new one. (Enter)", () => editor.finishShape()),
      nkdIcon("times", "Delete the selected shape. (Del)", () => editor.deleteActive()));
  } else {
    // Max Blur and Falloff live on the node, but they are what pin values MEAN,
    // so tuning pins without them is guesswork — you would close, change the
    // node, reopen. They are mirrored here and written straight back.
    // These change the render without touching any geometry, so they have to
    // invalidate the backend result themselves — otherwise the stale one keeps
    // the backdrop and nothing appears to happen until a pin is nudged.
    const setNumber = (name: "max_blur" | "falloff", v: number) => {
      if (name === "max_blur") editor.maxBlur = v; else editor.falloff = v;
      opts.onSetting?.(name, v);
      editor.invalidatePreview();
      requestPreview(editor.serialise());
      refreshBar();
    };
    const maxBlur = nkdSlider("Max Blur",
      { min: 0, max: 512, step: 1, value: editor.maxBlur, width: 180, def: 48, kit: "bar",
        format: (v) => `${Math.round(v)} px` },
      (v) => setNumber("max_blur", v),
      "What a pin turned all the way up means, in pixels.");
    const falloff = nkdSlider("Falloff",
      { min: 0.5, max: 8, step: 0.1, value: editor.falloff, width: 140, def: 2, kit: "bar",
        format: (v) => v.toFixed(2) },
      (v) => setNumber("falloff", v),
      "How tightly each pin holds its own area. Raise it to stop a sharp pin " +
      "from being dragged blurry by the ones around it.");
    barTools.push(maxBlur, nkdSep(), falloff);

    refreshBar = () => {
      maxBlur.sync(editor.maxBlur);
      falloff.sync(editor.falloff);
      const n = editor.pins.length;
      setStatus(n
        ? `${n} pin${n === 1 ? "" : "s"} · up to ${Math.round(editor.maxBlur)} px`
        : "click to drop a pin");
    };
  }

  // View cycle. Vector Mask composites its matte locally so all three states are
  // live; the blurs only have a result once the backend has sent one.
  const VIEWS: ViewMode[] = opts.mode === "shape"
    ? ["result", "matte", "source"]
    : opts.mode === "pin"
      ? ["result", "field", "source"]
      : ["result", "source"];
  const VIEW_LABEL: Record<ViewMode, string> = {
    result: opts.mode === "shape" ? "View: masked" : "View: result",
    matte: "View: matte",
    field: "View: blur field",
    source: "View: original",
  };
  const viewBtn = nkdButton("", () => {
    editor.view = VIEWS[(VIEWS.indexOf(editor.view) + 1) % VIEWS.length];
    editor.refreshView();
    refreshBar();
  }, opts.mode === "shape"
    ? "Cycle the backdrop: the image with everything outside the mask dimmed, "
      + "the mask on its own, or the untouched image. (V)"
    : opts.mode === "pin"
      ? "Cycle the backdrop: the blurred result, the blur field as a grey map — "
        + "which is what shows you where the transition actually falls — or the "
        + "untouched image. (V)"
      : "Show the rendered result or the untouched image. (V)");

  const curvesBtn = nkdToggle("Curves", true, (on) => {
    editor.showCurves = on;
    editor.draw();
  }, "Show or hide the vectors. Hidden, you get the backdrop with nothing drawn "
   + "over it — the only way to judge an edge that has a control point sitting on "
   + "it. Editing still works while they are hidden. (H)");
  // Curves first, then whatever the mode added (Fill), then the backdrop and the view.
  rightTools.unshift(asIcon(curvesBtn, "eye"));
  rightTools.push(asIcon(viewBtn, "images"),
    nkdIcon("home", "Fit: reset the view. (F)", () => editor.fitView()));
  leftTools.push(nkdIcon("trash", "Clear: remove everything.", () => editor.clearAll()));

  nkdFloat(stage, "left:70px;right:70px;bottom:14px;margin:0 auto;width:fit-content;flex-wrap:wrap;justify-content:center;border-radius:20px",
    false, ...barTools);
  nkdFloat(stage, "left:14px;top:50%;transform:translateY(-50%)", true, ...leftTools);
  nkdFloat(stage, "right:14px;top:50%;transform:translateY(-50%)", true,
    ...rightTools, nkdSep(), nkdHelp(modal, stage, SHORTCUTS[opts.mode]));

  window.addEventListener("keydown", onViewKey, true);
  function onViewKey(e: KeyboardEvent): void {
    if (!editor.canvas.isConnected) return;
    if (e.key === "h" || e.key === "H") { curvesBtn.click(); return; }
    if (e.key === "v" || e.key === "V") viewBtn.click();
  }

  function setStatus(text: string): void {
    // The button is an icon now, so the status line says which backdrop is showing.
    viewBtn.classList.toggle("on", editor.view !== "source");
    text = `${text} · ${VIEW_LABEL[editor.view]}`;
    const picked = editor.selectionSize
      ? ` · ${editor.selectionSize} point${editor.selectionSize === 1 ? "" : "s"} selected`
      : "";
    const mismatch = savedAspect != null && Math.abs(savedAspect - editor.aspect) > 0.01;
    const warn = mismatch
      ? ` — drawn at a different aspect ratio (${savedAspect!.toFixed(2)} vs ` +
        `${editor.aspect.toFixed(2)}); shapes are stretched`
      : "";
    status.textContent = text + picked + warn + (note ? ` — ${note}` : "");
    status.classList.toggle("bad", mismatch || note.startsWith("preview failed"));
  }

  // After mount, so the Teleport-style ordering convention holds: the primary
  // action is always the last thing in the footer.
  modal.addPrimary("Save & close");
  refreshBar();
  requestAnimationFrame(() => {
    editor.fitView();
    editor.refreshView();
    requestPreview(editor.serialise());        // show the result straight away
  });

  const origClose = modal.close;
  modal.close = (reason) => {
    window.removeEventListener("keydown", onViewKey, true);
    // Closing settles the shape being drawn, which counts as an edit and would
    // otherwise schedule a preview nobody is left to look at.
    shut = true;
    clearTimeout(timer);
    token++;                                   // orphan any reply still in flight
    origClose(reason);
  };

  return {
    setImage(img, w, h) {
      editor.setImage(img, w, h);
      requestPreview(editor.serialise());
      refreshBar();
    },
    close: () => modal.close("dismiss"),
  };
}

function readAspect(json: string): number | null {
  try {
    const a = Number(JSON.parse(json || "{}")?.aspect);
    return Number.isFinite(a) && a > 0 ? a : null;
  } catch {
    return null;
  }
}
