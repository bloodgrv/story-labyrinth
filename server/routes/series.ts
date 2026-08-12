import { attemptPromise } from "@jfdi/attempt";
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, sql } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { aiChats, chapters, lorebookEntries, orgFolders, series, stories } from "../db/schema.js";
import { migrateSceneBeatNodesInContent } from "../services/sceneBeatContentMigration.js";

type ImportedChapter = InferSelectModel<typeof chapters>;
type ImportedLorebookEntry = InferSelectModel<typeof lorebookEntries>;
type ImportedAiChat = InferSelectModel<typeof aiChats>;
type ImportedOrgFolder = InferSelectModel<typeof orgFolders>;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const seriesRouter = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    const [error] = await attemptPromise(() => fn(req, res));
    if (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message || "Server error" });
    }
};

// GET /series - List all series
seriesRouter.get(
    "/",
    asyncHandler(async (_, res) => {
        const allSeries = await db.select().from(series).orderBy(series.createdAt);
        res.json(allSeries);
    })
);

// GET /series/:id - Get single series
seriesRouter.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [result] = await db.select().from(series).where(eq(series.id, req.params.id));
        if (!result) {
            res.status(404).json({ error: "Series not found" });
            return;
        }
        res.json(result);
    })
);

// POST /series - Create series
seriesRouter.post(
    "/",
    asyncHandler(async (req, res) => {
        const newSeries = {
            id: nanoid(),
            name: req.body.name,
            description: req.body.description,
            createdAt: new Date(),
            isDemo: req.body.isDemo || false
        };
        await db.insert(series).values(newSeries);
        res.status(201).json(newSeries);
    })
);

// PUT /series/:id - Update series
seriesRouter.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const updated = {
            name: req.body.name,
            description: req.body.description
        };
        const result = await db.update(series).set(updated).where(eq(series.id, req.params.id)).returning();
        const updatedSeries = Array.isArray(result) ? result[0] : result;
        if (!updatedSeries) {
            res.status(404).json({ error: "Series not found" });
            return;
        }
        res.json(updatedSeries);
    })
);

// DELETE /series/:id - Delete series with cascade
seriesRouter.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const seriesId = req.params.id;

        // 1. Orphan all stories in this series (set seriesId to null)
        await db.update(stories).set({ seriesId: null }).where(eq(stories.seriesId, seriesId));

        // 2. Delete all series-level lorebook entries
        await db
            .delete(lorebookEntries)
            .where(and(eq(lorebookEntries.level, "series"), eq(lorebookEntries.scopeId, seriesId)));

        // 3. Delete series-level lore folders (B9, docs/Folders_Org_Design.md) — no FK, so no
        // cascade to rely on, same call as the entries above.
        await db.delete(orgFolders).where(and(eq(orgFolders.kind, "lorebook"), eq(orgFolders.level, "series"), eq(orgFolders.scopeId, seriesId)));

        // 4. Delete the series itself
        await db.delete(series).where(eq(series.id, seriesId));

        res.json({ success: true });
    })
);

// GET /series/:id/stories - Get all stories in series, book-ordered (seriesOrder, nulls last,
// then createdAt for stories that haven't been manually ordered yet)
seriesRouter.get(
    "/:id/stories",
    asyncHandler(async (req, res) => {
        const seriesStories = await db
            .select()
            .from(stories)
            .where(eq(stories.seriesId, req.params.id))
            .orderBy(sql`${stories.seriesOrder} IS NULL`, asc(stories.seriesOrder), asc(stories.createdAt));
        res.json(seriesStories);
    })
);

// GET /series/:id/lorebook - Get all series-level lorebook entries
seriesRouter.get(
    "/:id/lorebook",
    asyncHandler(async (req, res) => {
        const entries = await db
            .select()
            .from(lorebookEntries)
            .where(and(eq(lorebookEntries.level, "series"), eq(lorebookEntries.scopeId, req.params.id)))
            .orderBy(lorebookEntries.createdAt);
        res.json(entries);
    })
);

// GET /series/:id/export - Export series with all stories and lorebook
seriesRouter.get(
    "/:id/export",
    asyncHandler(async (req, res) => {
        const seriesId = req.params.id;

        const [seriesResult] = await db.select().from(series).where(eq(series.id, seriesId));
        if (!seriesResult) {
            res.status(404).json({ error: "Series not found" });
            return;
        }

        // Fetch series-level lorebook entries
        const seriesLorebook = await db
            .select()
            .from(lorebookEntries)
            .where(and(eq(lorebookEntries.level, "series"), eq(lorebookEntries.scopeId, seriesId)));

        // Series-level lore folders (B9, docs/Folders_Org_Design.md) — chat folders and per-story
        // lore folders round-trip through stories.ts's own export/import instead, unchanged here.
        const seriesFolders = await db
            .select()
            .from(orgFolders)
            .where(and(eq(orgFolders.kind, "lorebook"), eq(orgFolders.level, "series"), eq(orgFolders.scopeId, seriesId)));

        // Fetch all stories in series
        const seriesStories = await db.select().from(stories).where(eq(stories.seriesId, seriesId));

        // Export each story with full data
        const storyExports = await Promise.all(
            seriesStories.map(async story => {
                const [storyChapters, storyLorebook, storyAiChats] = await Promise.all([
                    db.select().from(chapters).where(eq(chapters.storyId, story.id)),
                    db
                        .select()
                        .from(lorebookEntries)
                        .where(and(eq(lorebookEntries.level, "story"), eq(lorebookEntries.scopeId, story.id))),
                    db.select().from(aiChats).where(eq(aiChats.storyId, story.id))
                ]);

                return {
                    version: "1.0",
                    type: "story",
                    exportDate: new Date().toISOString(),
                    story,
                    series: seriesResult,
                    chapters: storyChapters,
                    lorebookEntries: storyLorebook,
                    aiChats: storyAiChats
                };
            })
        );

        const exportData = {
            version: "1.0",
            type: "series",
            exportDate: new Date().toISOString(),
            series: seriesResult,
            lorebookEntries: seriesLorebook,
            orgFolders: seriesFolders,
            stories: storyExports
        };

        res.json(exportData);
    })
);

// POST /series/import - Import series with all stories
seriesRouter.post(
    "/import",
    upload.single("file"),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        const fileBuffer = req.file.buffer;
        const [parseError, seriesData] = await attemptPromise(() =>
            Promise.resolve(JSON.parse(fileBuffer.toString("utf-8")))
        );

        if (parseError) {
            res.status(400).json({ error: "Invalid JSON file", details: parseError.message });
            return;
        }

        if (!seriesData.type || seriesData.type !== "series" || !seriesData.series) {
            res.status(400).json({ error: "Invalid series data format" });
            return;
        }

        const newSeriesId = nanoid();

        // Create new series
        const newSeries = {
            ...seriesData.series,
            id: newSeriesId,
            name: `${seriesData.series.name} (Imported)`,
            createdAt: new Date()
        };
        await db.insert(series).values(newSeries);

        // Folders (B9, docs/Folders_Org_Design.md) — two-pass, same technique as stories.ts's own
        // import: a folder's parentId references another folder's OLD id, so every new id must
        // exist before any row is remapped. Built before lorebookEntries below since it needs the map.
        const folderIdMap = new Map<string, string>();
        if (seriesData.orgFolders?.length)
            for (const folder of seriesData.orgFolders as ImportedOrgFolder[]) folderIdMap.set(folder.id, nanoid());

        if (seriesData.orgFolders?.length) {
            const newFolders = (seriesData.orgFolders as ImportedOrgFolder[]).map(folder => ({
                ...folder,
                id: folderIdMap.get(folder.id) as string,
                scopeId: newSeriesId,
                parentId: folder.parentId ? (folderIdMap.get(folder.parentId) ?? null) : null,
                createdAt: new Date(),
                updatedAt: new Date()
            }));
            await db.insert(orgFolders).values(newFolders);
        }

        // Import series-level lorebook entries
        if (seriesData.lorebookEntries?.length) {
            const newEntries = seriesData.lorebookEntries
                .map((entry: ImportedLorebookEntry) => {
                    // Validate entry
                    if (entry.level && entry.level !== "series") {
                        console.warn(`Skipping non-series entry ${entry.name}`);
                        return null;
                    }

                    return {
                        ...entry,
                        id: nanoid(),
                        level: "series",
                        scopeId: newSeriesId,
                        storyId: "", // Temporary for Phase 1
                        createdAt: new Date(),
                        // Folders (B9) — null-fallback if the folder didn't survive.
                        folderId: entry.folderId ? (folderIdMap.get(entry.folderId) ?? null) : null
                    };
                })
                .filter((entry: ImportedLorebookEntry): entry is NonNullable<typeof entry> => entry !== null);

            if (newEntries.length > 0) await db.insert(lorebookEntries).values(newEntries);
        }

        // Import stories
        const importedStoryIds = [];
        for (const storyExport of seriesData.stories || []) {
            const newStoryId = nanoid();
            importedStoryIds.push(newStoryId);

            const newStory = {
                ...storyExport.story,
                id: newStoryId,
                seriesId: newSeriesId,
                createdAt: new Date()
            };
            await db.insert(stories).values(newStory);

            // Import chapters. Scene Beat Removal (SB5) — an old export's own `sceneBeats` array
            // (if present, from a backup taken before the feature was removed) is the only source
            // of command text left once there's no live `sceneBeats` table row to look up from,
            // so it's used here to rewrite any `scene-beat` Lexical nodes into plain paragraphs
            // before the chapter content is ever stored — never inserted into a table itself.
            const sceneBeatCommandsById = new Map<string, string>(
                (storyExport.sceneBeats ?? []).map((beat: { id: string; command: string }) => [beat.id, beat.command])
            );
            if (storyExport.chapters?.length) {
                const newChapters = storyExport.chapters.map((chapter: ImportedChapter) => ({
                    ...chapter,
                    id: nanoid(),
                    storyId: newStoryId,
                    content: migrateSceneBeatNodesInContent(chapter.content, sceneBeatCommandsById),
                    createdAt: new Date()
                }));
                await db.insert(chapters).values(newChapters);
            }

            // Import story-level lorebook entries
            if (storyExport.lorebookEntries?.length) {
                const newEntries = storyExport.lorebookEntries
                    .map((entry: ImportedLorebookEntry) => ({
                        ...entry,
                        id: nanoid(),
                        level: "story",
                        scopeId: newStoryId,
                        storyId: newStoryId, // Temporary for Phase 1
                        createdAt: new Date()
                    }))
                    .filter((entry: ImportedLorebookEntry): entry is NonNullable<typeof entry> => entry !== null);

                if (newEntries.length > 0) await db.insert(lorebookEntries).values(newEntries);
            }

            // Import AI chats
            if (storyExport.aiChats?.length) {
                const newChats = storyExport.aiChats.map((chat: ImportedAiChat) => ({
                    ...chat,
                    id: nanoid(),
                    storyId: newStoryId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }));
                await db.insert(aiChats).values(newChats);
            }
        }

        res.json({
            success: true,
            seriesId: newSeriesId,
            imported: {
                stories: importedStoryIds.length,
                lorebookEntries: seriesData.lorebookEntries?.length || 0,
                orgFolders: seriesData.orgFolders?.length || 0
            }
        });
    })
);

export default seriesRouter;
