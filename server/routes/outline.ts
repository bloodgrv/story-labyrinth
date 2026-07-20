import { attemptPromise } from "@jfdi/attempt";
import { and, eq, inArray } from "drizzle-orm";
import type { OutlineReorderUpdate } from "../../src/types/outline.js";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { getCharacterArc } from "../services/outlineArcService.js";
import { generateOutlineSuggestions } from "../services/outlineGenerator.js";
import { indexOutlineItem, removeEntityFromIndex } from "../services/ragIndexService.js";

type OutlineItemRow = typeof schema.outlineItems.$inferSelect;

const buildOutlineItemText = (item: Pick<OutlineItemRow, "title" | "summary">): string =>
    [item.title, item.summary].filter(Boolean).join("\n\n");

// Indexes or de-indexes an outline item per its own includeInAi flag (the Notes/Outline ↔ chat
// bridge's per-item gate — docs/Notes_Outline_Chat_Bridges_Design.md). Same fire-and-forget /
// synchronous-removal split as notes.ts's syncNoteIndex.
const syncOutlineItemIndex = (item: OutlineItemRow) => {
    if (item.includeInAi)
        void attemptPromise(() =>
            indexOutlineItem({ outlineItemId: item.id, storyId: item.storyId, text: buildOutlineItemText(item) })
        );
    else removeEntityFromIndex("outline_item", item.id);
};

export default createCrudRouter({
    table: schema.outlineItems,
    name: "Outline item",
    parentKey: "storyId",
    customRoutes: (router, { asyncHandler }) => {
        // Overrides the generic POST / (registered further down, but this is matched first) so
        // `updatedAt` — NOT NULL, unlike createdAt the generic CRUD helper doesn't auto-populate
        // it — always gets set on create, not just on later updates.
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = req.body;
                const now = new Date();
                const [created] = await db
                    .insert(schema.outlineItems)
                    .values({ id: req.body.id || crypto.randomUUID(), ...rest, createdAt: now, updatedAt: now })
                    .returning();
                syncOutlineItemIndex(created);
                res.status(201).json(created);
            })
        );

        // Overrides the generic PUT /:id so a content edit also bumps `updatedAt` — the generic
        // helper only ever sets fields the client explicitly sends.
        router.put(
            "/:id",
            asyncHandler(async (req, res) => {
                const { id: _id, createdAt: _createdAt, ...updates } = req.body;
                const [updated] = await db
                    .update(schema.outlineItems)
                    .set({ ...updates, updatedAt: new Date() })
                    .where(eq(schema.outlineItems.id, req.params.id))
                    .returning();
                if (!updated) {
                    res.status(404).json({ error: "Outline item not found" });
                    return;
                }
                syncOutlineItemIndex(updated);
                res.json(updated);
            })
        );

        // Persists suggestions (source: "ai_suggested", status: "pending") rather than returning
        // ephemeral candidates — same rationale as POST /api/beats/detect. Always 200; expected
        // failure modes (no AI provider, story not found) are { success: false, message }.
        router.post(
            "/generate",
            asyncHandler(async (req, res) => {
                const { storyId } = req.body as { storyId?: string };
                if (!storyId) {
                    res.status(400).json({ success: false, message: "storyId is required" });
                    return;
                }

                const [error, result] = await attemptPromise(() => generateOutlineSuggestions(storyId));
                if (error) {
                    res.json({ success: false, message: error.message });
                    return;
                }
                res.json(result);
            })
        );

        // Bulk-dismiss every still-pending AI suggestion for a story ("Reject All"). Rows are
        // kept with status "rejected", not deleted — same immutable-history convention as
        // concreteBeats/codexPendingChanges.
        router.post(
            "/story/:storyId/reject-all-pending",
            asyncHandler(async (req, res) => {
                await db
                    .update(schema.outlineItems)
                    .set({ status: "rejected", updatedAt: new Date() })
                    .where(
                        and(
                            eq(schema.outlineItems.storyId, req.params.storyId),
                            eq(schema.outlineItems.status, "pending")
                        )
                    );
                res.json({ success: true });
            })
        );

        // A character's ordered arc overview (Task 2) — see outlineArcService.ts.
        router.get(
            "/story/:storyId/arc/:characterId",
            asyncHandler(async (req, res) => {
                const entries = await getCharacterArc(req.params.storyId, req.params.characterId);
                res.json(entries);
            })
        );

        // Bulk reorder/reparent — a single drag can move one row and shift the `order` of many
        // siblings (in the old parent, the new parent, or both) at once, so this is a batch of
        // partial updates rather than N individual PUTs.
        router.patch(
            "/reorder",
            asyncHandler(async (req, res) => {
                const { updates } = req.body as { updates?: OutlineReorderUpdate[] };
                if (!Array.isArray(updates)) {
                    res.status(400).json({ success: false, message: "updates array is required" });
                    return;
                }

                const now = new Date();
                for (const update of updates) {
                    const setValues: { order: number; updatedAt: Date; parentId?: string | null } = {
                        order: update.order,
                        updatedAt: now
                    };
                    if ("parentId" in update) setValues.parentId = update.parentId ?? null;
                    await db.update(schema.outlineItems).set(setValues).where(eq(schema.outlineItems.id, update.id));
                }
                res.json({ success: true });
            })
        );

        // Overrides the generic DELETE /:id (registered further down by createCrudRouter, but
        // this route is matched first since customRoutes run before it) so deleting a "chapter"
        // row also removes its "scene" children and any character-arc links on all of them —
        // parentId isn't a real DB foreign key (see schema.ts), so there's no cascade to rely on.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                const [item] = await db
                    .select()
                    .from(schema.outlineItems)
                    .where(eq(schema.outlineItems.id, req.params.id));
                if (!item) {
                    res.json({ success: true });
                    return;
                }

                const childRows =
                    item.type === "chapter"
                        ? await db
                              .select({ id: schema.outlineItems.id })
                              .from(schema.outlineItems)
                              .where(eq(schema.outlineItems.parentId, item.id))
                        : [];
                const allIds = [item.id, ...childRows.map(row => row.id)];

                await db
                    .delete(schema.outlineItemCharacters)
                    .where(inArray(schema.outlineItemCharacters.outlineItemId, allIds));
                await db.delete(schema.outlineItems).where(inArray(schema.outlineItems.id, allIds));
                for (const id of allIds) removeEntityFromIndex("outline_item", id);
                res.json({ success: true });
            })
        );
    }
});
