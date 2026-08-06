import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "NKDMaskPainter";
const _MASK_COLOR    = "#1e3a1e";
const _MASK_BG_COLOR = "#0f1f0f";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileItem(baseType, path) {
    try {
        let pathType = baseType;
        if (path.endsWith("[output]")) { pathType = "output"; path = path.slice(0, -9); }
        else if (path.endsWith("[input]"))  { pathType = "input";  path = path.slice(0, -8); }
        else if (path.endsWith("[temp]"))   { pathType = "temp";   path = path.slice(0, -7); }
        const slash = path.lastIndexOf("/");
        return {
            filename:  slash >= 0 ? path.slice(slash + 1) : path,
            subfolder: slash >= 0 ? path.slice(0, slash)  : "",
            type:      pathType,
        };
    } catch (_) { return null; }
}

async function registerClipspacePath(nodeId, clipspacePath) {
    const item = getFileItem("temp", clipspacePath);
    if (!item) return `$${nodeId}-0`;
    const params = new URLSearchParams({
        node_id:   String(nodeId),
        filename:  item.filename,
        type:      item.type,
        subfolder: item.subfolder,
    });
    try {
        const res = await api.fetchApi(`/nkd/paint/set?${params}`, { cache: "no-store" });
        if (res.ok) return await res.text();
    } catch (_) {}
    return `$${nodeId}-0`;
}

async function loadImageFromId(image, v) {
    try {
        const res = await api.fetchApi(
            `/nkd/paint/get?id=${encodeURIComponent(v)}`,
            { cache: "no-store" }
        );
        if (res.ok) {
            const item = await res.json();
            const p = new URLSearchParams({
                filename:  item.filename,
                type:      item.type,
                subfolder: item.subfolder ?? "",
                t:         Date.now(),
            });
            image.src = api.apiURL(`/view?${p}`);
            return true;
        }
    } catch (_) {}
    return false;
}

// Queue a single node by intercepting api.queuePrompt for one call and
// filtering the serialised graph down to that node + its upstream deps.
async function _queueNode(node) {
    // Capture the original method reference (not a bound copy) so we can
    // restore it and still invoke it with the right receiver via .call().
    const origApiQueue = api.queuePrompt;
    try {
        api.queuePrompt = async function (index, prompt) {
            api.queuePrompt = origApiQueue;
            if (prompt?.output) {
                const filtered = {};
                _collectUpstream(String(node.id), prompt.output, filtered);
                prompt = { ...prompt, output: filtered };
            }
            return origApiQueue.call(api, index, prompt);
        };
        await app.queuePrompt(0, 1);
    } catch (err) {
        api.queuePrompt = origApiQueue;
        console.error("NKD MaskPainter queue error:", err);
        app.extensionManager?.toast?.add?.({
            severity: "error",
            summary: "Queue Failed",
            detail: String(err),
            life: 6000,
        });
    }
}

function _collectUpstream(nodeId, allOutput, result) {
    if (result[nodeId] || !allOutput[nodeId]) return;
    result[nodeId] = allOutput[nodeId];
    for (const inputVal of Object.values(allOutput[nodeId].inputs ?? {})) {
        if (Array.isArray(inputVal)) _collectUpstream(String(inputVal[0]), allOutput, result);
    }
}

function _updateMaskStatus(node, hasMask) {
    node._nkdHasMask = hasMask;
    if (hasMask) {
        node.color   = _MASK_COLOR;
        node.bgcolor = _MASK_BG_COLOR;
    } else {
        delete node.color;
        delete node.bgcolor;
    }
    node.setDirtyCanvas?.(true, false);
}

// ── Per-node setup ────────────────────────────────────────────────────────────

function setupMaskPainterNode(node) {
    const w = node.widgets?.find(obj => obj.name === "image");
    if (!w) return;

    // Hide the tracking widget
    w.type = "hidden";
    w.computeSize = () => [0, -4];

    // Initial node thumbnail slot
    node._imgs = [new Image()];
    node.imageIndex = 0;

    // Suppress the default onExecuted handler — it would clobber our thumbnail
    // with the raw RGBA editor PNG (showing checkerboard where mask is opaque).
    node.onExecuted = function () {};

    // Re-apply mask color on every draw so themes/extensions can't overwrite it
    const _origDrawBackground = node.onDrawBackground;
    node.onDrawBackground = function (ctx, canvas) {
        _origDrawBackground?.call(this, ctx, canvas);
        if (node._nkdHasMask) {
            if (node.color   !== _MASK_COLOR)    node.color   = _MASK_COLOR;
            if (node.bgcolor !== _MASK_BG_COLOR) node.bgcolor = _MASK_BG_COLOR;
        }
    };

    // ── w.value: pb_id when starts with "$", else clipspace path ─────────────
    Object.defineProperty(w, "value", {
        async set(v) {
            if (w._lock) return;

            // Ignore reads-as-writes coming from other extensions during
            // graphToPrompt serialisation (matches Preview Bridge's behaviour).
            const stack = new Error().stack ?? "";
            if (stack.includes("presetText.js")) return;

            const image = new Image();
            if (typeof v === "string" && v.startsWith("$")) {
                // pb_id from a previous save or from the workflow JSON
                const needToLoad = !node._imgs[0]?.src;
                if (await loadImageFromId(image, v)) {
                    w._value = v;
                    if (needToLoad) {
                        node._imgs = [image];
                        node.setDirtyCanvas?.(true, false);
                    }
                } else {
                    // Stale id (temp file gone after restart) — reset to a
                    // sentinel that execute() will replace with a fresh pb_id.
                    w._value = `$${node.id}-0`;
                }
            } else if (v) {
                // Clipspace path emitted by node.imgs setter after pasteFromClipspace
                w._lock = true;
                try {
                    w._value = await registerClipspacePath(node.id, v);
                } finally {
                    w._lock = false;
                }
            } else {
                w._value = "";
            }
        },
        get() {
            if (w._value === undefined || w._value === null) {
                w._value = node.id != null && node.id >= 0 ? `$${node.id}-0` : "";
            }
            return w._value;
        },
        configurable: true,
    });

    // ── node.imgs: detect pasteFromClipspace and route to w.value ────────────
    Object.defineProperty(node, "imgs", {
        set(v) {
            if (!v || v.length === 0) {
                node._imgs = v || [];
                return;
            }
            const stack = new Error().stack ?? "";
            if (stack.includes("pasteFromClipspace")) {
                try {
                    const sp = new URLSearchParams(v[0].src.split("?")[1]);
                    let str = "";
                    if (sp.get("subfolder")) str += sp.get("subfolder") + "/";
                    str += `${sp.get("filename")} [${sp.get("type")}]`;
                    w.value = str; // triggers /bridge/set, mints new pb_id
                } catch (_) {}
            }
            node._imgs = v;
        },
        get() { return node._imgs; },
        configurable: true,
    });

    // ── Action handlers ──────────────────────────────────────────────────────

    function actionEdit() {
        if (!node._imgs?.[0]?.src) {
            app.extensionManager?.toast?.add?.({
                severity: "warn",
                summary:  "No image",
                detail:   "Run the node first to load the image.",
                life:     5000,
            });
            return;
        }
        const copy = app.copyToClipspace ? (...a) => app.copyToClipspace(...a) : app.constructor?.copyToClipspace;
        const open = app.openMaskeditor  ? (...a) => app.openMaskeditor(...a)  : app.constructor?.open_maskeditor;
        if (!copy || !open) {
            app.extensionManager?.toast?.add?.({
                severity: "error",
                summary:  "Editor unavailable",
                detail:   "The native mask editor is not available in this ComfyUI version.",
                life:     5000,
            });
            return;
        }
        // The mask editor reuses any clipspace-mask/clipspace-paint files left
        // over from a prior session. Wipe the clipspace before copying so the
        // editor starts fresh from this node's current image.
        if (app.constructor) app.constructor.clipspace = null;
        app.clipspace = null;
        copy(node);
        if (app.constructor) app.constructor.clipspace_return_node = node;
        app.clipspace_return_node = node;
        open();
    }

    async function actionClear() {
        if (node.id == null || node.id < 0) return;
        // Instant visual feedback; thumbnail refreshes once backend responds.
        _updateMaskStatus(node, false);
        node.setDirtyCanvas?.(true, false);

        let payload = null;
        try {
            const res = await api.fetchApi(
                `/nkd/paint/clear?node_id=${encodeURIComponent(String(node.id))}`,
                { cache: "no-store" }
            );
            if (res.ok) payload = await res.json();
        } catch (_) {}

        // Point the widget at the new clean pb_id so the mask editor's loader
        // resolves it to an alpha-less file and opens with a blank mask.
        // Bypass the value setter (which would refetch) — _value is the
        // actual storage and matches what the setter would have written.
        const newPbId = payload?.pb_id ?? `$${node.id}-0`;
        w._value = newPbId;

        const clean = payload?.clean;
        if (clean?.filename) {
            const p = new URLSearchParams({
                filename:  clean.filename,
                type:      clean.type,
                subfolder: clean.subfolder ?? "",
                t:         Date.now(),
            });
            const img = new Image();
            img.onload = () => {
                node._imgs = [img];
                node.setDirtyCanvas?.(true, false);
            };
            img.src = api.apiURL(`/view?${p}`);
        }

        // Re-execute the node so downstream consumers receive the cleared mask.
        // Without this, the executor's cache keeps serving the previously
        // painted output until the user manually queues again.
        _queueNode(node);
    }

    async function actionReseed() {
        // Forget the cached upstream fingerprint so the next time this node
        // executes it treats the incoming mask as changed and re-applies the
        // seed/add/subtract operation. We do NOT trigger a queue ourselves —
        // ComfyUI only exposes "queue the whole graph", which is wasteful here.
        //
        // To make the next manual Run actually re-execute the node, we also
        // bump the widget value so the cache signature changes. Upstream
        // nodes stay cached (their inputs didn't change) so only this node
        // and downstream consumers run.
        if (node.id == null || node.id < 0) return;
        try {
            await api.fetchApi(
                `/nkd/paint/reset_seed?node_id=${encodeURIComponent(String(node.id))}`,
                { cache: "no-store" }
            );
        } catch (_) {}
        // Append a counter suffix to invalidate the cache on next run.
        const base = `$${node.id}`;
        const tick = Date.now();
        w._value = `${base}-r${tick}`;
        node.setDirtyCanvas?.(true, false);
        app.extensionManager?.toast?.add?.({
            severity: "info",
            summary:  "Reseed armed",
            detail:   "Press Run to re-apply the upstream mask.",
            life:     3000,
        });
    }

    // ── Custom row widget: three buttons side by side ────────────────────────
    // LiteGraph has no native multi-button widget. We draw three buttons
    // horizontally on a single canvas widget and route clicks via the
    // pointerdown event. Pattern adapted from rgthree's RgthreeBetterButtonWidget.
    const buttons = [
        { label: "Edit",   action: actionEdit   },
        { label: "Clear",  action: actionClear  },
        { label: "Reseed", action: actionReseed },
    ];

    const rowWidget = {
        type: "custom",
        name: "nkd_buttons",
        value: null,
        options: { serialize: false },
        last_y: 0,
        _hover: -1,
        _down:  -1,
        computeSize(width) {
            return [width, 30];
        },
        _layout(widgetWidth) {
            const margin = 12;
            const gap = 6;
            const innerW = widgetWidth - margin * 2;
            const btnW = (innerW - gap * (buttons.length - 1)) / buttons.length;
            return { margin, gap, btnW };
        },
        draw(ctx, _node, widgetWidth, widgetY, height) {
            this.last_y = widgetY;
            const { margin, gap, btnW } = this._layout(widgetWidth);
            const btnH = height - 4;
            const y = widgetY + 2;
            ctx.save();
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < buttons.length; i++) {
                const x = margin + i * (btnW + gap);
                const active = (i === this._down) || (i === this._hover);
                ctx.fillStyle   = active ? "#3a3a3a" : "#2a2a2a";
                ctx.strokeStyle = "#1a1a1a";
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x, y, btnW, btnH, 4);
                else ctx.rect(x, y, btnW, btnH);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#dcdcdc";
                ctx.fillText(buttons[i].label, x + btnW / 2, y + btnH / 2);
            }
            ctx.restore();
        },
        mouse(event, pos, ownerNode) {
            const widgetWidth = ownerNode.size[0];
            const { margin, gap, btnW } = this._layout(widgetWidth);
            const x = pos[0];
            // pos[1] is relative to the node origin, not to the widget — so
            // compute y relative to last_y (set in draw()).
            const yRel = pos[1] - this.last_y;
            const inRow = yRel >= 0 && yRel <= 30;

            let hit = -1;
            if (inRow) {
                for (let i = 0; i < buttons.length; i++) {
                    const bx = margin + i * (btnW + gap);
                    if (x >= bx && x <= bx + btnW) { hit = i; break; }
                }
            }

            const t = event.type;
            if (t === "pointerdown" || t === "mousedown") {
                if (hit >= 0) {
                    this._down = hit;
                    ownerNode.setDirtyCanvas?.(true, false);
                    return true;
                }
                return false;
            }
            if (t === "pointerup" || t === "mouseup") {
                const wasDown = this._down;
                this._down = -1;
                ownerNode.setDirtyCanvas?.(true, false);
                if (wasDown >= 0 && wasDown === hit) {
                    buttons[hit].action();
                    return true;
                }
                return false;
            }
            if (t === "pointermove" || t === "mousemove") {
                if (hit !== this._hover) {
                    this._hover = hit;
                    ownerNode.setDirtyCanvas?.(true, false);
                }
                return false;
            }
            return false;
        },
    };
    node.addCustomWidget(rowWidget);
}


// ── Global "executed" listener ────────────────────────────────────────────────

api.addEventListener("executed", ({ detail }) => {
    if (!detail?.output) return;
    const node = app.graph?.getNodeById?.(detail.node);
    if (!node || node.comfyClass !== NODE_TYPE) return;

    const out = detail.output;
    if (!("nkd_pb_id" in out)) return;

    const w = node.widgets?.find(obj => obj.name === "image");
    const pb_id  = Array.isArray(out.nkd_pb_id)   ? out.nkd_pb_id[0]   : out.nkd_pb_id;
    const hasMask = Array.isArray(out.nkd_has_mask) ? !!out.nkd_has_mask[0] : !!out.nkd_has_mask;

    // The default onExecuted is suppressed; update the thumbnail ourselves
    // from the RGB thumb image emitted by the backend. To avoid a flicker on
    // cached re-runs (where the file is identical), check whether the new
    // file matches what's already loaded and skip if so.
    if (out.images?.length) {
        const item = out.images[0];
        let currentFilename = "";
        try {
            const u = new URL(node._imgs?.[0]?.src ?? "", window.location.href);
            currentFilename = u.searchParams.get("filename") ?? "";
        } catch (_) {}

        if (currentFilename !== item.filename) {
            // File actually changed (different filename or first run) — load fresh.
            const p = new URLSearchParams({
                filename:  item.filename,
                type:      item.type,
                subfolder: item.subfolder ?? "",
            });
            const img = new Image();
            img.src = api.apiURL(`/view?${p}`);
            node._imgs = [img];
            node.imageIndex = 0;
            node.setDirtyCanvas?.(true, false);
        }
        // Otherwise: same file, keep the existing Image object — no flicker.
    }

    // Store pb_id without re-triggering the value setter (which would refetch)
    if (w && pb_id) w._value = pb_id;

    _updateMaskStatus(node, hasMask);
});


// ── Extension registration ────────────────────────────────────────────────────

app.registerExtension({
    name: "NKD.MaskPainter",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE) return;
        setupMaskPainterNode(node);
    },
});
