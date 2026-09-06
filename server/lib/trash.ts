import { attemptPromise } from "@jfdi/attempt";
import { eq, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { deleteChat } from "../services/chatService.js";
import { deleteFolder } from "../services/folderService.js";
import { deletePlaybookPack } from "../services/playbookPackService.js";
import { buildNoteText, buildOutlineItemText, indexChapter, indexLorebookEntry, indexNote, indexOutlineItem } from "../services/ragIndexService.js";
import { deleteMap } from "../services/storyMapsService.js";
import { deletePin, deleteTimeline } from "../services/storyTimelineService.js";
import { purgeChapter } from "../routes/chapters.js";
import { purgeLorebookEntry } from "../routes/lorebook.js";
import { purgeNote } from "../routes/notes.js";
import { purgeOutlineItem } from "../routes/outline.js";
import { purgePrompt } from "../routes/prompts.js";
import { purgeSeries } from "../routes/series.js";
import { purgeStory } from "../routes/stories.js";

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — one shared mechanism (a
// `deletedAt` column + this registry) applied uniformly across every covered entity, rather than
// a bespoke soft-delete for each. See CLAUDE.md and docs/CURRENT_BACKLOG.md for the full design.
export const TRASH_RETENTION_DAYS = 14;

export type TrashEntityType =
    | "story"
    | "series"
    | "chapter"
    | "folder"
    | "note"
    | "lorebook_entry"
    | "outline_item"
    | "prompt"
    | "playbook_pack"
    | "ai_chat"
    | "story_map"
    | "story_timeline"
    | "timeline_pin";

export type TrashListRow = {
    id: string;
    type: TrashEntityType;
    title: string;
    storyId: string | null;
    storyTitle: string | null;
    deletedAt: Date;
    purgeAt: Date;
};

// Loosely typed on purpose — every table in this registry has an `id`/`deletedAt` column but a
// different row shape, and drizzle's per-table generics don't unify cleanly across a heterogeneous
// array. Same "trust the shape, not the type" call server/lib/crud.ts's generic router already
// makes for its own table-agnostic queries.
type TrashRow = Record<string, unknown> & { id: string; deletedAt: Date | null; storyId?: string | null };

type TrashableEntity = {
    type: TrashEntityType;
    // biome-ignore lint: heterogeneous drizzle tables, see TrashRow comment above
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- same deliberate exception; oxlint doesn't read biome-ignore
    table: any;
    displayLabel: (row: TrashRow) => string;
    storyIdOf: (row: TrashRow) => string | null;
    // Reindexes the entity into RAG after a restore, if it's the kind of entity that's ever
    // RAG-indexed and was actually eligible before being trashed. No-op for everything else.
    reindexOnRestore?: (row: TrashRow) => Promise<void>;
    // Real, permanent removal — reused unchanged from each entity's own existing delete logic.
    purge: (id: string) => Promise<unknown>;
};

export const TRASHABLE_ENTITIES: TrashableEntity[] = [
    {
        type: "story",
        table: schema.stories,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.id,
        purge: purgeStory
    },
    {
        type: "series",
        table: schema.series,
        displayLabel: row => row.name as string,
        storyIdOf: () => null,
        purge: purgeSeries
    },
    {
        type: "chapter",
        table: schema.chapters,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        reindexOnRestore: async row => void (await indexChapter(row.id)),
        purge: purgeChapter
    },
    {
        type: "folder",
        table: schema.orgFolders,
        displayLabel: row => row.name as string,
        // Only lorebook (story-level)/chat/notes folders are story-scoped; series-level lore
        // folders and any future global folder kind have no owning story.
        storyIdOf: row => (row.kind === "chat" || row.kind === "notes" || (row.kind === "lorebook" && row.level === "story") ? (row.scopeId as string) : null),
        purge: deleteFolder
    },
    {
        type: "note",
        table: schema.notes,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        reindexOnRestore: async row => {
            if (row.includeInAi) await indexNote({ noteId: row.id, storyId: row.storyId as string, text: buildNoteText(row as unknown as Parameters<typeof buildNoteText>[0]) });
        },
        purge: purgeNote
    },
    {
        type: "lorebook_entry",
        table: schema.lorebookEntries,
        displayLabel: row => row.name as string,
        storyIdOf: row => (row.level === "story" ? (row.scopeId as string) : null),
        reindexOnRestore: async row => void (await indexLorebookEntry(row.id)),
        purge: purgeLorebookEntry
    },
    {
        type: "outline_item",
        table: schema.outlineItems,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        reindexOnRestore: async row => {
            if (row.includeInAi)
                await indexOutlineItem({ outlineItemId: row.id, storyId: row.storyId as string, text: buildOutlineItemText(row as unknown as Parameters<typeof buildOutlineItemText>[0]) });
        },
        purge: purgeOutlineItem
    },
    {
        type: "prompt",
        table: schema.prompts,
        displayLabel: row => row.name as string,
        storyIdOf: row => (row.storyId as string | null) ?? null,
        purge: purgePrompt
    },
    {
        type: "playbook_pack",
        table: schema.playbookPacks,
        displayLabel: row => row.title as string,
        storyIdOf: row => (row.storyId as string | null) ?? null,
        purge: deletePlaybookPack
    },
    {
        type: "ai_chat",
        table: schema.aiChats,
        displayLabel: row => row.title as string,
        storyIdOf: row => (row.storyId as string | null) ?? null,
        purge: deleteChat
    },
    {
        type: "story_map",
        table: schema.storyMaps,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        purge: deleteMap
    },
    {
        type: "story_timeline",
        table: schema.storyTimelines,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        purge: deleteTimeline
    },
    {
        type: "timeline_pin",
        table: schema.storyTimelinePins,
        displayLabel: row => row.title as string,
        storyIdOf: row => row.storyId as string,
        purge: deletePin
    }
];

const findEntity = (type: string): TrashableEntity | undefined => TRASHABLE_ENTITIES.find(e => e.type === type);

// GET /api/trash — aggregates every trashed row across the registry, newest-deleted first.
export const listTrash = async (): Promise<TrashListRow[]> => {
    const storyTitles = new Map<string, string>();
    for (const story of await db.select({ id: schema.stories.id, title: schema.stories.title }).from(schema.stories)) storyTitles.set(story.id, story.title);

    const rows: TrashListRow[] = [];
    for (const entity of TRASHABLE_ENTITIES) {
        const trashedRows = (await db.select().from(entity.table).where(isNotNull(entity.table.deletedAt))) as TrashRow[];
        for (const row of trashedRows) {
            const deletedAt = row.deletedAt as Date;
            const storyId = entity.storyIdOf(row);
            rows.push({
                id: row.id,
                type: entity.type,
                title: entity.displayLabel(row),
                storyId,
                storyTitle: storyId ? (storyTitles.get(storyId) ?? null) : null,
                deletedAt,
                purgeAt: new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60_000)
            });
        }
    }

    rows.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    return rows;
};

// POST /api/trash/:type/:id/restore — clears deletedAt and, for entities that are ever
// RAG-indexed, re-adds them to the index (undoing the removal the soft-delete route did).
export const restoreTrashedEntity = async (type: string, id: string): Promise<boolean> => {
    const entity = findEntity(type);
    if (!entity) return false;

    const [row] = (await db.select().from(entity.table).where(eq(entity.table.id, id))) as TrashRow[];
    if (!row || !row.deletedAt) return false;

    await db.update(entity.table).set({ deletedAt: null }).where(eq(entity.table.id, id));
    if (entity.reindexOnRestore) {
        const [error] = await attemptPromise(() => entity.reindexOnRestore!(row));
        if (error) console.error(`Trash restore: failed to reindex ${type}:${id}`, error);
    }
    return true;
};

// DELETE /api/trash/:type/:id — "Delete forever", calls the entity's real purge immediately.
export const purgeTrashedEntity = async (type: string, id: string): Promise<boolean> => {
    const entity = findEntity(type);
    if (!entity) return false;

    const [row] = (await db.select().from(entity.table).where(eq(entity.table.id, id))) as TrashRow[];
    if (!row || !row.deletedAt) return false;

    await entity.purge(id);
    return true;
};

// Scheduled purge — piggybacks on prune_history's existing daily cadence (see
// pruneHistoryJob.ts), matching this codebase's own established precedent (that job already does
// this for Transfer Log pruning) rather than introducing a new AgentJobType/scheduling path.
export const purgeExpiredTrash = async (): Promise<{ purged: number; byType: Partial<Record<TrashEntityType, number>> }> => {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60_000);
    const byType: Partial<Record<TrashEntityType, number>> = {};
    let purged = 0;

    for (const entity of TRASHABLE_ENTITIES) {
        const rows = (await db
            .select({ id: entity.table.id })
            .from(entity.table)
            .where(lt(entity.table.deletedAt, cutoff))) as { id: string }[];
        for (const row of rows) {
            const [error] = await attemptPromise(() => entity.purge(row.id));
            if (error) {
                console.error(`purgeExpiredTrash: failed to purge ${entity.type}:${row.id}`, error);
                continue;
            }
            purged++;
            byType[entity.type] = (byType[entity.type] ?? 0) + 1;
        }
    }

    return { purged, byType };
};
