import { attemptPromise } from "@jfdi/attempt";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { OutlineReorderUpdate } from "../../src/types/outline.js";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { getCharacterArc } from "../services/outlineArcService.js";
import { buildOutlineItemText, indexOutlineItem, removeEntityFromIndex } from "../services/ragIndexService.js";

type OutlineItemRow = typeof schema.outlineItems.$inferSelect;

// B39 extension (docs/CURRENT_BACKLOG.md P2 residual) — these two custom routes are real write
// paths for AI-fence-originated content (the outline-proposal fence and Outline Import's Accept)
// as well as manual outline editing, and previously spread `req.body` wholesale into the
// insert/update (only id/createdAt stripped) — same mass-assignment shape B22 found for
// lorebookEntries.imageFilename. `.strict()` so an unexpected field is a clean 400.
const outlineItemCreateBodySchema = z
    .object({
        id: z.string().optional(),
        storyId: z.string(),
        parentId: z.string().nullable().optional(),
        type: z.enum(["chapter", "scene"]).optional(),
        title: z.string(),
        summary: z.string().nullable().optional(),
        wordCountTarget: z.number().nullable().optional(),
        order: z.number().optional(),
        source: z.enum(["manual", "ai_suggested"]).optional(),
        status: z.enum(["confirmed", "pending", "rejected"]).optional(),
        chapterId: z.string().nullable().optional(),
        includeInAi: z.boolean().optional()
    })
    .strict();
const outlineItemUpdateBodySchema = z
    .object({
        parentId: z.string().nullable().optional(),
        type: z.enum(["chapter", "scene"]).optional(),
        title: z.string().optional(),
        summary: z.string().nullable().optional(),
        wordCountTarget: z.number().nullable().optional(),
        order: z.number().optional(),
        source: z.enum(["manual", "ai_suggested"]).optional(),
        status: z.enum(["confirmed", "pending", "rejected"]).optional(),
        chapterId: z.string().nullable().optional(),
        includeInAi: z.boolean().optional()
    })
    .strict();

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

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the real hard-delete this route
// used to run directly (including its "chapter" -> "scene" children cascade, which stays a real
// hard-delete even at trash time since parentId isn't a real FK), relocated unchanged. Called by
// purgeExpiredTrash() (scheduled) and by the Trash panel's manual "Delete forever" action.
export const purgeOutlineItem = async (itemId: string): Promise<void> => {
    const [item] = await db.select().from(schema.outlineItems).where(eq(schema.outlineItems.id, itemId));
    if (!item) return;

    const childRows =
        item.type === "chapter"
            ? await db.select({ id: schema.outlineItems.id }).from(schema.outlineItems).where(eq(schema.outlineItems.parentId, item.id))
            : [];
    const allIds = [item.id, ...childRows.map(row => row.id)];

    await db.delete(schema.outlineItemCharacters).where(inArray(schema.outlineItemCharacters.outlineItemId, allIds));
    await db.delete(schema.outlineItems).where(inArray(schema.outlineItems.id, allIds));
    for (const id of allIds) removeEntityFromIndex("outline_item", id);
};

export default createCrudRouter({
    table: schema.outlineItems,
    name: "Outline item",
    parentKey: "storyId",
    softDelete: true,
    customRoutes: (router, { asyncHandler }) => {
        // Overrides the generic POST / (registered further down, but this is matched first) so
        // `updatedAt` — NOT NULL, unlike createdAt the generic CRUD helper doesn't auto-populate
        // it — always gets set on create, not just on later updates.
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const parsed = outlineItemCreateBodySchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({ error: "Invalid outline item payload", details: parsed.error.issues });
                    return;
                }
                const { id, ...rest } = parsed.data;
                const now = new Date();
                const [created] = await db
                    .insert(schema.outlineItems)
                    .values({ id: id || crypto.randomUUID(), ...rest, createdAt: now, updatedAt: now })
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
                const parsed = outlineItemUpdateBodySchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({ error: "Invalid outline item payload", details: parsed.error.issues });
                    return;
                }
                const updates = parsed.data;
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

        // Bulk-confirm every still-pending AI suggestion for a story ("Accept All") — the
        // counterpart to reject-all-pending above, added 2026-08-15 (QA-pass B19) since a large
        // AI-generated outline (e.g. a 10-chapter/40-item tree) previously had no way to accept
        // more than one item at a time. Re-syncs each newly-confirmed item's RAG index entry,
        // same as the individual PUT /:id route does — bulk update can't go through that per-row
        // hook, so it's replicated here for whichever rows have `includeInAi` set.
        router.post(
            "/story/:storyId/accept-all-pending",
            asyncHandler(async (req, res) => {
                const updated = await db
                    .update(schema.outlineItems)
                    .set({ status: "confirmed", updatedAt: new Date() })
                    .where(
                        and(
                            eq(schema.outlineItems.storyId, req.params.storyId),
                            eq(schema.outlineItems.status, "pending")
                        )
                    )
                    .returning();
                for (const item of updated) syncOutlineItemIndex(item);
                res.json({ success: true, count: updated.length });
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
        // this route is matched first since customRoutes run before it) to move the item to
        // Trash instead of deleting it. Unlike the real purge (purgeOutlineItem above), trashing
        // a "chapter" row does NOT also trash its "scene" children — same one-level cascade
        // doctrine as a trashed story/chapter (children just become unreachable via their own
        // list query, not individually flagged); the hard-delete-on-purge cascade is unaffected.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(schema.outlineItems).set({ deletedAt: new Date() }).where(eq(schema.outlineItems.id, req.params.id));
                removeEntityFromIndex("outline_item", req.params.id);
                res.json({ success: true });
            })
        );
    }
});
