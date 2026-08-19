import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { listTrash, purgeTrashedEntity, restoreTrashedEntity } from "../lib/trash.js";

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the aggregate review surface
// across every entity in the TRASHABLE_ENTITIES registry. Mounted at /api/trash, editor-level
// auth (requireAuth + blockViewerMutations, already applied globally in server/index.ts).
const router = express.Router();

// GET /api/trash — everything currently trashed, newest-deleted first.
router.get("/", async (_req, res) => {
    const [error, result] = await attemptPromise(() => listTrash());
    if (error) {
        res.status(500).json({ error: "Failed to load trash", details: error.message });
        return;
    }
    res.json(result);
});

// POST /api/trash/:type/:id/restore — clears deletedAt and re-indexes if applicable.
router.post("/:type/:id/restore", async (req, res) => {
    const [error, restored] = await attemptPromise(() => restoreTrashedEntity(req.params.type, req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to restore item", details: error.message });
        return;
    }
    if (!restored) {
        res.status(404).json({ error: "Item not found in Trash" });
        return;
    }
    res.json({ success: true });
});

// DELETE /api/trash/:type/:id — "Delete forever", calls the entity's real purge immediately.
router.delete("/:type/:id", async (req, res) => {
    const [error, purged] = await attemptPromise(() => purgeTrashedEntity(req.params.type, req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to permanently delete item", details: error.message });
        return;
    }
    if (!purged) {
        res.status(404).json({ error: "Item not found in Trash" });
        return;
    }
    res.json({ success: true });
});

export default router;
