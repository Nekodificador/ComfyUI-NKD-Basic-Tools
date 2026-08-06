"""😺NKD Mask Painter — paint a mask straight onto the node's own preview.

Moved here from NKD Preview Tools, which is now for viewing (popup preview,
reference, and the video/audio work to come); mask nodes live together in this
pack alongside Mask Ops.

The REST routes are namespaced /nkd/paint/* rather than the /nkd/paint/* they
used in the old pack: aiohttp refuses to register the same GET route twice, so
sharing the old paths would have broken startup for anyone who still had both
packs installed mid-migration. The node_id, the temp prefix and the backup
folder are all unchanged, so saved workflows resolve and masks already painted
survive the move.
"""
import os

import folder_paths
import numpy as np
import torch
from PIL import Image as PILImage
from aiohttp import web
from server import PromptServer

from comfy_api.latest import ComfyExtension, io
from comfy_api.latest._io import _UIOutput
from typing_extensions import override

# ── State (module-level, cleared on reload) ───────────────────────────────────
#
# Architecture mirrors Impact Pack's Preview Bridge: every save in the mask
# editor mints a new pb_id (counter-incrementing) so the `image` widget value
# changes between runs and ComfyUI's cache is invalidated naturally. The mask
# travels embedded as the alpha channel of a single RGBA PNG in temp/, indexed
# by pb_id — there is no id-mismatch failure mode.
#
# That same RGBA PNG is also used as the node thumbnail; LiteGraph renders the
# alpha as transparency (checkerboard), the same way every other Comfy preview
# surfaces masks.
#
# One extra vs. Preview Bridge: the mask is mirrored to
# input/nkd_masks/<node_id>_mask.png as a session backup, restored on the first
# execute() if the temp pb_id is gone (ComfyUI restart, temp cleanup).

_MASKS_BACKUP_SUBDIR = "nkd_masks"
_TEMP_PREFIX         = "NKDMaskPainter/NMP-"

# pb_id ("$<node_id>-<counter>") → (abs_rgba_path, rgba_item, clean_item|None)
# clean_item is the matching alpha-less PNG used for in-place Clear Mask
# refresh; it's None for entries created from clipspace (where we only get the
# RGBA back from the editor).
_pb_id_map: dict[str, tuple[str, dict, dict | None]] = {}

# (node_id, abs_path) → pb_id  — lets us reuse a pb_id when the same file is
# registered twice (e.g. clipspace round-trip).
_pb_name_map: dict[tuple, str] = {}

# node_id → (images_tensor_id, last_pb_id) — used to detect input changes
# and to know which pb_id execute() last produced.
_pb_cache: dict[str, tuple[int, str]] = {}

# Monotonic counter shared across nodes. Combined with node_id it produces
# unique pb_ids that change on every save, invalidating ComfyUI's cache.
_pb_counter = 0

# node_id → fingerprint of the last incoming `mask` input. Used to seed the
# painted canvas when a new mask arrives, then ignore identical reruns so the
# user's manual edits aren't overwritten on every queue.
_incoming_mask_fp: dict[str, tuple] = {}


# ── Mask backup helpers ───────────────────────────────────────────────────────

def _backup_dir() -> str:
    d = os.path.join(folder_paths.get_input_directory(), _MASKS_BACKUP_SUBDIR)
    os.makedirs(d, exist_ok=True)
    return d

def _backup_path(node_id: str) -> str:
    return os.path.join(_backup_dir(), f"{node_id}_mask.png")

def _save_backup(node_id: str, mask_2d: np.ndarray) -> None:
    """Persist a 2D uint8 mask (255=masked, 0=unmasked) to input/nkd_masks/."""
    PILImage.fromarray(mask_2d, "L").save(_backup_path(node_id))

def _load_backup(node_id: str) -> np.ndarray | None:
    """Return the persisted mask as 2D uint8 (255=masked) or None if missing."""
    p = _backup_path(node_id)
    if not os.path.exists(p):
        return None
    try:
        return np.array(PILImage.open(p).convert("L"), dtype=np.uint8)
    except Exception:
        return None

def _delete_backup(node_id: str) -> None:
    p = _backup_path(node_id)
    if os.path.exists(p):
        try:
            os.remove(p)
        except OSError:
            pass


# ── Mask conventions ──────────────────────────────────────────────────────────
#
# Editor PNG (RGBA) sent to / received from the native mask editor:
#   alpha=255 → not masked, alpha=0 → masked.
# ComfyUI mask tensor:
#   0.0 → not masked, 1.0 → masked.
# Backup PNG on disk (mode "L"):
#   0 → not masked, 255 → masked. (i.e. 255 - alpha)


def _mask_tensor_from_alpha(alpha_uint8: np.ndarray) -> torch.Tensor:
    """alpha_uint8 [H,W] → mask tensor [1,H,W] float32 (1.0 = masked)."""
    return torch.from_numpy(1.0 - alpha_uint8.astype(np.float32) / 255.0).unsqueeze(0)


def _mask_fingerprint(mask: torch.Tensor) -> tuple:
    """Cheap content fingerprint for a [B,H,W] or [H,W] mask tensor."""
    t = mask[0] if mask.dim() == 3 else mask
    t = t.cpu()
    h, w = int(t.shape[0]), int(t.shape[1])
    def s(y, x): return float(t[y, x])
    return (h, w,
            s(0, 0), s(0, w-1), s(h-1, 0), s(h-1, w-1), s(h//2, w//2),
            float(t.sum()))


def _alpha_from_input_mask(mask: torch.Tensor, H: int, W: int) -> np.ndarray:
    """Convert an incoming MASK tensor (1.0 = masked) into an alpha array
    matching the image size. Resamples if needed.
    """
    m = mask[0] if mask.dim() == 3 else mask
    arr = np.clip(m.cpu().numpy(), 0.0, 1.0)
    if arr.shape != (H, W):
        # PIL needs uint8 for resizing in mode "L"
        u8 = (arr * 255.0).astype(np.uint8)
        u8 = np.array(
            PILImage.fromarray(u8, "L").resize((W, H), PILImage.LANCZOS),
            dtype=np.uint8,
        )
        arr = u8.astype(np.float32) / 255.0
    return ((1.0 - arr) * 255.0).astype(np.uint8)


def _build_editor_png(image_tensor: torch.Tensor, alpha_uint8: np.ndarray | None) -> tuple[str, dict, dict, int, int]:
    """Compose two PNGs:
    - RGBA (image + mask-as-alpha): sent to the mask editor and used as the
      node thumbnail. LiteGraph renders the alpha as transparency
      (checkerboard pattern), like Preview Bridge.
    - RGB clean: same image without any alpha, used to repaint the thumbnail
      in place when the user hits Clear Mask. We persist this companion file
      because the RGBA's RGB channels can carry editor brush strokes in the
      masked-out areas (visible if alpha is forced to 255 client-side).
    Returns (rgba_path, rgba_item, clean_item, W, H).
    """
    img_np = np.clip(255.0 * image_tensor[0].cpu().numpy(), 0, 255).astype(np.uint8)
    H, W = img_np.shape[:2]

    if alpha_uint8 is None or alpha_uint8.shape != (H, W):
        alpha_uint8 = np.full((H, W), 255, dtype=np.uint8)

    rgb = PILImage.fromarray(img_np, "RGB")
    rgba = rgb.convert("RGBA")
    rgba.putalpha(PILImage.fromarray(alpha_uint8, "L"))

    full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        _TEMP_PREFIX, folder_paths.get_temp_directory(), W, H
    )
    os.makedirs(full_output_folder, exist_ok=True)

    rgba_file = f"{filename}_{counter:05}_.png"
    rgba_path = os.path.join(full_output_folder, rgba_file)
    rgba.save(rgba_path, compress_level=4)

    clean_file = f"{filename}_{counter:05}_clean_.png"
    clean_path = os.path.join(full_output_folder, clean_file)
    rgb.save(clean_path, compress_level=4)

    rgba_item  = {"filename": rgba_file,  "subfolder": subfolder, "type": "temp"}
    clean_item = {"filename": clean_file, "subfolder": subfolder, "type": "temp"}
    return rgba_path, rgba_item, clean_item, W, H


def _set_pb_image(node_id: str, path: str, item: dict, clean_item: dict | None = None) -> str:
    """Mint a new pb_id (or reuse one for the same file) and register it."""
    global _pb_counter

    key = (node_id, path)
    if key in _pb_name_map:
        existing = _pb_name_map[key]
        if existing.startswith(f"${node_id}-"):
            _pb_id_map[existing] = (path, item, clean_item)
            return existing

    _pb_counter += 1
    pb_id = f"${node_id}-{_pb_counter}"
    _pb_id_map[pb_id] = (path, item, clean_item)
    _pb_name_map[key] = pb_id
    return pb_id


def _resolve_clipspace_path(filename: str, ftype: str, subfolder: str) -> str | None:
    base = {
        "input":  folder_paths.get_input_directory(),
        "output": folder_paths.get_output_directory(),
        "temp":   folder_paths.get_temp_directory(),
    }.get(ftype)
    if not base:
        return None
    p = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
    return p if os.path.exists(p) else None

# ── REST endpoints ────────────────────────────────────────────────────────────

routes = PromptServer.instance.routes

@routes.get("/nkd/paint/set")
async def _nkd_bridge_set(request: web.Request) -> web.Response:
    """Register a clipspace file as the active editor PNG for a node and
    return a fresh pb_id. The file is the RGBA composite the mask editor
    just produced (RGB + mask-as-alpha)."""
    q = request.rel_url.query
    node_id   = q.get("node_id", "")
    filename  = q.get("filename", "")
    ftype     = q.get("type", "input")
    subfolder = q.get("subfolder", "")

    if not node_id or node_id.startswith("-") or "/" in node_id or ".." in node_id:
        return web.Response(status=400, text="Invalid node_id")

    abs_path = _resolve_clipspace_path(filename, ftype, subfolder)
    if abs_path is None:
        return web.Response(status=400, text="File not found")

    item = {"filename": filename, "subfolder": subfolder, "type": ftype}
    pb_id = _set_pb_image(node_id, abs_path, item)

    # Mirror the alpha to the persistent backup so it survives temp/ cleanup
    # and ComfyUI restarts.
    try:
        alpha = np.array(PILImage.open(abs_path).convert("RGBA").getchannel("A"), dtype=np.uint8)
        _save_backup(node_id, (255 - alpha).astype(np.uint8))
    except Exception:
        pass

    return web.Response(text=pb_id)


@routes.get("/nkd/paint/get")
async def _nkd_bridge_get(request: web.Request) -> web.Response:
    """Return metadata for a registered pb_id (the RGBA image+mask file)."""
    pb_id = request.rel_url.query.get("id", "")
    entry = _pb_id_map.get(pb_id)
    if entry is None:
        return web.Response(status=404, text="Unknown pb_id")
    path, item, _clean = entry
    if not os.path.isfile(path):
        return web.Response(status=404, text="File missing")
    return web.json_response(item)


@routes.get("/nkd/paint/reset_seed")
async def _nkd_bridge_reset_seed(request: web.Request) -> web.Response:
    """Forget the cached upstream mask fingerprint for a node so the next
    execute() treats the incoming `mask` as if it had just changed and
    applies the seed/add/subtract operation again."""
    node_id = request.rel_url.query.get("node_id", "")
    if not node_id or node_id.startswith("-"):
        return web.Response(status=400, text="Invalid node_id")
    _incoming_mask_fp.pop(node_id, None)
    return web.Response(status=200)


@routes.get("/nkd/paint/clear")
async def _nkd_bridge_clear(request: web.Request) -> web.Response:
    """Clear the painted mask AND return the alpha-less companion thumbnail
    so the client can refresh the node preview in place — no requeue needed.
    """
    node_id = request.rel_url.query.get("node_id", "")
    if not node_id or node_id.startswith("-"):
        return web.Response(status=400, text="Invalid node_id")

    # Find the most recent clean thumbnail before invalidating registrations.
    clean_item: dict | None = None
    candidate_keys = [k for k in _pb_id_map if k.startswith(f"${node_id}-")]
    # Highest counter wins → most recent.
    candidate_keys.sort(key=lambda k: int(k.rsplit("-", 1)[-1]), reverse=True)
    for k in candidate_keys:
        _, _item, _clean = _pb_id_map[k]
        if _clean is not None:
            clean_path = os.path.join(
                folder_paths.get_temp_directory(),
                _clean.get("subfolder", ""),
                _clean.get("filename", ""),
            )
            if os.path.isfile(clean_path):
                clean_item = _clean
                break

    _delete_backup(node_id)
    for k in candidate_keys:
        _pb_id_map.pop(k, None)
    for k in [k for k in _pb_name_map if k[0] == node_id]:
        _pb_name_map.pop(k, None)
    _pb_cache.pop(node_id, None)
    _incoming_mask_fp.pop(node_id, None)

    # Register the alpha-less thumbnail as the active file for this node so
    # the next mask-editor open reads a blank alpha instead of the painted PNG
    # (the editor loader resolves the widget's pb_id → filename → fetches the
    # alpha channel server-side; pointing it at the clean RGB makes alpha = 255).
    new_pb_id: str | None = None
    if clean_item is not None:
        clean_path = os.path.join(
            folder_paths.get_temp_directory(),
            clean_item.get("subfolder", ""),
            clean_item.get("filename", ""),
        )
        if os.path.isfile(clean_path):
            new_pb_id = _set_pb_image(node_id, clean_path, clean_item)

    return web.json_response({"clean": clean_item, "pb_id": new_pb_id})

# ── UI output ─────────────────────────────────────────────────────────────────

class _NKDMaskPainterUI(_UIOutput):
    def __init__(self, item: dict, pb_id: str, has_mask: bool):
        super().__init__()
        self.item = item
        self.pb_id = pb_id
        self.has_mask = has_mask

    def as_dict(self) -> dict:
        return {
            "images":       [self.item],
            "nkd_pb_id":    [self.pb_id],
            "nkd_has_mask": [self.has_mask],
        }




class NKDMaskPainter(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="NKDMaskPainter",
            display_name="😺NKD Mask Painter",
            category="😺NKD Nodes/Masking",
            description=(
                "Paint a mask on top of any procedural image using ComfyUI's native "
                "mask editor. Outputs the image, the mask and its inverse. "
                "Instantiate the node multiple times for independent masks."
            ),
            inputs=[
                io.Image.Input("images"),
                io.String.Input("image", default="", socketless=True),
                io.Combo.Input(
                    "on_image_change",
                    options=["clear_mask", "keep_mask"],
                    default="clear_mask",
                    tooltip="clear_mask: wipe the painted mask when the input image changes.\n"
                            "keep_mask: keep the painted mask even when the input image changes.",
                ),
                io.Combo.Input(
                    "mask_input_mode",
                    options=["Use as start", "Replace", "Add",
                             "Subtract", "Intersect", "Disconnected"],
                    default="Use as start",
                    tooltip=(
                        "How to combine the optional `mask` input with what you have "
                        "painted (all modes only act when the upstream content "
                        "actually changes):\n"
                        "Use as start: import the upstream mask only if nothing is painted yet. "
                        "After that your manual edits stick, even if upstream changes.\n"
                        "Replace: overwrite the painted mask with upstream every time "
                        "upstream produces a different mask.\n"
                        "Add: union — adds upstream to the painted mask. The added area "
                        "becomes part of your canvas and can be edited freely.\n"
                        "Subtract: removes the upstream mask from the painted one. "
                        "Useful to exclude regions marked by upstream.\n"
                        "Intersect: keeps only the area where both painted and upstream "
                        "masks overlap.\n"
                        "Disconnected: the input is connected but ignored."
                    ),
                ),
                io.Mask.Input(
                    "mask",
                    optional=True,
                    tooltip="Optional mask used as a starting point. When it changes, "
                            "it is imported into the editor canvas so you can modify it "
                            "by adding or erasing parts. While it stays the same, your "
                            "manual edits take precedence.",
                ),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
                io.Mask.Output("MASK"),
                io.Mask.Output("MASK (inverted)"),
            ],
            is_output_node=True,
            not_idempotent=True,
            hidden=[io.Hidden.unique_id, io.Hidden.prompt, io.Hidden.extra_pnginfo],
        )

    @classmethod
    def execute(cls, images, image, on_image_change, mask_input_mode="Use as start", mask=None):
        unique_id = str(cls.hidden.unique_id)
        H, W = int(images.shape[1]), int(images.shape[2])

        # ── Detect input changes ─────────────────────────────────────────────
        cached = _pb_cache.get(unique_id)
        images_changed = cached is None or cached[0] != id(images)

        # ── Seed from incoming `mask` input ──────────────────────────────────
        # All modes (except "Disconnected") only act when the upstream
        # fingerprint changes — so a noisy queue with identical upstream
        # never disturbs your edits.
        #
        # Use as start: import only if there's no painted mask yet.
        # Replace:      overwrite painted with upstream on every change.
        # Add:          painted ∪ upstream on every change (max).
        # Subtract:     painted \ upstream on every change (clamp).
        # Intersect:    painted ∩ upstream on every change (min).
        # Disconnected: never touch the canvas.
        seeded_alpha: np.ndarray | None = None
        if mask is not None and mask_input_mode != "Disconnected":
            fp = _mask_fingerprint(mask)
            upstream_changed = (_incoming_mask_fp.get(unique_id) != fp)

            new_alpha: np.ndarray | None = None

            if mask_input_mode == "Use as start":
                if _load_backup(unique_id) is None:
                    new_alpha = _alpha_from_input_mask(mask, H, W)

            elif mask_input_mode == "Replace":
                if upstream_changed:
                    new_alpha = _alpha_from_input_mask(mask, H, W)

            elif mask_input_mode in ("Add", "Subtract", "Intersect") and upstream_changed:
                upstream_alpha = _alpha_from_input_mask(mask, H, W)
                # Convert to mask-space (0=unmasked, 255=masked) for set ops.
                upstream_m = (255 - upstream_alpha).astype(np.uint8)
                # Current painted mask (may be empty).
                backup = _load_backup(unique_id)
                if backup is not None and backup.shape != (H, W):
                    backup = np.array(
                        PILImage.fromarray(backup, "L").resize((W, H), PILImage.LANCZOS),
                        dtype=np.uint8,
                    )
                if backup is None:
                    backup = np.zeros((H, W), dtype=np.uint8)
                if mask_input_mode == "Add":
                    merged = np.maximum(backup, upstream_m)
                elif mask_input_mode == "Subtract":
                    # keep painted, drop where upstream is set
                    merged = np.clip(backup.astype(np.int16) - upstream_m.astype(np.int16), 0, 255).astype(np.uint8)
                else:  # Intersect: keep only where both are set
                    merged = np.minimum(backup, upstream_m)
                new_alpha = (255 - merged).astype(np.uint8)

            if new_alpha is not None:
                seeded_alpha = new_alpha
                _save_backup(unique_id, (255 - new_alpha).astype(np.uint8))
                # Drop any stale registered pb_ids — their RGBA still embeds
                # the previous mask, which would override the seed below.
                for k in [k for k in _pb_id_map if k.startswith(f"${unique_id}-")]:
                    _pb_id_map.pop(k, None)
                for k in [k for k in _pb_name_map if k[0] == unique_id]:
                    _pb_name_map.pop(k, None)

            # Track fingerprint for change detection.
            _incoming_mask_fp[unique_id] = fp

        # ── Resolve the mask alpha to embed in the editor PNG ────────────────
        alpha_uint8: np.ndarray | None = seeded_alpha

        if alpha_uint8 is None and not images_changed and image and image.startswith("$") and image in _pb_id_map:
            # Reuse: the user just saved a mask in the editor, the clipspace
            # file is registered, read its alpha for both the output mask and
            # the new editor PNG we're about to build.
            editor_path, _, _ = _pb_id_map[image]
            if os.path.isfile(editor_path):
                try:
                    a = np.array(PILImage.open(editor_path).convert("RGBA").getchannel("A"), dtype=np.uint8)
                    if a.shape == (H, W):
                        alpha_uint8 = a
                    else:
                        # Editor downscaled the image; resize alpha to match.
                        alpha_uint8 = np.array(
                            PILImage.fromarray(a, "L").resize((W, H), PILImage.LANCZOS),
                            dtype=np.uint8,
                        )
                except Exception:
                    alpha_uint8 = None

        # If we did not get alpha from a registered pb_id, fall back to the
        # backup file (after a restart, or on first run with a saved mask).
        if alpha_uint8 is None:
            backup = _load_backup(unique_id)
            if backup is not None:
                if backup.shape != (H, W):
                    if images_changed and on_image_change == "clear_mask":
                        # New image, user asked to clear → drop the backup.
                        _delete_backup(unique_id)
                    else:
                        backup = np.array(
                            PILImage.fromarray(backup, "L").resize((W, H), PILImage.LANCZOS),
                            dtype=np.uint8,
                        )
                        _save_backup(unique_id, backup)
                        alpha_uint8 = (255 - backup).astype(np.uint8)
                else:
                    alpha_uint8 = (255 - backup).astype(np.uint8)

        if alpha_uint8 is None and images_changed and on_image_change == "clear_mask":
            # Brand new image and clear policy: ensure no stale backup leaks.
            _delete_backup(unique_id)

        # ── Decide whether to mint a new pb_id or reuse the inbound one ──────
        # Minting a new pb_id every execute changes the value of the `image`
        # widget on the next prompt, making ComfyUI invalidate this node's
        # cache (and everything downstream) for no real reason. To avoid that,
        # we MUST output the same pb_id that arrived as input whenever
        # nothing actually changed — the next prompt will then carry the same
        # widget value and ComfyUI will get a clean cache hit.
        #
        # We reuse the inbound pb_id when:
        #   - the image tensor is the same as last execute (id() match)
        #   - we did not seed/merge a new alpha this run (no upstream mask change)
        #   - the inbound pb_id is registered AND its file is alive on disk
        # Otherwise the alpha effectively changed → mint a fresh pb_id so
        # downstream consumers correctly invalidate.
        inbound_entry = _pb_id_map.get(image) if (image and image.startswith("$")) else None
        inbound_alive = (
            inbound_entry is not None
            and len(inbound_entry) >= 1
            and os.path.isfile(inbound_entry[0])
        )
        can_reuse = (
            not images_changed
            and seeded_alpha is None
            and inbound_alive
        )

        if can_reuse:
            path, item, clean_item = inbound_entry
            pb_id = image
        else:
            path, item, clean_item, _, _ = _build_editor_png(images, alpha_uint8)
            pb_id = _set_pb_image(unique_id, path, item, clean_item)

        _pb_cache[unique_id] = (id(images), pb_id)

        # ── Persist the backup so the mask survives temp/ cleanup ────────────
        if alpha_uint8 is not None and (alpha_uint8 < 255).any():
            _save_backup(unique_id, (255 - alpha_uint8).astype(np.uint8))

        # ── Compute output tensors ───────────────────────────────────────────
        if alpha_uint8 is None:
            mask = torch.zeros((1, H, W), dtype=torch.float32)
        else:
            mask = _mask_tensor_from_alpha(alpha_uint8)

        has_mask = bool(mask.max().item() > 0)

        return io.NodeOutput(
            images,
            mask,
            1.0 - mask,
            ui=_NKDMaskPainterUI(item, pb_id, has_mask),
        )


class NKDMaskPainterExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [NKDMaskPainter]


async def comfy_entrypoint() -> NKDMaskPainterExtension:
    return NKDMaskPainterExtension()


NODE_CLASS_MAPPINGS = {"NKDMaskPainter": NKDMaskPainter}
NODE_DISPLAY_NAME_MAPPINGS = {"NKDMaskPainter": "😺NKD Mask Painter"}
