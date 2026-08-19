import { attemptPromise } from "@jfdi/attempt";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import multer from "multer";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { generateEpub } from "../services/epubGenerator.js";
import { indexNote, indexOutlineItem } from "../services/ragIndexService.js";
import { migrateSceneBeatNodesInContent } from "../services/sceneBeatContentMigration.js";

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the real cascading delete,
// relocated unchanged from the old DELETE /:id handler. Called by purgeExpiredTrash() (scheduled)
// and by the Trash panel's manual "Delete forever" action (server/routes/trash.ts). The DELETE
// route itself now just sets deletedAt — see the customRoutes block below.
export const purgeStory = async (storyId: string): Promise<void> => {
    // better-sqlite3's transaction API is sync-only and throws if the callback returns a promise,
    // so this must not be `async` — each query is forced to execute synchronously via `.run()`
    // instead of being awaited.
    db.transaction(tx => {
        // 0. Null out concreteBeats.characterId pointing at this story's entries first.
        // schema.ts declares this FK onDelete: "set null", but the migration that added the
        // column (0016_concrete_beats_character_ref.sql) never wrote the "ON DELETE SET NULL"
        // clause into the actual table — so it behaves as RESTRICT, and step 1 below throws
        // "FOREIGN KEY constraint failed" for any story with concrete beats tied to a character,
        // aborting the whole delete.
        tx.update(schema.concreteBeats)
            .set({ characterId: null })
            .where(eq(schema.concreteBeats.storyId, storyId))
            .run();

        // 1. Delete story-level lorebook entries
        tx.delete(schema.lorebookEntries)
            .where(and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId)))
            .run();

        // 2. Delete folders (B9, docs/Folders_Org_Design.md) — both story-level lore folders and
        // chat folders share scopeId=storyId (same query shape as this route's own export above);
        // no FK to rely on, so explicit cleanup here too.
        tx.delete(schema.orgFolders).where(eq(schema.orgFolders.scopeId, storyId)).run();

        // 3. Delete story (FK cascades handle chapters, aiChats, notes, etc.)
        tx.delete(schema.stories).where(eq(schema.stories.id, storyId)).run();
    });
};

type ImportedChapter = InferSelectModel<typeof schema.chapters>;
type ImportedLorebookEntry = InferSelectModel<typeof schema.lorebookEntries>;
type ImportedAiChat = InferSelectModel<typeof schema.aiChats>;
type ImportedNote = InferSelectModel<typeof schema.notes>;
type ImportedOutlineItem = InferSelectModel<typeof schema.outlineItems>;
type ImportedOutlineItemCharacter = InferSelectModel<typeof schema.outlineItemCharacters>;
type ImportedOrgFolder = InferSelectModel<typeof schema.orgFolders>;
type ImportedStoryMapEdge = InferSelectModel<typeof schema.storyMapEdges>;
type ImportedStoryMapLayout = InferSelectModel<typeof schema.storyMapLayout>;
type ImportedStoryMap = InferSelectModel<typeof schema.storyMaps>;
type ImportedPlaybookPack = InferSelectModel<typeof schema.playbookPacks>;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export default createCrudRouter({
    table: schema.stories,
    name: "Story",
    softDelete: true,
    customRoutes: (router, { asyncHandler }) => {
        // Export a single story with all related data
        router.get(
            "/:id/export",
            asyncHandler(async (req, res) => {
                const storyId = req.params.id;

                const [error, data] = await attemptPromise(async () => {
                    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
                    if (!story || story.deletedAt) throw new Error("Story not found");

                    // Fetch series if story belongs to one
                    let seriesData;
                    if (story.seriesId) {
                        const [seriesResult] = await db
                            .select()
                            .from(schema.series)
                            .where(eq(schema.series.id, story.seriesId));
                        if (seriesResult) seriesData = seriesResult;
                    }

                    // Fetch story-level lorebook entries only (not inherited ones)
                    const lorebookEntries = await db
                        .select()
                        .from(schema.lorebookEntries)
                        .where(
                            and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
                        );

                    const [
                        chapters,
                        aiChats,
                        notes,
                        outlineItems,
                        outlineItemCharacters,
                        orgFolders,
                        storyMapEdges,
                        storyMapLayout,
                        storyMaps,
                        playbookPacks
                    ] = await Promise.all([
                        db.select().from(schema.chapters).where(eq(schema.chapters.storyId, storyId)),
                        db.select().from(schema.aiChats).where(eq(schema.aiChats.storyId, storyId)),
                        db.select().from(schema.notes).where(eq(schema.notes.storyId, storyId)),
                        db.select().from(schema.outlineItems).where(eq(schema.outlineItems.storyId, storyId)),
                        db
                            .select()
                            .from(schema.outlineItemCharacters)
                            .where(eq(schema.outlineItemCharacters.storyId, storyId)),
                        // Folders (B9, docs/Folders_Org_Design.md) — both lorebook (level='story')
                        // and chat folders are scoped by scopeId=storyId, so one query covers both
                        // kinds; series-level lore folders are exported separately by series.ts.
                        db.select().from(schema.orgFolders).where(eq(schema.orgFolders.scopeId, storyId)),
                        // Story Map (L5b, docs/Locations_And_Maps_Design.md) — first graph-shaped
                        // data to ever round-trip through story export; the Relationship Graph's
                        // own storyGraphEdges stays out of export for now (separate, not-yet-asked-
                        // for decision — this establishes the technique if that's wanted later).
                        db.select().from(schema.storyMapEdges).where(eq(schema.storyMapEdges.storyId, storyId)),
                        db.select().from(schema.storyMapLayout).where(eq(schema.storyMapLayout.storyId, storyId)),
                        // Maps v2 (MV0, docs/Maps_V2_Sketch_Design.md) — sketch-canvas documents.
                        // thumbnailFilename intentionally stays out of the export JSON (no binary
                        // ever ships, same posture as RAG chunks) — see the import block below.
                        db.select().from(schema.storyMaps).where(eq(schema.storyMaps.storyId, storyId)),
                        // Playbook Packs (Character Guided Playbook Packs, PP5) — story-scoped rows
                        // only; global/shipped packs deliberately excluded (same posture as global
                        // lorebook entries), round-trip only via /api/playbook-packs/global/export|import.
                        db
                            .select()
                            .from(schema.playbookPacks)
                            .where(and(eq(schema.playbookPacks.packScope, "story"), eq(schema.playbookPacks.storyId, storyId)))
                    ]);

                    return {
                        version: "1.0",
                        type: "story",
                        exportDate: new Date().toISOString(),
                        story,
                        series: seriesData,
                        chapters,
                        lorebookEntries,
                        aiChats,
                        notes,
                        outlineItems,
                        outlineItemCharacters,
                        orgFolders,
                        storyMapEdges,
                        storyMapLayout,
                        storyMaps,
                        playbookPacks
                    };
                });

                if (error) {
                    console.error("Error exporting story:", error);
                    if (error.message === "Story not found") res.status(404).json({ error: error.message });
                    else res.status(500).json({ error: "Failed to export story", details: error.message });

                    return;
                }

                res.json(data);
            })
        );

        // Import a story from JSON
        router.post(
            "/import",
            upload.single("file"),
            asyncHandler(async (req, res) => {
                if (!req.file) {
                    res.status(400).json({ error: "No file uploaded" });
                    return;
                }

                const fileBuffer = req.file.buffer;
                const [parseError, storyData] = await attemptPromise(() =>
                    Promise.resolve(JSON.parse(fileBuffer.toString("utf-8")))
                );

                if (parseError) {
                    res.status(400).json({ error: "Invalid JSON file", details: parseError.message });
                    return;
                }

                if (!storyData.type || storyData.type !== "story" || !storyData.story) {
                    res.status(400).json({ error: "Invalid story data format" });
                    return;
                }

                const [error, newStoryId] = await attemptPromise(async () => {
                    const newStoryId = crypto.randomUUID();
                    const idMap = new Map<string, string>();
                    idMap.set(storyData.story.id, newStoryId);

                    const newStory = {
                        ...storyData.story,
                        id: newStoryId,
                        createdAt: new Date(),
                        title: `${storyData.story.title} (Imported)`,
                        seriesId: undefined // Don't import series relationship - user must manually assign
                    };

                    await db.insert(schema.stories).values(newStory);

                    // Folders (B9, docs/Folders_Org_Design.md) — two-pass, same technique as
                    // outlineIdMap below: a folder's parentId references another folder's OLD id,
                    // so every new id must exist before any row (or a leaf's folderId) is remapped.
                    // Built before lorebookEntries/aiChats below since both need to remap folderId.
                    const folderIdMap = new Map<string, string>();
                    if (storyData.orgFolders?.length)
                        for (const folder of storyData.orgFolders as ImportedOrgFolder[]) folderIdMap.set(folder.id, crypto.randomUUID());

                    if (storyData.orgFolders?.length) {
                        const newFolders = (storyData.orgFolders as ImportedOrgFolder[]).map(folder => ({
                            ...folder,
                            id: folderIdMap.get(folder.id) as string,
                            scopeId: newStoryId,
                            parentId: folder.parentId ? (folderIdMap.get(folder.parentId) ?? null) : null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }));
                        await db.insert(schema.orgFolders).values(newFolders);
                    }

                    // Scene Beat Removal (SB5) — an old export's own `sceneBeats` array (if present,
                    // from a backup taken before the feature was removed) is the only source of
                    // command text left once there's no live `sceneBeats` table row to look up
                    // from, so it's used here to rewrite any `scene-beat` Lexical nodes into plain
                    // paragraphs before the chapter content is ever stored — never inserted into a
                    // table itself (design doc: "Import: ignore sceneBeats key if present").
                    const sceneBeatCommandsById = new Map<string, string>(
                        (storyData.sceneBeats ?? []).map((beat: { id: string; command: string }) => [beat.id, beat.command])
                    );
                    if (storyData.chapters?.length) {
                        const newChapters = storyData.chapters.map((chapter: ImportedChapter) => {
                            const newChapterId = crypto.randomUUID();
                            idMap.set(chapter.id, newChapterId);
                            return {
                                ...chapter,
                                id: newChapterId,
                                storyId: newStoryId,
                                content: migrateSceneBeatNodesInContent(chapter.content, sceneBeatCommandsById),
                                createdAt: new Date()
                            };
                        });
                        await db.insert(schema.chapters).values(newChapters);
                    }

                    if (storyData.lorebookEntries?.length) {
                        const newEntries = storyData.lorebookEntries
                            .map((entry: ImportedLorebookEntry) => {
                                // Validate level/scopeId constraints
                                if (entry.level === "global" && entry.scopeId) {
                                    console.warn(
                                        `Skipping invalid entry ${entry.name}: global entries cannot have scopeId`
                                    );
                                    return null;
                                }
                                if ((entry.level === "series" || entry.level === "story") && !entry.scopeId) {
                                    console.warn(
                                        `Skipping invalid entry ${entry.name}: ${entry.level} entries require scopeId`
                                    );
                                    return null;
                                }
                                if (entry.level && !["global", "series", "story"].includes(entry.level)) {
                                    console.warn(`Skipping invalid entry ${entry.name}: invalid level ${entry.level}`);
                                    return null;
                                }

                                const newEntryId = crypto.randomUUID();
                                idMap.set(entry.id, newEntryId);
                                return {
                                    ...entry,
                                    id: newEntryId,
                                    level: "story", // Force to story level on import
                                    scopeId: newStoryId, // Assign to new story
                                    storyId: newStoryId, // Temporary for Phase 1
                                    createdAt: new Date(),
                                    // Pre-existing bug fixed here (found while verifying P0.3's export/import
                                    // work): entry.updatedAt survives the ...entry spread as a JSON string (this
                                    // object round-tripped through export/import JSON), and without this override
                                    // drizzle's insert calls .getTime() on it as if it were still a Date and throws.
                                    // createdAt above was already handled this way; updatedAt was the gap.
                                    updatedAt: entry.updatedAt ? new Date() : null,
                                    // Lore Sheet (T5) — same JSON-round-trip timestamp gotcha as updatedAt above.
                                    sheetSyncedAt: entry.sheetSyncedAt ? new Date() : null,
                                    // Folders (B9) — null-fallback if the folder didn't survive (shouldn't happen,
                                    // orgFolders is imported first, but a stale/malformed export shouldn't hard-fail).
                                    folderId: entry.folderId ? (folderIdMap.get(entry.folderId) ?? null) : null
                                };
                            })
                            .filter(
                                (entry: ImportedLorebookEntry): entry is NonNullable<typeof entry> => entry !== null
                            );

                        if (newEntries.length > 0) await db.insert(schema.lorebookEntries).values(newEntries);
                    }

                    // Story Map (L5b, docs/Locations_And_Maps_Design.md) — fromId/toId/nodeId
                    // reference lorebook entry ids, resolved through the same idMap the entries
                    // block above just populated. Since story export only ships level='story'
                    // entries, an edge/layout row pointing at a global/series entry has no id in
                    // idMap and is silently skipped (its endpoint isn't part of this export) —
                    // same posture as outlineItemCharacters' skip-with-warning pattern below.
                    if (storyData.storyMapEdges?.length) {
                        const newEdges = (storyData.storyMapEdges as ImportedStoryMapEdge[])
                            .map(edge => {
                                const newFromId = idMap.get(edge.fromId);
                                const newToId = idMap.get(edge.toId);
                                if (!newFromId || !newToId) {
                                    console.warn(`Skipping story map edge ${edge.id}: fromId/toId not found in this export`);
                                    return null;
                                }
                                return {
                                    ...edge,
                                    id: crypto.randomUUID(),
                                    storyId: newStoryId,
                                    fromId: newFromId,
                                    toId: newToId,
                                    createdAt: new Date(),
                                    updatedAt: edge.updatedAt ? new Date() : null
                                };
                            })
                            .filter((edge): edge is NonNullable<typeof edge> => edge !== null);
                        if (newEdges.length > 0) await db.insert(schema.storyMapEdges).values(newEdges);
                    }
                    if (storyData.storyMapLayout?.length) {
                        const newLayout = (storyData.storyMapLayout as ImportedStoryMapLayout[])
                            .map(position => {
                                const newNodeId = idMap.get(position.nodeId);
                                if (!newNodeId) return null;
                                return {
                                    ...position,
                                    id: crypto.randomUUID(),
                                    storyId: newStoryId,
                                    nodeId: newNodeId,
                                    updatedAt: new Date()
                                };
                            })
                            .filter((position): position is NonNullable<typeof position> => position !== null);
                        if (newLayout.length > 0) await db.insert(schema.storyMapLayout).values(newLayout);
                    }

                    // Maps v2 (MV0, docs/Maps_V2_Sketch_Design.md) — new id, storyId remapped.
                    // locationId is optional ownership (decision #6), so unlike storyMapEdges above
                    // a map whose location didn't survive this export isn't skipped — it's imported
                    // as a free-standing map instead, same "unlink, don't destroy" call
                    // unlinkMapsForLocation makes on a live location delete. thumbnailFilename never
                    // shipped in the export (no binary in story JSON), so it's always nulled here —
                    // regenerated next time the map is opened/saved.
                    if (storyData.storyMaps?.length) {
                        const newMaps = (storyData.storyMaps as ImportedStoryMap[]).map(map => ({
                            ...map,
                            id: crypto.randomUUID(),
                            storyId: newStoryId,
                            locationId: map.locationId ? (idMap.get(map.locationId) ?? null) : null,
                            thumbnailFilename: null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }));
                        await db.insert(schema.storyMaps).values(newMaps);
                    }

                    if (storyData.aiChats?.length) {
                        const newChats = storyData.aiChats.map((chat: ImportedAiChat) => {
                            const newChatId = crypto.randomUUID();
                            return {
                                ...chat,
                                id: newChatId,
                                storyId: newStoryId,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                // Folders (B9) — same null-fallback as lorebookEntries above.
                                folderId: chat.folderId ? (folderIdMap.get(chat.folderId) ?? null) : null
                            };
                        });
                        await db.insert(schema.aiChats).values(newChats);
                    }

                    // Notes (P0.3 N0) — same shape as sceneBeats: new id, reassigned storyId,
                    // includeInAi carried through as-is. RAG chunks are never exported/imported
                    // (design doc §3/§8) — reindexed below, after every row is safely inserted.
                    const importedNotes: Array<{ id: string; storyId: string; text: string }> = [];
                    if (storyData.notes?.length) {
                        const newNotes = storyData.notes.map((note: ImportedNote) => {
                            const newNoteId = crypto.randomUUID();
                            if (note.includeInAi) importedNotes.push({ id: newNoteId, storyId: newStoryId, text: [note.title, note.content].filter(Boolean).join("\n\n") });
                            return {
                                ...note,
                                id: newNoteId,
                                storyId: newStoryId,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                // T7 (NO3) — same null-fallback as lorebookEntries/aiChats above.
                                folderId: note.folderId ? (folderIdMap.get(note.folderId) ?? null) : null
                            };
                        });
                        await db.insert(schema.notes).values(newNotes);
                    }

                    // Playbook Packs (PP5) — story-scoped rows only (packScope='story' is all the
                    // export ever ships, see the export route above); new id, reassigned storyId.
                    // No RAG involvement — packs are never indexed for default search.
                    if (storyData.playbookPacks?.length) {
                        const newPacks = (storyData.playbookPacks as ImportedPlaybookPack[]).map(pack => ({
                            ...pack,
                            id: crypto.randomUUID(),
                            storyId: newStoryId,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }));
                        await db.insert(schema.playbookPacks).values(newPacks);
                    }

                    // Outline items (P0.3 N0) — needs a two-pass insert: parentId self-references
                    // another outline item's OLD id, and chapterId cross-references the chapters
                    // idMap already populated above. Pass 1 assigns every new id up front so pass 2
                    // can remap both references regardless of insertion order.
                    const outlineIdMap = new Map<string, string>();
                    if (storyData.outlineItems?.length)
                        for (const item of storyData.outlineItems as ImportedOutlineItem[]) outlineIdMap.set(item.id, crypto.randomUUID());

                    const importedOutlineItems: Array<{ id: string; storyId: string; text: string }> = [];
                    if (storyData.outlineItems?.length) {
                        const newOutlineItems = (storyData.outlineItems as ImportedOutlineItem[]).map(item => {
                            const newItemId = outlineIdMap.get(item.id) as string;
                            if (item.includeInAi) importedOutlineItems.push({ id: newItemId, storyId: newStoryId, text: [item.title, item.summary].filter(Boolean).join("\n\n") });
                            return {
                                ...item,
                                id: newItemId,
                                storyId: newStoryId,
                                parentId: item.parentId ? (outlineIdMap.get(item.parentId) ?? null) : null,
                                chapterId: item.chapterId ? (idMap.get(item.chapterId) ?? item.chapterId) : null,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            };
                        });
                        await db.insert(schema.outlineItems).values(newOutlineItems);
                    }

                    // Outline item character-arc links — skip (with a warning, not a hard failure,
                    // matching the lorebook-entry skip-invalid pattern above) if either side of the
                    // link isn't found in the id maps (e.g. a stale/missing reference).
                    if (storyData.outlineItemCharacters?.length) {
                        const newLinks = (storyData.outlineItemCharacters as ImportedOutlineItemCharacter[])
                            .map(link => {
                                const newOutlineItemId = outlineIdMap.get(link.outlineItemId);
                                const newCharacterId = idMap.get(link.characterId);
                                if (!newOutlineItemId || !newCharacterId) {
                                    console.warn(`Skipping outline character link ${link.id}: missing outline item or character reference`);
                                    return null;
                                }
                                return {
                                    ...link,
                                    id: crypto.randomUUID(),
                                    storyId: newStoryId,
                                    outlineItemId: newOutlineItemId,
                                    characterId: newCharacterId,
                                    createdAt: new Date()
                                };
                            })
                            .filter((link): link is NonNullable<typeof link> => link !== null);
                        if (newLinks.length > 0) await db.insert(schema.outlineItemCharacters).values(newLinks);
                    }

                    // Reindex armed notes/outline items now that every row has landed with its
                    // final id/storyId — the export never ships raw ragChunks (design doc §3/§8),
                    // so this is the only place imported content becomes searchable again.
                    // Fire-and-forget, same posture as lorebook.ts's indexLorebookEntry calls.
                    for (const note of importedNotes) void attemptPromise(() => indexNote({ noteId: note.id, storyId: note.storyId, text: note.text }));
                    for (const item of importedOutlineItems) void attemptPromise(() => indexOutlineItem({ outlineItemId: item.id, storyId: item.storyId, text: item.text }));

                    return newStoryId;
                });

                if (error) {
                    console.error("Error importing story:", error);
                    res.status(500).json({ error: "Failed to import story", details: error.message });
                    return;
                }

                res.json({
                    success: true,
                    storyId: newStoryId,
                    imported: {
                        chapters: storyData.chapters?.length || 0,
                        lorebookEntries: storyData.lorebookEntries?.length || 0,
                        aiChats: storyData.aiChats?.length || 0,
                        notes: storyData.notes?.length || 0,
                        outlineItems: storyData.outlineItems?.length || 0,
                        outlineItemCharacters: storyData.outlineItemCharacters?.length || 0,
                        orgFolders: storyData.orgFolders?.length || 0,
                        storyMapEdges: storyData.storyMapEdges?.length || 0,
                        storyMapLayout: storyData.storyMapLayout?.length || 0,
                        playbookPacks: storyData.playbookPacks?.length || 0
                    }
                });
            })
        );

        // Trash / Restore (14-day soft-delete) — the real cascading delete this route used to run
        // synchronously is now purgeStory(), called from the scheduled purge job and from the
        // Trash panel's manual "Delete forever" action. This route just moves the story to Trash.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(schema.stories).set({ deletedAt: new Date() }).where(eq(schema.stories.id, req.params.id));
                res.status(204).send();
            })
        );

        // Export story as EPUB
        router.get(
            "/:id/epub",
            asyncHandler(async (req, res) => {
                const storyId = req.params.id;

                const [error, epubBuffer] = await attemptPromise(async () => {
                    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
                    if (!story || story.deletedAt) throw new Error("Story not found");

                    const chapters = await db
                        .select()
                        .from(schema.chapters)
                        .where(eq(schema.chapters.storyId, storyId))
                        .orderBy(schema.chapters.order);

                    return await generateEpub(story, chapters);
                });

                if (error) {
                    console.error("Error generating EPUB:", error);
                    if (error.message === "Story not found") res.status(404).json({ error: error.message });
                    else res.status(500).json({ error: "Failed to generate EPUB", details: error.message });
                    return;
                }

                res.setHeader("Content-Type", "application/epub+zip");
                res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.epub"`);
                res.send(epubBuffer);
            })
        );
    }
});
