/**
 * 😺NKD spline overlay — the editor mounted in the shared NKD modal chrome.
 *
 * A 320px in-node widget cannot be drawn in accurately, so all three spline
 * nodes open here instead: a button on the node, the editor filling a framed
 * panel over the graph. Chrome comes from `nkd_modal` (copied verbatim from NKD
 * VFX Tools — do not fork it).
 */
import { api } from "../../scripts/api.js";
import { openNkdModal, nkdButton, nkdToggle, nkdSlider, type NkdModal } from "./nkd_modal";
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

const HINTS: Record<EditorMode, string> = {
  shape: "click to add points · click the first point or double-click empty space to close · " +
         "click on the curve to insert a point · " +
         "double-click a point for a corner · ctrl-drag a point to pull out a feather clone, " +
         "then drag the clone to say how far the edge fades (shift-click it to remove) · " +
         "shift-drag empty space to box-select · shift-click to delete · " +
         "click away from a finished shape to deselect it · " +
         "H hides the curves · alt-drag pans · wheel zooms",
  path: "click to draw a stroke in the direction of movement · Enter finishes it · " +
        "click on the stroke to insert a point · ctrl-drag a point for its own speed · " +
        "shift-drag empty space to box-select · H hides the curves · " +
        "alt-drag pans · wheel zooms",
  pin: "click to drop a pin · drag the ring to set its blur (shift for fine) · " +
       "ctrl-drag a pin to widen its reach · shift-drag empty space to box-select · " +
       "shift-click to delete · H hides the pins · alt-drag pans · wheel zooms",
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

  function requestPreview(json: string): void {
    if (shut || !opts.previewKind || !opts.previewKey || opts.nodeId == null) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
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
      }
    }, 160);
  }

  const modal: NkdModal = openNkdModal({
    title: opts.title,
    hint: HINTS[opts.mode],
    onClose: (reason) => {
      // Anything still being drawn becomes a real shape on the way out, so what
      // gets saved is what is on screen.
      editor.finishShape();
      const json = editor.serialise();
      editor.destroy();
      opts.onClose(json, reason === "save");
    },
  });
  modal.body.appendChild(editor.canvas);
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

  const right = modal.footerRight;

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
    right.append(bezier, bspline);

    if (opts.mode === "shape") {
      const setOp = (o: "add" | "sub") => {
        editor.newOp = o;
        if (editor.activeShape) editor.setActiveProp("op", o);
        refreshBar();
      };
      const add = nkdButton("Add", () => setOp("add"), "This shape adds to the mask.");
      const sub = nkdButton("Subtract", () => setOp("sub"),
        "This shape cuts out of the shapes before it — the way to make a hole.");
      right.append(add, sub);

      const feather = nkdSlider("Feather",
        { min: 0, max: 128, step: 0.5, value: 0, width: 220, fine: 0.05,
          format: (v) => `${v.toFixed(2)} px` },
        (v) => editor.setActiveProp("feather", v),
        "Soften this shape's edge evenly, before it is combined with the others. " +
        "Hold Shift while dragging for fine control — the radius is continuous, " +
        "so a fraction of a pixel is a real difference and not a rounding.");
      right.appendChild(feather);

      const fill = nkdToggle("Fill", true, (on) => { editor.showFill = on; editor.draw(); },
        "Tint the inside of each shape, so you can tell them apart.");
      right.appendChild(fill);

      const noFeather = nkdButton("Clear feather", () => editor.clearFeather(),
        "Remove every feather clone and put all the edges back to hard. With " +
        "points box-selected it only clears those.");
      right.appendChild(noFeather);

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
      const speed = nkdSlider("Speed",
        { min: 0, max: 2, step: 0.05, value: 1, width: 180,
          format: (v) => `x${v.toFixed(2)}` },
        (v) => editor.setActiveProp("speed", v),
        "How fast this stroke moves, relative to the others. The node's Strength " +
        "sets what full speed means in pixels.");
      right.appendChild(speed);

      refreshBar = () => {
        const s = editor.activeShape;
        bezier.classList.toggle("on", (s?.type ?? editor.newType) === "bezier");
        bspline.classList.toggle("on", (s?.type ?? editor.newType) === "bspline");
        speed.setDisabled(!s);
        if (s) speed.sync(s.speed);
        setStatus(`${editor.shapes.length} stroke${editor.shapes.length === 1 ? "" : "s"}`);
      };
    }

    right.appendChild(nkdButton("Finish", () => editor.finishShape(),
      "Stop adding to this one; the next click starts a new one. (Enter)"));
    right.appendChild(nkdButton("Delete", () => editor.deleteActive(),
      "Delete the selected shape. (Del)"));
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
      { min: 0, max: 512, step: 1, value: editor.maxBlur, width: 180,
        format: (v) => `${Math.round(v)} px` },
      (v) => setNumber("max_blur", v),
      "What a pin turned all the way up means, in pixels.");
    const falloff = nkdSlider("Falloff",
      { min: 0.5, max: 8, step: 0.1, value: editor.falloff, width: 140,
        format: (v) => v.toFixed(2) },
      (v) => setNumber("falloff", v),
      "How tightly each pin holds its own area. Raise it to stop a sharp pin " +
      "from being dragged blurry by the ones around it.");
    right.append(maxBlur, falloff);

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
  right.appendChild(viewBtn);

  const curvesBtn = nkdToggle("Curves", true, (on) => {
    editor.showCurves = on;
    editor.draw();
  }, "Show or hide the vectors. Hidden, you get the backdrop with nothing drawn "
   + "over it — the only way to judge an edge that has a control point sitting on "
   + "it. Editing still works while they are hidden. (H)");
  right.appendChild(curvesBtn);

  right.appendChild(nkdButton("Clear", () => editor.clearAll(), "Remove everything."));
  right.appendChild(nkdButton("Fit", () => editor.fitView(), "Reset the view. (F)"));

  window.addEventListener("keydown", onViewKey, true);
  function onViewKey(e: KeyboardEvent): void {
    if (!editor.canvas.isConnected) return;
    if (e.key === "h" || e.key === "H") { curvesBtn.click(); return; }
    if (e.key === "v" || e.key === "V") viewBtn.click();
  }

  function setStatus(text: string): void {
    viewBtn.textContent = VIEW_LABEL[editor.view];
    viewBtn.classList.toggle("on", editor.view !== "source");
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
