import { attemptPromise } from "@jfdi/attempt";
import { and, eq, isNull, or } from "drizzle-orm";
import multer from "multer";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { parseJson } from "../lib/json.js";
import { normalizeAppearance } from "../services/codexService.js";
import { importEntriesFromDocument, importEntryFromDocument } from "../services/documentImportService.js";
import { generateLorebookImage } from "../services/grokImageService.js";
import {
    deleteLorebookImage,
    getLorebookImagePath,
    isSupportedImageMimetype,
    saveLorebookImage
} from "../services/lorebookImageStorage.js";
import { resolveLorebookFolderId } from "../services/folderService.js";
import { indexLorebookEntry, removeEntityFromIndex } from "../services/ragIndexService.js";
import { improveSheetWithAI } from "../services/sheetMigrateService.js";
import { syncSheetToCodex } from "../services/sheetSyncService.js";
import { deleteEdgesForEntity } from "../services/storyGraphService.js";
import { extractPinsFromEntry } from "../services/timelineExtractPinsService.js";
import { deleteMapEdgesForEntity, deleteMapLayoutForEntity } from "../services/storyMapService.js";
import { unlinkMapsForLocation } from "../services/storyMapsService.js";
import { unlinkPinsForSource } from "../services/storyTimelineService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

interface TransformedLorebookEntry extends Omit<LorebookRow, "tags" | "metadata"> {
    tags: unknown;
    metadata: unknown;
}

// codexState.appearance normalization (see codexService.ts's normalizeAppearance doc comment)
// has to happen here too, not just in codexService.ts's own routes — this is the general entry
// CRUD path (GET /lorebook/:id etc, what the entry editor actually loads), a separate read path
// from codexService.ts's codex-specific snapshot/pending-change endpoints.
const transform = (entry: LorebookRow): TransformedLorebookEntry => ({
    ...entry,
    tags: parseJson(entry.tags as string),
    metadata: parseJson(entry.metadata as string | null | undefined),
    codexState: entry.codexState
        ? { ...(entry.codexState as Record<string, unknown>), appearance: normalizeAppearance((entry.codexState as Record<string, unknown>).appearance) }
        : entry.codexState
});

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the real hard-delete this route
// used to run directly, relocated unchanged. Called by purgeExpiredTrash() (scheduled) and by the
// Trash panel's manual "Delete forever" action. The DELETE route below now just sets deletedAt.
export const purgeLorebookEntry = async (entryId: string): Promise<void> => {
    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (entry?.imageFilename) await deleteLorebookImage(entry.imageFilename);
    await db.delete(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    removeEntityFromIndex("lorebook_entry", entryId);
    await deleteEdgesForEntity(entryId);
    await deleteMapEdgesForEntity(entryId);
    await deleteMapLayoutForEntity(entryId);
    await unlinkMapsForLocation(entryId);
    await unlinkPinsForSource("lorebook", entryId);
};

export default createCrudRouter({
    table: schema.lorebookEntries,
    name: "Lorebook entry",
    transforms: { afterRead: transform },
    softDelete: true,
    customRoutes: (router, { asyncHandler, table }) => {
        // Level-based query endpoints

        // GET /lorebook/global - Get all global entries
        router.get(
            "/global",
            asyncHandler(async (_, res) => {
                const entries = await db.select().from(table).where(and(eq(table.level, "global"), isNull(table.deletedAt))).orderBy(table.createdAt);
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
                    .where(and(eq(table.level, "series"), eq(table.scopeId, req.params.seriesId), isNull(table.deletedAt)))
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
                    .where(and(or(...conditions), isNull(table.deletedAt)))
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
                    .where(and(eq(table.level, "story"), eq(table.scopeId, req.params.storyId), isNull(table.deletedAt)))
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
                            eq(table.category, req.params.category),
                            isNull(table.deletedAt)
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
                    .where(and(eq(table.level, "story"), eq(table.scopeId, req.params.storyId), isNull(table.deletedAt)));
                const filtered = rows
                    .map(transform)
                    .filter(entry => Array.isArray(entry.tags) && entry.tags.includes(req.params.tag));
                res.json(filtered);
            })
        );

        // POST /lorebook/sheet/improve - "Improve sheet with AI" (T5 FS2) - stateless, not tied to
        // a saved entryId (a brand-new unsaved entry can still use this). Client applies the
        // result to the form's sheetBody field; nothing persists until the user hits Update.
        router.post(
            "/sheet/improve",
            asyncHandler(async (req, res) => {
                const { sheetBody, category, name } = req.body as { sheetBody?: string; category?: string; name?: string };
                if (!sheetBody || !sheetBody.trim()) {
                    res.json({ success: false, message: "The Lore Sheet is empty — write something first" });
                    return;
                }
                const result = await improveSheetWithAI(sheetBody, category || "character", name || "this entry");
                res.json(result);
            })
        );

        // POST /lorebook/:id/sheet/sync - "Sync structured fields" (T5 FS3) - hybrid deterministic
        // + LLM parse of the entry's current (possibly-unsaved) Lore Sheet text into a
        // codexPendingChanges proposal, reviewed via the same tray every other Codex proposal
        // already uses. Entry-scoped (unlike /sheet/improve and /sheet/migrate) since it needs the
        // entry's saved codexState to merge against and a real id to attach the proposal to.
        router.post(
            "/:id/sheet/sync",
            asyncHandler(async (req, res) => {
                const { sheetBody, category } = req.body as { sheetBody?: string; category?: string };
                if (!sheetBody || !sheetBody.trim()) {
                    res.json({ success: false, message: "The Lore Sheet is empty — write something first" });
                    return;
                }
                if (!category) {
                    res.json({ success: false, message: "Missing category" });
                    return;
                }
                const result = await syncSheetToCodex(req.params.id, sheetBody, category);
                res.json(result);
            })
        );

        // POST /lorebook/:id/timeline/extract-pins - "Extract pins" (2026-08-14 follow-up to T6/T5)
        // - multi-beat LLM extraction of a timeline/event entry's full sheetBody into several
        // pending Story Timeline pins, reviewed via the existing Pending tab. Separate from Sync's
        // own single-pin cross-desk lane above (which stays a "quick single pin" default, capped at
        // one per entry) — this is the dedicated action for a dense multi-beat document.
        router.post(
            "/:id/timeline/extract-pins",
            asyncHandler(async (req, res) => {
                const { sheetBody, category } = req.body as { sheetBody?: string; category?: string };
                if (!sheetBody || !sheetBody.trim()) {
                    res.json({ success: false, message: "The Lore Sheet is empty — write something first" });
                    return;
                }
                if (!category) {
                    res.json({ success: false, message: "Missing category" });
                    return;
                }
                const result = await extractPinsFromEntry(req.params.id, sheetBody, category);
                res.json(result);
            })
        );

        // Custom POST with validation
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const { level, scopeId, name, description, category, tags, metadata, isDisabled, isDemo, sheetBody } = req.body;

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
                    isDemo: isDemo || false,
                    sheetBody: sheetBody || null
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

                // B33 (docs/CODE_REVIEW_2026-08-17.md) — imageFilename is server-managed (set only
                // by the dedicated POST/DELETE /:id/image routes below, which generate a fresh
                // UUID filename themselves); stripping it here closes the mass-assignment path at
                // its actual source. lorebookImageStorage.ts's own path-jail validation (B22)
                // already makes an injected value harmless even without this, but this is the
                // route B22's fix traced the vulnerability back to, so it gets the direct fix too.
                const { id: _id, createdAt: _createdAt, imageFilename: _imageFilename, ...updates } = req.body;

                // Resolve folderId (B9, docs/Folders_Org_Design.md) — validates an explicit
                // choice against the entry's (possibly also-changing) level/scopeId/category, or
                // auto-clears a folderId that a category change alone made stale. Undefined means
                // "don't touch folderId at all", so it's only merged in when actually resolved.
                if (updates.folderId !== undefined || updates.category !== undefined) {
                    const [existing] = await db.select().from(table).where(eq(table.id, req.params.id));
                    if (!existing) {
                        res.status(404).json({ error: "Lorebook entry not found" });
                        return;
                    }
                    const [folderError, resolvedFolderId] = await attemptPromise(() =>
                        resolveLorebookFolderId(existing, updates)
                    );
                    if (folderError) {
                        res.status(400).json({ error: folderError.message });
                        return;
                    }
                    if (resolvedFolderId !== undefined) updates.folderId = resolvedFolderId;
                }

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
                const entries = await db.select().from(table).where(and(eq(table.level, "global"), isNull(table.deletedAt))).orderBy(table.createdAt);

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

        // POST /lorebook/import/document/batch - Multi-subject variant (2026-08-14) - identifies
        // every distinct character/location/item the document describes in real detail and
        // returns one draft per subject, instead of importEntryFromDocument's "pick the single
        // most central subject." Same "nothing persisted here" doctrine - the client reviews and
        // selects which drafts to actually create.
        router.post(
            "/import/document/batch",
            upload.single("file"),
            asyncHandler(async (req, res) => {
                const { file } = req;
                if (!file) {
                    res.status(400).json({ error: "No file uploaded" });
                    return;
                }

                const [error, result] = await attemptPromise(() => importEntriesFromDocument(file.buffer, file.originalname));

                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }

                res.json(result);
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
                const preset = req.body?.preset === "map" ? "map" : "mood";
                const [error] = await attemptPromise(() => generateLorebookImage(req.params.id, preset));
                if (error) {
                    res.status(400).json({ error: error.message });
                    return;
                }
                const [entry] = await db.select().from(table).where(eq(table.id, req.params.id));
                res.json(transform(entry));
            })
        );

        // DELETE /lorebook/:id - overrides the generic CRUD delete (customRoutes are registered
        // before the generic routes, see server/lib/crud.ts) to move the entry to Trash instead
        // of deleting it, removing it from the RAG index immediately (undone on restore) so a
        // trashed entry never surfaces in search/context while it's trashed. The image file,
        // story-graph edges, story-map edges/layout, and Maps v2 unlink only happen for real at
        // purge time — see purgeLorebookEntry above.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, req.params.id));
                removeEntityFromIndex("lorebook_entry", req.params.id);
                res.json({ success: true });
            })
        );
    }
});
