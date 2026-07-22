import { attemptPromise } from "@jfdi/attempt";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import multer from "multer";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { generateEpub } from "../services/epubGenerator.js";
import { indexNote, indexOutlineItem } from "../services/ragIndexService.js";
import { migrateSceneBeatNodesInContent } from "../services/sceneBeatContentMigration.js";

type ImportedChapter = InferSelectModel<typeof schema.chapters>;
type ImportedLorebookEntry = InferSelectModel<typeof schema.lorebookEntries>;
type ImportedAiChat = InferSelectModel<typeof schema.aiChats>;
type ImportedNote = InferSelectModel<typeof schema.notes>;
type ImportedOutlineItem = InferSelectModel<typeof schema.outlineItems>;
type ImportedOutlineItemCharacter = InferSelectModel<typeof schema.outlineItemCharacters>;
type ImportedOrgFolder = InferSelectModel<typeof schema.orgFolders>;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export default createCrudRouter({
    table: schema.stories,
    name: "Story",
    customRoutes: (router, { asyncHandler }) => {
        // Export a single story with all related data
        router.get(
            "/:id/export",
            asyncHandler(async (req, res) => {
                const storyId = req.params.id;

                const [error, data] = await attemptPromise(async () => {
                    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
                    if (!story) throw new Error("Story not found");

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

                    const [chapters, aiChats, notes, outlineItems, outlineItemCharacters, orgFolders] = await Promise.all([
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
                        db.select().from(schema.orgFolders).where(eq(schema.orgFolders.scopeId, storyId))
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
                        orgFolders
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
                                updatedAt: new Date()
                            };
                        });
                        await db.insert(schema.notes).values(newNotes);
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
                        orgFolders: storyData.orgFolders?.length || 0
                    }
                });
            })
        );

        // Delete story with lorebook cascade
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                const storyId = req.params.id;

                // better-sqlite3's transaction API is sync-only and throws if the callback
                // returns a promise, so this must not be `async` — each query is forced to
                // execute synchronously via `.run()` instead of being awaited.
                db.transaction(tx => {
                    // 1. Delete story-level lorebook entries
                    tx.delete(schema.lorebookEntries)
                        .where(
                            and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
                        )
                        .run();

                    // 2. Delete folders (B9, docs/Folders_Org_Design.md) — both story-level lore
                    // folders and chat folders share scopeId=storyId (same query shape as this
                    // route's own export above); no FK to rely on, so explicit cleanup here too.
                    tx.delete(schema.orgFolders).where(eq(schema.orgFolders.scopeId, storyId)).run();

                    // 3. Delete story (FK cascades handle chapters, aiChats, notes, etc.)
                    tx.delete(schema.stories).where(eq(schema.stories.id, storyId)).run();
                });

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
                    if (!story) throw new Error("Story not found");

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
