import { attemptPromise } from "@jfdi/attempt";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import express from "express";
import multer from "multer";
import type { DraftChapter, OutlineImportAcceptResult } from "../../src/types/outlineImport.js";
import { db, schema } from "../db/client.js";
import { importOutlineFromDocument } from "../services/outlineImportService.js";
import { buildOutlineItemText, indexOutlineItem, removeEntityFromIndex } from "../services/ragIndexService.js";

// Outline Import (docs/Outline_Import_Design.md, promoted off P3) — turns an uploaded structure
// document into a server-persisted draft batch (design lock #19, "server batch is SoT"), edited
// via PATCH, then written into real outlineItems rows only on POST .../accept (design lock #6,
// "Accept is the only spine gate"). Mount point /api/outline-import (server/index.ts). Plain
// express.Router() rather than createCrudRouter — this isn't a straightforward single-table CRUD
// resource (extraction side effect on create, a bulk-write action on accept) — same call
// brainstorm.ts made for its own checklist resource.
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type OutlineItemRow = typeof schema.outlineItems.$inferSelect;

// Same fire-and-forget-index / synchronous-deindex split as outline.ts's own syncOutlineItemIndex
// — duplicated rather than imported since outline.ts doesn't export it (kept route-local there).
const syncOutlineItemIndex = (item: OutlineItemRow) => {
    if (item.includeInAi)
        void attemptPromise(() =>
            indexOutlineItem({ outlineItemId: item.id, storyId: item.storyId, text: buildOutlineItemText(item) })
        );
    else removeEntityFromIndex("outline_item", item.id);
};

const ACTIVE_BATCH_STATUSES = ["extracting", "ready"] as const;
const CHECKLIST_STATUSES = ["pending", "opened", "done", "dismissed"] as const;

// POST /api/outline-import — multipart upload (field "file"), body also carries storyId and an
// optional chatId (set when dropped on the Outline chat rather than the panel). Extraction runs
// synchronously in the request (same posture as lorebook's /import/document — no job queue), so
// the batch is created directly at status "ready", never actually observed at "extracting" today;
// that status exists for a future async path, not dead code to remove.
router.post("/", upload.single("file"), async (req, res) => {
    const { storyId, chatId } = req.body as { storyId?: string; chatId?: string };
    const { file } = req;
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }
    if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    const [error, result] = await attemptPromise(() => importOutlineFromDocument(file.buffer, file.originalname));
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    const now = new Date();
    const batchId = crypto.randomUUID();
    const [batch] = await db
        .insert(schema.outlineImportBatches)
        .values({
            id: batchId,
            storyId,
            status: "ready",
            sourceFilename: file.originalname,
            mode: "append",
            includeInAiArm: false,
            structureDraft: result.structureDraft,
            chatId: chatId || null,
            createdAt: now,
            updatedAt: now
        })
        .returning();

    const checklist = result.richPackets.length
        ? await db
              .insert(schema.outlineImportChecklist)
              .values(
                  result.richPackets.map(packet => ({
                      id: crypto.randomUUID(),
                      batchId,
                      storyId,
                      kind: packet.kind,
                      status: "pending" as const,
                      payload: packet.payload,
                      createdAt: now,
                      updatedAt: now
                  }))
              )
              .returning()
        : [];

    res.status(201).json({ batch, checklist });
});

// GET /api/outline-import?storyId= — the story's most recent "still relevant" batch: either its
// structure draft is still open (extracting|ready), OR it's accepted/discarded but still has
// unresolved rich checklist rows (design lock #16 — Accept doesn't retire the tray, only Mark
// done/Dismiss does; OI7's post-Accept cast-link action needs the tray to keep surfacing after
// Accept). null batch (not 404) when there is truly nothing left to show — a normal, common state.
router.get("/", async (req, res) => {
    const { storyId } = req.query as { storyId?: string };
    if (!storyId) {
        res.status(400).json({ error: "storyId is required" });
        return;
    }

    const rows = await db
        .select()
        .from(schema.outlineImportBatches)
        .where(eq(schema.outlineImportBatches.storyId, storyId))
        .orderBy(desc(schema.outlineImportBatches.createdAt));

    let batch: (typeof rows)[number] | null = null;
    for (const row of rows) {
        if (ACTIVE_BATCH_STATUSES.includes(row.status as (typeof ACTIVE_BATCH_STATUSES)[number])) {
            batch = row;
            break;
        }
        const activeChecklistCount = await db
            .select({ id: schema.outlineImportChecklist.id })
            .from(schema.outlineImportChecklist)
            .where(
                and(
                    eq(schema.outlineImportChecklist.batchId, row.id),
                    inArray(schema.outlineImportChecklist.status, ["pending", "opened"])
                )
            );
        if (activeChecklistCount.length > 0) {
            batch = row;
            break;
        }
    }

    if (!batch) {
        res.json({ batch: null, checklist: [] });
        return;
    }

    const checklist = await db
        .select()
        .from(schema.outlineImportChecklist)
        .where(eq(schema.outlineImportChecklist.batchId, batch.id));
    res.json({ batch, checklist });
});

// GET /api/outline-import/:batchId — a specific batch + its checklist rows regardless of status
// (Done/accepted/discarded batches can still be opened, e.g. from a stale tray card).
router.get("/:batchId", async (req, res) => {
    const [batch] = await db
        .select()
        .from(schema.outlineImportBatches)
        .where(eq(schema.outlineImportBatches.id, req.params.batchId));
    if (!batch) {
        res.status(404).json({ error: "Batch not found" });
        return;
    }
    const checklist = await db
        .select()
        .from(schema.outlineImportChecklist)
        .where(eq(schema.outlineImportChecklist.batchId, batch.id));
    res.json({ batch, checklist });
});

// PATCH /api/outline-import/:batchId — draft tree edits/reorder, Append|Replace mode, and the
// includeInAi arm-all/none toggle (design lock #8) all land here; the client sends the whole
// edited structureDraft tree back after any tree edit rather than per-node patches, matching the
// "one draft model" posture (design lock #5).
router.patch("/:batchId", async (req, res) => {
    const { structureDraft, mode, includeInAiArm } = req.body as {
        structureDraft?: DraftChapter[];
        mode?: string;
        includeInAiArm?: boolean;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (structureDraft !== undefined) updates.structureDraft = structureDraft;
    if (mode === "append" || mode === "replace") updates.mode = mode;
    if (typeof includeInAiArm === "boolean") updates.includeInAiArm = includeInAiArm;

    const [updated] = await db
        .update(schema.outlineImportBatches)
        .set(updates)
        .where(eq(schema.outlineImportBatches.id, req.params.batchId))
        .returning();
    if (!updated) {
        res.status(404).json({ error: "Batch not found" });
        return;
    }
    res.json(updated);
});

// The Accept write path (OI4) — the only place this feature ever touches real outlineItems rows.
// Not wrapped in a db.transaction: better-sqlite3's transaction API is sync-only (see
// routes/stories.ts's DELETE /:id comment for the landmine), and this route's per-row inserts need
// each row's own generated id before inserting its children — sequential awaited statements
// (same posture as outline.ts's own multi-step DELETE cascade) rather than fighting that
// constraint for a low-frequency, user-initiated action.
const acceptBatch = async (batchId: string): Promise<OutlineImportAcceptResult> => {
    const [batch] = await db.select().from(schema.outlineImportBatches).where(eq(schema.outlineImportBatches.id, batchId));
    if (!batch) throw new Error("Batch not found");
    if (batch.status === "accepted") throw new Error("This batch has already been accepted.");
    if (batch.status === "discarded") throw new Error("This batch was discarded — create a new import to try again.");

    const structureDraft = batch.structureDraft as DraftChapter[];
    if (!structureDraft || structureDraft.length === 0) throw new Error("Nothing to accept — the draft has no chapters.");

    // Replace = delete every outlineItems row for the story (any status) + cascaded
    // outlineItemCharacters, then insert (design lock #18). Never touches `chapters`.
    if (batch.mode === "replace") {
        const existing = await db
            .select({ id: schema.outlineItems.id })
            .from(schema.outlineItems)
            .where(eq(schema.outlineItems.storyId, batch.storyId));
        const existingIds = existing.map(row => row.id);
        if (existingIds.length > 0) {
            await db.delete(schema.outlineItemCharacters).where(inArray(schema.outlineItemCharacters.outlineItemId, existingIds));
            await db.delete(schema.outlineItems).where(inArray(schema.outlineItems.id, existingIds));
            for (const id of existingIds) removeEntityFromIndex("outline_item", id);
        }
    }

    // 1-based, matching every other outlineItems writer's convention (OutlinePage.tsx's manual
    // Add Chapter uses `chapters.length + 1`, OutlineTree.tsx's reorder uses `index + 1`) — the
    // chapter/scene display literally renders `{chapter.order}. {title}` (OutlineChapterCard.tsx),
    // so a 0-based order here would show as "0. Title" instead of "1. Title".
    const topLevel = await db
        .select({ order: schema.outlineItems.order })
        .from(schema.outlineItems)
        .where(and(eq(schema.outlineItems.storyId, batch.storyId), isNull(schema.outlineItems.parentId)));
    const startOrder = topLevel.reduce((max, row) => Math.max(max, row.order), 0) + 1;

    const now = new Date();
    const createdItemIds: OutlineImportAcceptResult["createdItemIds"] = [];
    const acceptedItemRefs: { id: string; title: string; type: "chapter" | "scene" }[] = [];

    for (let chapterIndex = 0; chapterIndex < structureDraft.length; chapterIndex++) {
        const chapterDraft = structureDraft[chapterIndex];
        const chapterId = crypto.randomUUID();
        const [chapterRow] = await db
            .insert(schema.outlineItems)
            .values({
                id: chapterId,
                storyId: batch.storyId,
                parentId: null,
                type: "chapter",
                title: chapterDraft.title,
                summary: chapterDraft.summary,
                wordCountTarget: chapterDraft.wordCountTarget,
                order: startOrder + chapterIndex,
                source: "ai_suggested",
                status: "confirmed",
                chapterId: null,
                includeInAi: batch.includeInAiArm,
                createdAt: now,
                updatedAt: now
            })
            .returning();
        syncOutlineItemIndex(chapterRow);
        acceptedItemRefs.push({ id: chapterId, title: chapterDraft.title, type: "chapter" });

        const sceneIds: { id: string; tempId: string }[] = [];
        for (let sceneIndex = 0; sceneIndex < chapterDraft.scenes.length; sceneIndex++) {
            const sceneDraft = chapterDraft.scenes[sceneIndex];
            const sceneId = crypto.randomUUID();
            const [sceneRow] = await db
                .insert(schema.outlineItems)
                .values({
                    id: sceneId,
                    storyId: batch.storyId,
                    parentId: chapterId,
                    type: "scene",
                    title: sceneDraft.title,
                    summary: sceneDraft.summary,
                    wordCountTarget: sceneDraft.wordCountTarget,
                    order: sceneIndex + 1,
                    source: "ai_suggested",
                    status: "confirmed",
                    chapterId: null,
                    includeInAi: batch.includeInAiArm,
                    createdAt: now,
                    updatedAt: now
                })
                .returning();
            syncOutlineItemIndex(sceneRow);
            sceneIds.push({ id: sceneId, tempId: sceneDraft.tempId });
            acceptedItemRefs.push({ id: sceneId, title: sceneDraft.title, type: "scene" });
        }

        createdItemIds.push({ chapterId, tempId: chapterDraft.tempId, sceneIds });
    }

    const [updatedBatch] = await db
        .update(schema.outlineImportBatches)
        .set({ status: "accepted", acceptedItemIds: acceptedItemRefs, updatedAt: now })
        .where(eq(schema.outlineImportBatches.id, batchId))
        .returning();

    return { batch: updatedBatch as unknown as OutlineImportAcceptResult["batch"], createdItemIds };
};

router.post("/:batchId/accept", async (req, res) => {
    const [error, result] = await attemptPromise(() => acceptBatch(req.params.batchId));
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }
    res.json(result);
});

// POST /api/outline-import/:batchId/discard — structure draft discard. Per design lock #16 this
// does NOT auto-wipe the rich checklist rows unless the caller explicitly asks (alsoDismissRich) —
// a user may still want to work the tray after abandoning the structure draft itself.
router.post("/:batchId/discard", async (req, res) => {
    const { alsoDismissRich } = req.body as { alsoDismissRich?: boolean };
    const [batch] = await db.select().from(schema.outlineImportBatches).where(eq(schema.outlineImportBatches.id, req.params.batchId));
    if (!batch) {
        res.status(404).json({ error: "Batch not found" });
        return;
    }

    const now = new Date();
    await db
        .update(schema.outlineImportBatches)
        .set({ status: "discarded", updatedAt: now })
        .where(eq(schema.outlineImportBatches.id, batch.id));

    if (alsoDismissRich)
        await db
            .update(schema.outlineImportChecklist)
            .set({ status: "dismissed", updatedAt: now })
            .where(eq(schema.outlineImportChecklist.batchId, batch.id));

    res.json({ success: true });
});

// PATCH /api/outline-import/checklist/:id — Open/Mark done/Dismiss status transitions, same B4
// morals as brainstorm.ts's own PATCH /checklist/:id (Open sets "opened", never clears Active).
router.patch("/checklist/:id", async (req, res) => {
    const { status } = req.body as { status?: string };
    if (!status || !CHECKLIST_STATUSES.includes(status as (typeof CHECKLIST_STATUSES)[number])) {
        res.status(400).json({ error: `status must be one of: ${CHECKLIST_STATUSES.join(", ")}` });
        return;
    }

    const [updated] = await db
        .update(schema.outlineImportChecklist)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.outlineImportChecklist.id, req.params.id))
        .returning();
    if (!updated) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
    }
    res.json(updated);
});

export default router;
