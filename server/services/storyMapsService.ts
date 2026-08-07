import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { StoryMapDocument } from "../../src/types/storyMaps.js";
import { db, schema } from "../db/client.js";
import { deleteStoryMapThumbnail } from "./storyMapThumbnailStorage.js";

// MV0 (docs/Maps_V2_Sketch_Design.md) — schema + CRUD only, no Excalidraw embed or AI propose/
// accept yet (that's MV2/MV5). DB access inlined here rather than a separate repository layer,
// same "small enough not to be worth it" call storyMapService.ts (the L3 graph) already made.

type StoryMapRow = typeof schema.storyMaps.$inferSelect;

const rowToDocument = (row: StoryMapRow): StoryMapDocument => ({
    id: row.id,
    storyId: row.storyId,
    title: row.title,
    locationId: row.locationId ?? null,
    sceneJson: row.sceneJson,
    thumbnailFilename: row.thumbnailFilename ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date
});

// A brand-new map's starting scene — an empty Excalidraw document. Shape matches what
// `@excalidraw/excalidraw`'s own `initialData`/`updateScene` expect (MV2 wires the real embed).
export const EMPTY_SCENE = { type: "excalidraw", version: 2, elements: [], appState: {} };

export const listMapsForStory = async (storyId: string): Promise<StoryMapDocument[]> =>
    (await db.select().from(schema.storyMaps).where(eq(schema.storyMaps.storyId, storyId)))
        .map(rowToDocument)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

export const getMap = async (id: string): Promise<StoryMapDocument | null> => {
    const [row] = await db.select().from(schema.storyMaps).where(eq(schema.storyMaps.id, id));
    return row ? rowToDocument(row) : null;
};

// "Open map" affordance from a location lore entry (design doc §UI surfaces) — at most one
// location-linked map per (storyId, locationId) is the intended usage, but nothing in the schema
// enforces uniqueness (a location could end up with two free-standing maps pointed at it via
// direct API use); returns the most recently updated if more than one exists.
export const getMapForLocation = async (storyId: string, locationId: string): Promise<StoryMapDocument | null> => {
    const rows = await db
        .select()
        .from(schema.storyMaps)
        .where(and(eq(schema.storyMaps.storyId, storyId), eq(schema.storyMaps.locationId, locationId)));
    if (rows.length === 0) return null;
    const [latest] = rows.sort((a, b) => (b.updatedAt as unknown as Date).getTime() - (a.updatedAt as unknown as Date).getTime());
    return rowToDocument(latest);
};

export type CreateStoryMapInput = { storyId: string; title: string; locationId?: string | null; sceneJson?: unknown };

export const createMap = async (input: CreateStoryMapInput): Promise<StoryMapDocument> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.storyMaps)
        .values({
            id: randomUUID(),
            storyId: input.storyId,
            title: input.title,
            locationId: input.locationId ?? null,
            sceneJson: input.sceneJson ?? EMPTY_SCENE,
            thumbnailFilename: null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToDocument(row);
};

export type UpdateStoryMapInput = { title?: string; locationId?: string | null; sceneJson?: unknown };

export const updateMap = async (id: string, input: UpdateStoryMapInput): Promise<StoryMapDocument> => {
    const [row] = await db
        .update(schema.storyMaps)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.storyMaps.id, id))
        .returning();
    if (!row) throw new Error(`Story map not found: ${id}`);
    return rowToDocument(row);
};

export const deleteMap = async (id: string): Promise<void> => {
    const [row] = await db.select().from(schema.storyMaps).where(eq(schema.storyMaps.id, id));
    if (row?.thumbnailFilename) await deleteStoryMapThumbnail(row.thumbnailFilename);
    await db.delete(schema.storyMaps).where(eq(schema.storyMaps.id, id));
};

export const setMapThumbnail = async (id: string, filename: string): Promise<StoryMapDocument> => {
    const [existing] = await db.select().from(schema.storyMaps).where(eq(schema.storyMaps.id, id));
    if (!existing) throw new Error(`Story map not found: ${id}`);
    if (existing.thumbnailFilename) await deleteStoryMapThumbnail(existing.thumbnailFilename);

    const [row] = await db
        .update(schema.storyMaps)
        .set({ thumbnailFilename: filename, updatedAt: new Date() })
        .where(eq(schema.storyMaps.id, id))
        .returning();
    return rowToDocument(row);
};

// Location delete cascade (server/routes/lorebook.ts) — the map itself is preserved (becomes a
// free story map) rather than deleted, since sketch content shouldn't vanish because its location
// label did; same "unlink, don't destroy" call as decision #6's hybrid ownership implies.
export const unlinkMapsForLocation = async (entryId: string): Promise<number> => {
    const rows = await db
        .update(schema.storyMaps)
        .set({ locationId: null, updatedAt: new Date() })
        .where(eq(schema.storyMaps.locationId, entryId))
        .returning({ id: schema.storyMaps.id });
    return rows.length;
};
