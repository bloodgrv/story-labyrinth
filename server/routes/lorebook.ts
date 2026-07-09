import { attemptPromise } from "@jfdi/attempt";
import { and, eq, or } from "drizzle-orm";
import multer from "multer";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { parseJson } from "../lib/json.js";
import { importEntryFromDocument } from "../services/documentImportService.js";
import { generateLorebookImage } from "../services/grokImageService.js";
import {
    deleteLorebookImage,
    getLorebookImagePath,
    isSupportedImageMimetype,
    saveLorebookImage
} from "../services/lorebookImageStorage.js";
import { indexLorebookEntry } from "../services/ragIndexService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

interface TransformedLorebookEntry extends Omit<LorebookRow, "tags" | "metadata"> {
    tags: unknown;
    metadata: unknown;
}

const transform = (entry: LorebookRow): TransformedLorebookEntry => ({
    ...entry,
    tags: parseJson(entry.tags as string),
    metadata: parseJson(entry.metadata as string | null | undefined)
});

export default createCrudRouter({
    table: schema.lorebookEntries,
    name: "Lorebook entry",
    transforms: { afterRead: transform },
    customRoutes: (router, { asyncHandler, table }) => {
        // Level-based query endpoints

        // GET /lorebook/global - Get all global entries
        router.get(
            "/global",
            asyncHandler(async (_, res) => {
                const entries = await db.select().from(table).where(eq(table.level, "global")).orderBy(table.createdAt);
                res.json(entries.map(transform));
            })
        );

        // GET /lorebook/series/:seriesId - Get series-level entries
        router.get(
            "/series/:seriesId",
            asyncHandler(async (req, res) => {
                const entries = await db
                    .select()
                    .from(table)
                    .where(and(eq(table.level, "series"), eq(table.scopeId, req.params.seriesId)))
                    .orderBy(table.createdAt);
                res.json(entries.map(transform));
            })
        );

        // GET /lorebook/story/:storyId/hierarchical - CRITICAL: Get global + series + story entries
        router.get(
            "/story/:storyId/hierarchical",
            asyncHandler(async (req, res) => {
                const storyId = req.params.storyId;

                // Fetch the story to check if it belongs to a series
                const storyResult = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
                if (storyResult.length === 0) {
                    res.status(404).json({ error: "Story not found" });
                    return;
                }
                const story = storyResult[0];

                // Build query conditions: global + story-level, optionally + series-level
                const conditions = [
                    eq(table.level, "global"),
                    and(eq(table.level, "story"), eq(table.scopeId, storyId))
                ];

                if (story.seriesId) conditions.push(and(eq(table.level, "series"), eq(table.scopeId, story.seriesId)));

                // Execute unified query
                const entries = await db
                    .select()
                    .from(table)
                    .where(or(...conditions))
                    .orderBy(table.level, table.createdAt);

                res.json(entries.map(transform));
            })
        );

        // GET /lorebook/story/:storyId - Get story-level entries only (must come after hierarchical route)
        router.get(
            "/story/:storyId",
            asyncHandler(async (req, res) => {
                const entries = await db
                    .select()
                    .from(table)
                    .where(and(eq(table.level, "story"), eq(table.scopeId, req.params.storyId)))
                    .orderBy(table.createdAt);
                res.json(entries.map(transform));
            })
        );

        // Existing category and tag routes (using level/scopeId now)
        router.get(
            "/story/:storyId/category/:category",
            asyncHandler(async (req, res) => {
                const rows = await db
                    .select()
                    .from(table)
                    .where(
                        and(
                            eq(table.level, "story"),
                            eq(table.scopeId, req.params.storyId),
                            eq(table.category, req.params.category)
                        )
                    );
                res.json(rows.map(transform));
            })
        );

        router.get(
            "/story/:storyId/tag/:tag",
            asyncHandler(async (req, res) => {
                const rows = await db
                    .select()
                    .from(table)
                    .where(and(eq(table.level, "story"), eq(table.scopeId, req.params.storyId)));
                const filtered = rows
                    .map(transform)
                    .filter(entry => Array.isArray(entry.tags) && entry.tags.includes(req.params.tag));
                res.json(filtered);
            })
        );

        // Custom POST with validation
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const { level, scopeId, name, description, category, tags, metadata, isDisabled, isDemo } = req.body;

                // Validate level/scopeId constraints
                if (level === "global" && scopeId) {
                    res.status(400).json({ error: "Global entries cannot have scopeId" });
                    return;
                }
                if ((level === "series" || level === "story") && !scopeId) {
                    res.status(400).json({ error: `${level} entries require scopeId` });
                    return;
                }

                const newEntry = {
                    id: req.body.id || crypto.randomUUID(),
                    level: level || "story",
                    scopeId: scopeId || null,
                    name,
                    description,
                    category,
                    tags: JSON.stringify(tags),
                    metadata: metadata ? JSON.stringify(metadata) : null,
                    isDisabled: isDisabled || false,
                    createdAt: new Date(),
                    isDemo: isDemo || false
                };

                const result = await db.insert(table).values(newEntry).returning();
                const created = Array.isArray(result) ? result[0] : result;
                void attemptPromise(() => indexLorebookEntry(created.id));
                res.status(201).json(transform(created));
            })
        );

        // Custom PUT with validation
        router.put(
            "/:id",
            asyncHandler(async (req, res) => {
                const { level, scopeId } = req.body;

                // Validate level/scopeId constraints if they're being updated
                if (level !== undefined) {
                    if (level === "global" && scopeId) {
                        res.status(400).json({ error: "Global entries cannot have scopeId" });
                        return;
                    }
                    if ((level === "series" || level === "story") && !scopeId) {
                        res.status(400).json({ error: `${level} entries require scopeId` });
                        return;
                    }
                }

                const { id: _id, createdAt: _createdAt, ...updates } = req.body;

                const result = await db.update(table).set(updates).where(eq(table.id, req.params.id)).returning();
                const updated = Array.isArray(result) ? result[0] : result;
                if (!updated) {
                    res.status(404).json({ error: "Lorebook entry not found" });
                    return;
                }
                void attemptPromise(() => indexLorebookEntry(updated.id));
                res.json(transform(updated));
            })
        );

        // GET /lorebook/global/export - Export all global lorebook entries
        router.get(
            "/global/export",
            asyncHandler(async (_, res) => {
                const entries = await db.select().from(table).where(eq(table.level, "global")).orderBy(table.createdAt);

                const exportData = {
                    version: "1.0",
                    type: "global-lorebook",
                    exportDate: new Date().toISOString(),
                    lorebookEntries: entries.map(transform)
                };

                res.json(exportData);
            })
        );

        // POST /lorebook/global/import - Import global lorebook entries
        router.post(
            "/global/import",
            upload.single("file"),
            asyncHandler(async (req, res) => {
                if (!req.file) {
                    res.status(400).json({ error: "No file uploaded" });
                    return;
                }

                const fileBuffer = req.file.buffer;
                const [parseError, importData] = await attemptPromise(() =>
                    Promise.resolve(JSON.parse(fileBuffer.toString("utf-8")))
                );

                if (parseError) {
                    res.status(400).json({ error: "Invalid JSON file", details: parseError.message });
                    return;
                }

                if (!importData.type || importData.type !== "global-lorebook" || !importData.lorebookEntries) {
                    res.status(400).json({ error: "Invalid global lorebook data format" });
                    return;
                }

                const newEntries = [];
                for (const entry of importData.lorebookEntries) {
                    // Validate entry is global
                    if (entry.level && entry.level !== "global") {
                        console.warn(`Skipping non-global entry ${entry.name}`);
                        continue;
                    }

                    const newEntry = {
                        ...entry,
                        id: nanoid(),
                        level: "global",
                        scopeId: null,
                        storyId: "", // Temporary for Phase 1
                        createdAt: new Date()
                    };

                    const result = await db.insert(table).values(newEntry).returning();
                    const created = Array.isArray(result) ? result[0] : result;
                    newEntries.push(transform(created));
                }

                res.json({
                    success: true,
                    imported: {
                        lorebookEntries: newEntries.length
                    },
                    entries: newEntries
                });
            })
        );

        // POST /lorebook/import/document - Extract a draft entry from an uploaded PDF/DOCX/MD/TXT
        // reference document. Returns the draft only — nothing is persisted here, the client
        // opens the normal entry-creation UI pre-filled with it for review before saving.
        router.post(
            "/import/document",
            upload.single("file"),
            asyncHandler(async (req, res) => {
                const { file } = req;
                if (!file) {
                    res.status(400).json({ error: "No file uploaded" });
                    return;
                }

                const [error, draft] = await attemptPromise(() => importEntryFromDocument(file.buffer, file.originalname));

                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }

                res.json({ draft });
            })
        );

        // POST /lorebook/:id/image - Upload (or replace) an entry's image. Deletes the previous
        // file first if one exists, so replacing never leaves an orphan on disk.
        router.post(
            "/:id/image",
            upload.single("file"),
            asyncHandler(async (req, res) => {
                const { file } = req;
                if (!file) {
                    res.status(400).json({ error: "No file uploaded" });
                    return;
                }
                if (!isSupportedImageMimetype(file.mimetype)) {
                    res.status(400).json({ error: `Unsupported image type: ${file.mimetype}` });
                    return;
                }

                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (!entry) {
                    res.status(404).json({ error: "Lorebook entry not found" });
                    return;
                }

                const filename = await saveLorebookImage(file.buffer, file.mimetype);
                if (entry.imageFilename) await deleteLorebookImage(entry.imageFilename);

                const result = await db
                    .update(table)
                    .set({ imageFilename: filename })
                    .where(eq(table.id, req.params.id))
                    .returning();
                const updated = Array.isArray(result) ? result[0] : result;
                res.json(transform(updated));
            })
        );

        // GET /lorebook/:id/image - Stream the entry's image. Sits under /api (requireAuth
        // applied globally in server/index.ts), not a public static mount - see DECISIONS.md's
        // Basic Login entry on why everything here stays behind a session.
        router.get(
            "/:id/image",
            asyncHandler(async (req, res) => {
                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (!entry?.imageFilename) {
                    res.status(404).json({ error: "No image set for this entry" });
                    return;
                }
                res.sendFile(getLorebookImagePath(entry.imageFilename));
            })
        );

        // DELETE /lorebook/:id/image - Remove an entry's image without deleting the entry itself.
        router.delete(
            "/:id/image",
            asyncHandler(async (req, res) => {
                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (!entry) {
                    res.status(404).json({ error: "Lorebook entry not found" });
                    return;
                }
                if (entry.imageFilename) await deleteLorebookImage(entry.imageFilename);

                const result = await db
                    .update(table)
                    .set({ imageFilename: null })
                    .where(eq(table.id, req.params.id))
                    .returning();
                const updated = Array.isArray(result) ? result[0] : result;
                res.json(transform(updated));
            })
        );

        // POST /lorebook/:id/generate-image - generate a portrait from the entry's own saved
        // description via the "image_generation" feature endpoint (see grokImageService.ts).
        router.post(
            "/:id/generate-image",
            asyncHandler(async (req, res) => {
                const [error] = await attemptPromise(() => generateLorebookImage(req.params.id));
                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }
                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                res.json(transform(entry));
            })
        );

        // DELETE /lorebook/:id - overrides the generic CRUD delete (customRoutes are registered
        // before the generic routes, see server/lib/crud.ts) purely to also delete the entry's
        // image file first, so deleting an entry never orphans an image on disk.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (entry?.imageFilename) await deleteLorebookImage(entry.imageFilename);
                await db.delete(table).where(eq(table.id, req.params.id));
                res.json({ success: true });
            })
        );
    }
});
