import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { STORY_MAP_EDGE_TYPES } from "../../src/types/storyMap.js";
import type { StoryMapEdge, StoryMapEdgeType, StoryMapLayoutPosition, StoryMapNode, StoryMapResponse } from "../../src/types/storyMap.js";
import { db, schema } from "../db/client.js";
import { parseJson } from "../lib/json.js";

// Mirrors storyGraphService.ts's shape, scoped down per L3's manual-CRUD-only decision (no
// pending lane, no AI-suggest, no reindex-on-edge-change — map edges are spatial, not
// informational text the RAG index would need to know about). DB access inlined here rather than
// a separate storyMapRepository.ts — this feature is small enough that the extra layer wasn't
// worth it (unlike storyGraphService's much larger surface).

type StoryMapEdgeRow = typeof schema.storyMapEdges.$inferSelect;
type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

const rowToEdge = (row: StoryMapEdgeRow): StoryMapEdge => ({
    id: row.id,
    storyId: row.storyId,
    fromId: row.fromId,
    toId: row.toId,
    edgeType: row.edgeType as StoryMapEdgeType,
    label: row.label ?? null,
    description: row.description ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: (row.updatedAt as unknown as Date | null) ?? null
});

const isValidEdgeType = (value: string): value is StoryMapEdgeType => STORY_MAP_EDGE_TYPES.includes(value as StoryMapEdgeType);

const validateEdgeType = (value: string): void => {
    if (!isValidEdgeType(value)) throw new Error(`edgeType must be one of: ${STORY_MAP_EDGE_TYPES.join(", ")}`);
};

type PlaceCodexField = { key: string; value: string };

// Once a location graduates to versioned place-Codex tracking (L4), scale/floorLabel live in
// codexState.customFields (key/value rows, same key names PlaceState used — see
// placeCodexMapping.ts client-side) rather than metadata.placeState. Reads whichever tier is
// actually active, falling back to the light L1 tier when not codexEnabled.
const readPlaceField = (row: LorebookRow, key: "scale" | "floorLabel"): string | null => {
    if (row.codexEnabled) {
        const codexState = parseJson(row.codexState as string | null | undefined) as { customFields?: PlaceCodexField[] } | null;
        const field = codexState?.customFields?.find(f => f.key === key);
        if (field) return field.value;
        return null;
    }
    const metadata = parseJson(row.metadata as string | null | undefined) as { placeState?: Record<string, string> } | null;
    return metadata?.placeState?.[key] ?? null;
};

const rowToNode = (row: LorebookRow): StoryMapNode => ({
    id: row.id,
    name: row.name,
    level: row.level as StoryMapNode["level"],
    isDisabled: !!row.isDisabled,
    imageFilename: row.imageFilename ?? null,
    scale: readPlaceField(row, "scale"),
    floorLabel: readPlaceField(row, "floorLabel")
});

// "Visible" locations for a story — same scope rule as storyGraphRepository's
// listVisibleEntriesForStory (global + story-scoped + series-scoped when applicable), filtered to
// category="location" since Story Map nodes are locations only.
const listVisibleLocationsForStory = async (storyId: string): Promise<LorebookRow[]> => {
    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
    if (!story) return [];

    const conditions = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story.seriesId)
        conditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId)));

    return db
        .select()
        .from(schema.lorebookEntries)
        .where(and(eq(schema.lorebookEntries.category, "location"), or(...conditions)));
};

const listEdgesForStory = async (storyId: string): Promise<StoryMapEdgeRow[]> =>
    db.select().from(schema.storyMapEdges).where(eq(schema.storyMapEdges.storyId, storyId));

export const getStoryMap = async (storyId: string): Promise<StoryMapResponse> => {
    const [locations, edgeRows] = await Promise.all([listVisibleLocationsForStory(storyId), listEdgesForStory(storyId)]);
    const locationById = new Map(locations.map(e => [e.id, e]));

    // Node set = every visible location UNION anything referenced by an edge (covers a linked-in
    // series/global location that fell out of the base visible set for some reason — same
    // defensive union storyGraphService.getStoryGraph uses).
    const nodeIds = new Set(locations.map(e => e.id));
    for (const edge of edgeRows) {
        nodeIds.add(edge.fromId);
        nodeIds.add(edge.toId);
    }
    const nodes = [...nodeIds].map(id => locationById.get(id)).filter((e): e is LorebookRow => !!e).map(rowToNode);

    return { nodes, edges: edgeRows.map(rowToEdge) };
};

export type CreateMapEdgeInput = {
    storyId: string;
    fromId: string;
    toId: string;
    edgeType: string;
    label?: string | null;
    description?: string | null;
};

export const createMapEdge = async (input: CreateMapEdgeInput): Promise<StoryMapEdge> => {
    validateEdgeType(input.edgeType);
    if (input.fromId === input.toId) throw new Error("An edge cannot connect a location to itself");

    const visibleLocations = await listVisibleLocationsForStory(input.storyId);
    const visibleIds = new Set(visibleLocations.map(e => e.id));
    if (!visibleIds.has(input.fromId)) throw new Error(`fromId does not resolve to a location visible to this story: ${input.fromId}`);
    if (!visibleIds.has(input.toId)) throw new Error(`toId does not resolve to a location visible to this story: ${input.toId}`);

    const [existing] = await db
        .select()
        .from(schema.storyMapEdges)
        .where(
            and(
                eq(schema.storyMapEdges.storyId, input.storyId),
                eq(schema.storyMapEdges.fromId, input.fromId),
                eq(schema.storyMapEdges.toId, input.toId),
                eq(schema.storyMapEdges.edgeType, input.edgeType)
            )
        );
    if (existing) throw new Error("An edge of this type already exists between these locations");

    const [row] = await db
        .insert(schema.storyMapEdges)
        .values({
            id: randomUUID(),
            storyId: input.storyId,
            fromId: input.fromId,
            toId: input.toId,
            edgeType: input.edgeType,
            label: input.label ?? null,
            description: input.description ?? null,
            createdAt: new Date(),
            updatedAt: null
        })
        .returning();
    return rowToEdge(row);
};

export type UpdateMapEdgeInput = { edgeType?: string; label?: string | null; description?: string | null };

export const updateMapEdge = async (id: string, input: UpdateMapEdgeInput): Promise<StoryMapEdge> => {
    if (input.edgeType !== undefined) validateEdgeType(input.edgeType);
    const [row] = await db
        .update(schema.storyMapEdges)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.storyMapEdges.id, id))
        .returning();
    if (!row) throw new Error(`Edge not found: ${id}`);
    return rowToEdge(row);
};

export const deleteMapEdge = async (id: string): Promise<void> => {
    await db.delete(schema.storyMapEdges).where(eq(schema.storyMapEdges.id, id));
};

// Delete-cascade for lorebook entry delete (server/routes/lorebook.ts), alongside the
// Relationship Graph's own equivalent call — no real FK covers fromId/toId here either.
export const deleteMapEdgesForEntity = async (entryId: string): Promise<number> => {
    const rows = await db
        .delete(schema.storyMapEdges)
        .where(or(eq(schema.storyMapEdges.fromId, entryId), eq(schema.storyMapEdges.toId, entryId)))
        .returning({ id: schema.storyMapEdges.id });
    return rows.length;
};

// ── Layout persistence ─────────────────────────────────────────────────────────

export const getMapLayout = async (storyId: string): Promise<StoryMapLayoutPosition[]> =>
    (await db.select().from(schema.storyMapLayout).where(eq(schema.storyMapLayout.storyId, storyId))).map(row => ({
        nodeId: row.nodeId,
        x: row.x,
        y: row.y
    }));

export const saveMapLayoutPosition = async (storyId: string, nodeId: string, x: number, y: number): Promise<StoryMapLayoutPosition> => {
    const [existing] = await db
        .select()
        .from(schema.storyMapLayout)
        .where(and(eq(schema.storyMapLayout.storyId, storyId), eq(schema.storyMapLayout.nodeId, nodeId)));

    if (existing) {
        const [row] = await db
            .update(schema.storyMapLayout)
            .set({ x, y, updatedAt: new Date() })
            .where(eq(schema.storyMapLayout.id, existing.id))
            .returning();
        return { nodeId: row.nodeId, x: row.x, y: row.y };
    }

    const [row] = await db
        .insert(schema.storyMapLayout)
        .values({ id: randomUUID(), storyId, nodeId, x, y, updatedAt: new Date() })
        .returning();
    return { nodeId: row.nodeId, x: row.x, y: row.y };
};

export const resetMapLayout = async (storyId: string): Promise<void> => {
    await db.delete(schema.storyMapLayout).where(eq(schema.storyMapLayout.storyId, storyId));
};

// Delete-cascade for lorebook entry delete — a location's own saved position should go with it,
// same reasoning as deleteMapEdgesForEntity above.
export const deleteMapLayoutForEntity = async (entryId: string): Promise<void> => {
    await db.delete(schema.storyMapLayout).where(eq(schema.storyMapLayout.nodeId, entryId));
};
