import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";

type StoryGraphLayoutRow = typeof schema.storyGraphLayout.$inferSelect;

// Plain DB access, no business logic — mirrors codexRepository.ts's role. Validation, dedup
// enforcement, and node/edge DTO assembly live in storyGraphService.ts.

type StoryGraphEdgeRow = typeof schema.storyGraphEdges.$inferSelect;
export type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

export type InsertEdgeParams = {
    storyId: string;
    fromId: string;
    toId: string;
    edgeType: string;
    label: string | null;
    description: string | null;
    status: string;
    source: string;
};

export const insertEdge = async (params: InsertEdgeParams): Promise<StoryGraphEdgeRow> => {
    const [row] = await db
        .insert(schema.storyGraphEdges)
        .values({
            id: randomUUID(),
            storyId: params.storyId,
            fromId: params.fromId,
            toId: params.toId,
            edgeType: params.edgeType,
            label: params.label,
            description: params.description,
            status: params.status,
            asOfChapterId: null,
            source: params.source,
            createdAt: new Date(),
            updatedAt: null
        })
        .returning();
    return row;
};

export const getEdge = async (id: string): Promise<StoryGraphEdgeRow | undefined> => {
    const [row] = await db.select().from(schema.storyGraphEdges).where(eq(schema.storyGraphEdges.id, id));
    return row;
};

// Dedup check for createEdge — is there already an active edge for this exact triple?
export const findActiveEdge = async (
    storyId: string,
    fromId: string,
    toId: string,
    edgeType: string
): Promise<StoryGraphEdgeRow | undefined> => {
    const [row] = await db
        .select()
        .from(schema.storyGraphEdges)
        .where(
            and(
                eq(schema.storyGraphEdges.storyId, storyId),
                eq(schema.storyGraphEdges.fromId, fromId),
                eq(schema.storyGraphEdges.toId, toId),
                eq(schema.storyGraphEdges.edgeType, edgeType),
                eq(schema.storyGraphEdges.status, "active")
            )
        );
    return row;
};

export const listActiveEdgesForStory = async (storyId: string): Promise<StoryGraphEdgeRow[]> =>
    db
        .select()
        .from(schema.storyGraphEdges)
        .where(and(eq(schema.storyGraphEdges.storyId, storyId), eq(schema.storyGraphEdges.status, "active")))
        .orderBy(desc(schema.storyGraphEdges.createdAt));

export const listPendingEdgesForStory = async (storyId: string): Promise<StoryGraphEdgeRow[]> =>
    db
        .select()
        .from(schema.storyGraphEdges)
        .where(and(eq(schema.storyGraphEdges.storyId, storyId), eq(schema.storyGraphEdges.status, "pending")))
        .orderBy(desc(schema.storyGraphEdges.createdAt));

export type UpdateEdgeFields = Partial<{ edgeType: string; label: string | null; description: string | null; status: string }>;

export const updateEdgeRow = async (id: string, updates: UpdateEdgeFields): Promise<StoryGraphEdgeRow | undefined> => {
    if (Object.keys(updates).length === 0) return getEdge(id);
    const [row] = await db
        .update(schema.storyGraphEdges)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.storyGraphEdges.id, id))
        .returning();
    return row;
};

// B25 (docs/CODE_REVIEW_2026-08-17.md) — atomic claim for approve/reject: conditioned on the
// row's CURRENT status matching `fromStatus`, so two concurrent approve/reject calls on the same
// pending edge (double-click, two tabs) can't both pass a plain check-then-act and both apply.
// Only one caller's claim can ever return a row; the loser sees `undefined` and should treat that
// as "already resolved" rather than retrying the transition.
export const claimEdgeStatus = async (
    id: string,
    fromStatus: string,
    toStatus: string
): Promise<StoryGraphEdgeRow | undefined> => {
    const [row] = await db
        .update(schema.storyGraphEdges)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(and(eq(schema.storyGraphEdges.id, id), eq(schema.storyGraphEdges.status, fromStatus)))
        .returning();
    return row;
};

export const deleteEdgeRow = async (id: string): Promise<void> => {
    await db.delete(schema.storyGraphEdges).where(eq(schema.storyGraphEdges.id, id));
};

// Delete-cascade for lorebook entry delete (server/routes/lorebook.ts) — no real FK covers this
// (fromId/toId are deliberately loose columns), so this explicit call is the only cleanup path.
export const deleteEdgesForEntity = async (entryId: string): Promise<number> => {
    const rows = await db
        .delete(schema.storyGraphEdges)
        .where(or(eq(schema.storyGraphEdges.fromId, entryId), eq(schema.storyGraphEdges.toId, entryId)))
        .returning({ id: schema.storyGraphEdges.id });
    return rows.length;
};

// "Visible" entries for a story = global + story-scoped + (if the story belongs to a series)
// series-scoped for that series. Mirrors server/routes/lorebook.ts's own
// "/story/:storyId/hierarchical" query exactly — same scope rule, needed here so an edge can
// legitimately point at a global/series entry, not just a story-scoped one.
export const listVisibleEntriesForStory = async (storyId: string): Promise<LorebookRow[]> => {
    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
    if (!story) return [];

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story.seriesId)
        conditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId)));

    return db.select().from(schema.lorebookEntries).where(or(...conditions));
};

// ── Layout persistence (P1.2 G1.5+) ───────────────────────────────────────────

export const getLayoutForStory = async (storyId: string): Promise<StoryGraphLayoutRow[]> =>
    db.select().from(schema.storyGraphLayout).where(eq(schema.storyGraphLayout.storyId, storyId));

// Plain select-then-insert-or-update rather than a drizzle onConflictDoUpdate — this table has no
// established upsert precedent elsewhere in the codebase, and call volume is one row per dragged
// node (never a bulk import), so the extra round-trip is a non-issue.
export const upsertLayoutPosition = async (storyId: string, nodeId: string, x: number, y: number): Promise<StoryGraphLayoutRow> => {
    const [existing] = await db
        .select()
        .from(schema.storyGraphLayout)
        .where(and(eq(schema.storyGraphLayout.storyId, storyId), eq(schema.storyGraphLayout.nodeId, nodeId)));

    if (existing) {
        const [row] = await db
            .update(schema.storyGraphLayout)
            .set({ x, y, updatedAt: new Date() })
            .where(eq(schema.storyGraphLayout.id, existing.id))
            .returning();
        return row;
    }

    const [row] = await db
        .insert(schema.storyGraphLayout)
        .values({ id: randomUUID(), storyId, nodeId, x, y, updatedAt: new Date() })
        .returning();
    return row;
};

// "Reset layout" — clears every saved position for a story so the canvas falls back to the
// deterministic layoutEgo/layoutGrid computation again.
export const deleteLayoutForStory = async (storyId: string): Promise<void> => {
    await db.delete(schema.storyGraphLayout).where(eq(schema.storyGraphLayout.storyId, storyId));
};
