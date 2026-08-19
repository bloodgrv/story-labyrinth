import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import type { Router } from "express";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import {
    createFolder,
    listFolders,
    moveFolder,
    renameFolder,
    reorderFolders
} from "../services/folderService.js";

export default createCrudRouter({
    table: schema.orgFolders,
    name: "Folder",
    softDelete: true,
    customRoutes: (router: Router, { asyncHandler }) => {
        // GET /folders?kind=lorebook&scopeId=X&category=Y  (or ?kind=chat&scopeId=X&chatType=Y)
        router.get(
            "/",
            asyncHandler(async (req, res) => {
                const { kind, scopeId, category, chatType } = req.query as {
                    kind?: string;
                    scopeId?: string;
                    category?: string;
                    chatType?: string;
                };
                if (kind !== "lorebook" && kind !== "chat" && kind !== "notes") {
                    res.status(400).json({ error: "kind must be 'lorebook', 'chat', or 'notes'" });
                    return;
                }
                if (!scopeId) {
                    res.status(400).json({ error: "scopeId is required" });
                    return;
                }
                const folders = await listFolders({ kind, scopeId, category, chatType });
                res.json(folders);
            })
        );

        // Overrides the generic POST / — needs depth + scope/kind validation (folderService.ts),
        // not a raw insert. Validation errors are user mistakes (invalid nesting, wrong scope),
        // so they come back as 400s, not 500s — same convention as server/routes/storyGraph.ts.
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const { kind, level, scopeId, category, chatType, parentId, name } = req.body as {
                    kind?: "lorebook" | "chat" | "notes";
                    level?: "series" | "story" | null;
                    scopeId?: string;
                    category?: string | null;
                    chatType?: string | null;
                    parentId?: string | null;
                    name?: string;
                };
                if (!kind || !scopeId || !name) {
                    res.status(400).json({ error: "kind, scopeId, and name are required" });
                    return;
                }
                const [error, created] = await attemptPromise(() =>
                    createFolder({ kind, level, scopeId, category, chatType, parentId, name })
                );
                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }
                res.status(201).json(created);
            })
        );

        // Overrides the generic PUT /:id — rename and/or move (reparent), each independently
        // optional so a single request can do either or both.
        router.put(
            "/:id",
            asyncHandler(async (req, res) => {
                const { name, parentId, order } = req.body as { name?: string; parentId?: string | null; order?: number };
                const [error, result] = await attemptPromise(async () => {
                    let latest = null;
                    if (name !== undefined) latest = await renameFolder(req.params.id, name);
                    if (parentId !== undefined || order !== undefined) latest = await moveFolder(req.params.id, { parentId, order });
                    if (latest) return latest;
                    const [current] = await db.select().from(schema.orgFolders).where(eq(schema.orgFolders.id, req.params.id));
                    return current ?? null;
                });
                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }
                if (!result) {
                    res.status(404).json({ error: "Folder not found" });
                    return;
                }
                res.json(result);
            })
        );

        // Bulk reorder/reparent — same shape as outline.ts's PATCH /reorder.
        router.patch(
            "/reorder",
            asyncHandler(async (req, res) => {
                const { updates } = req.body as { updates?: Array<{ id: string; order: number; parentId?: string | null }> };
                if (!Array.isArray(updates)) {
                    res.status(400).json({ error: "updates array is required" });
                    return;
                }
                const [error] = await attemptPromise(() => reorderFolders(updates));
                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }
                res.json({ success: true });
            })
        );

        // Overrides the generic DELETE /:id — moves the folder to Trash instead of deleting it.
        // Real reparent-children-then-delete (deleteFolder) only runs at purge time; while
        // trashed, children keep pointing at this folder's id (see schema.ts's orgFolders.deletedAt
        // comment) rather than being reparented early.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(schema.orgFolders).set({ deletedAt: new Date() }).where(eq(schema.orgFolders.id, req.params.id));
                res.json({ success: true });
            })
        );
    }
});
