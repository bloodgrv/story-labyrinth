import { attemptPromise } from "@jfdi/attempt";
import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { parseJson } from "../lib/json.js";
import { sanitizeNoteHtml } from "../lib/sanitizeHtml.js";
import {
    createSnapshot,
    listSnapshotsForChapter,
    maybeAutoSnapshot,
    restoreSnapshot,
    setSnapshotLabel
} from "../services/chapterSnapshotsRepository.js";
import { generateChapterVersionText, textToLexicalContent } from "../services/chapterVersionAiService.js";
import {
    compileVersionToChapter,
    createVersion,
    deleteVersion,
    getVersionById,
    listVersionsForChapter,
    setVersionLabel,
    updateVersionContent
} from "../services/chapterVersionsRepository.js";
import { maybeIndexChapter, removeEntityFromIndex } from "../services/ragIndexService.js";
import { unlinkPinsForSource } from "../services/storyTimelineService.js";

type Chapter = InferSelectModel<typeof schema.chapters>;

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the real hard-delete this route
// used to run directly, relocated unchanged. Called by purgeExpiredTrash() (scheduled) and by the
// Trash panel's manual "Delete forever" action. The DELETE route below now just sets deletedAt.
export const purgeChapter = async (chapterId: string): Promise<void> => {
    await db.delete(schema.chapters).where(eq(schema.chapters.id, chapterId));
    removeEntityFromIndex("chapter", chapterId);
    await unlinkPinsForSource("chapter", chapterId);
};

export default createCrudRouter({
    table: schema.chapters,
    name: "Chapter",
    parentKey: "storyId",
    softDelete: true,
    transforms: {
        afterRead: (ch: Chapter) => ({
            ...ch,
            outline: parseJson(ch.outline),
            notes: parseJson(ch.notes)
        })
    },
    customRoutes: (router, { asyncHandler, applyTransform, table }) => {
        // ── Chapter Snapshots (P0.2b) — linear undo history for the main chapter's own content.
        // Unrelated to Chapter Versions below — see DECISIONS.md's "Story-Layer Chapter
        // Versioning (P0.2)" entry for why the two must not be conflated.

        // PUT /api/chapters/:id — overrides the generic CRUD update (customRoutes are registered
        // before the generic routes, see server/lib/crud.ts) so a content change can be checked
        // for an auto-snapshot first. Every other field updates exactly as the generic path did.
        //
        // B24/B38 (docs/CODE_REVIEW_2026-08-17.md) — a content-bearing PUT is optimistic-
        // concurrency-checked against `contentVersion` (see schema.ts's own comment on that
        // column). `expectedContentVersion` is optional so any caller that doesn't send it (there
        // is none left client-side — SaveChapterContentPlugin is the only writer of `content`
        // through this route — but a stray external API caller shouldn't hard-break) still gets
        // the old unconditional-write behavior; contentVersion is still bumped either way so a
        // caller that starts sending it later has a real baseline to compare against. The
        // conditional `UPDATE ... WHERE id = ? AND contentVersion = ?` is one atomic statement
        // rather than select-then-compare-then-update, closing the same TOCTOU class B25 flags
        // elsewhere.
        router.put(
            "/:id",
            asyncHandler(async (req, res) => {
                const { id: _id, createdAt: _createdAt, expectedContentVersion, ...updates } = req.body as Record<string, unknown> & {
                    expectedContentVersion?: unknown;
                };

                // B42 (docs/CODE_REVIEW_2026-08-17.md) — chapter Scribble (`notes.content`) is raw
                // HTML from the same react-simple-wysiwyg editor Notes uses (ChapterNotesEditor.tsx)
                // and gets hydrated straight into a contentEditable div's innerHTML on read, same
                // risk as notes.ts's own content field.
                if (updates.notes && typeof updates.notes === "object" && "content" in updates.notes) {
                    const notes = updates.notes as Record<string, unknown>;
                    if (typeof notes.content === "string") notes.content = sanitizeNoteHtml(notes.content);
                }

                if (typeof updates.content !== "string") {
                    // A body containing only id/createdAt/expectedContentVersion leaves `updates`
                    // empty — drizzle's .set({}) throws "No values to set" instead of a clean
                    // response. Treat it as a no-op: re-fetch and return the current row.
                    const result =
                        Object.keys(updates).length === 0
                            ? await db.select().from(table).where(eq(table.id, req.params.id))
                            : await db.update(table).set(updates).where(eq(table.id, req.params.id)).returning();
                    const updated = Array.isArray(result) ? result[0] : result;
                    if (!updated) {
                        res.status(404).json({ error: "Chapter not found" });
                        return;
                    }
                    res.json(applyTransform(updated as Chapter));
                    return;
                }

                const [existing] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (!existing) {
                    res.status(404).json({ error: "Chapter not found" });
                    return;
                }
                await maybeAutoSnapshot(req.params.id, existing.content as string, updates.content);

                const nextVersion = (existing.contentVersion as number) + 1;
                const whereClause =
                    typeof expectedContentVersion === "number"
                        ? and(eq(table.id, req.params.id), eq(table.contentVersion, expectedContentVersion))
                        : eq(table.id, req.params.id);

                const result = await db
                    .update(table)
                    .set({ ...updates, contentVersion: nextVersion })
                    .where(whereClause)
                    .returning();
                const updated = Array.isArray(result) ? result[0] : result;

                if (!updated) {
                    // Only reachable when expectedContentVersion was checked and didn't match —
                    // someone else's save landed since this pane last loaded/saved. Return the
                    // current row so the client can offer "reload latest" instead of retrying blind.
                    const [latest] = await db.select().from(table).where(eq(table.id, req.params.id));
                    res.status(409).json({
                        error: "This chapter was changed elsewhere since you last saved.",
                        latest: latest ? applyTransform(latest as Chapter) : null
                    });
                    return;
                }
                // B36 — server-side throttled reindex backstop (see ragIndexService.ts's own
                // comment); fire-and-forget so it never delays the save response.
                void maybeIndexChapter(req.params.id);
                res.json(applyTransform(updated as Chapter));
            })
        );

        // DELETE /api/chapters/:id — overrides the generic CRUD delete (customRoutes are
        // registered before the generic routes, see server/lib/crud.ts) to move the chapter to
        // Trash instead of deleting it, and remove it from the RAG index immediately (undone on
        // restore) so a trashed chapter never surfaces in search/context while it's trashed.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, req.params.id));
                removeEntityFromIndex("chapter", req.params.id);
                res.json({ success: true });
            })
        );

        // GET /api/chapters/:chapterId/snapshots — history, newest first.
        router.get(
            "/:chapterId/snapshots",
            asyncHandler(async (req, res) => {
                const snapshots = await listSnapshotsForChapter(req.params.chapterId);
                res.json({ snapshots });
            })
        );

        // POST /api/chapters/:chapterId/snapshots — manual named save. Snapshots the chapter's
        // CURRENT content (as already persisted by autosave); body: { label? }.
        router.post(
            "/:chapterId/snapshots",
            asyncHandler(async (req, res) => {
                const { label } = req.body as { label?: string | null };
                const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, req.params.chapterId));
                if (!chapter) {
                    res.status(404).json({ error: "Chapter not found" });
                    return;
                }
                const snapshot = await createSnapshot({
                    chapterId: req.params.chapterId,
                    content: chapter.content,
                    sourceType: "manual",
                    label: label ?? null
                });
                res.status(201).json(snapshot);
            })
        );

        // PATCH /api/chapters/:chapterId/snapshots/:snapshotId — set or clear a snapshot's label.
        router.patch(
            "/:chapterId/snapshots/:snapshotId",
            asyncHandler(async (req, res) => {
                const { label } = req.body as { label?: string | null };
                const snapshot = await setSnapshotLabel(req.params.snapshotId, label ?? null);
                if (!snapshot || snapshot.chapterId !== req.params.chapterId) {
                    res.status(404).json({ error: "Snapshot not found" });
                    return;
                }
                res.json(snapshot);
            })
        );

        // POST /api/chapters/:chapterId/snapshots/:snapshotId/restore — non-destructive restore,
        // see chapterSnapshotsRepository.ts's restoreSnapshot for the safety-checkpoint details.
        router.post(
            "/:chapterId/snapshots/:snapshotId/restore",
            asyncHandler(async (req, res) => {
                const [error, result] = await attemptPromise(() =>
                    restoreSnapshot(req.params.chapterId, req.params.snapshotId)
                );
                if (error) {
                    res.status(404).json({ error: error.message });
                    return;
                }
                res.json({ chapter: applyTransform(result.chapter as Chapter), snapshot: result.snapshot });
            })
        );

        // ── Chapter Versions ─────────────────────────────────────────────────────────
        // Flat alternate drafts of a chapter, shown as tabs in the editor. Main chapter stays
        // king — versions only ever reach it via the explicit /compile action below. See
        // DECISIONS.md's "Story-Layer Chapter Versioning" entry.

        // GET /api/chapters/:chapterId/versions — list, newest first.
        router.get(
            "/:chapterId/versions",
            asyncHandler(async (req, res) => {
                const versions = await listVersionsForChapter(req.params.chapterId);
                res.json({ versions });
            })
        );

        // POST /api/chapters/:chapterId/versions — manual duplicate: snapshots the chapter's
        // CURRENT content into a new independently-editable version. Body: { label? }.
        router.post(
            "/:chapterId/versions",
            asyncHandler(async (req, res) => {
                const { label } = req.body as { label?: string | null };
                const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, req.params.chapterId));
                if (!chapter) {
                    res.status(404).json({ error: "Chapter not found" });
                    return;
                }
                const version = await createVersion({
                    chapterId: req.params.chapterId,
                    content: chapter.content,
                    sourceType: "manual",
                    label: label ?? null
                });
                res.status(201).json(version);
            })
        );

        // POST /api/chapters/:chapterId/versions/generate — AI-regenerate an alternate draft.
        // Body: { instruction? }. Non-streaming — see chapterVersionAiService.ts.
        router.post(
            "/:chapterId/versions/generate",
            asyncHandler(async (req, res) => {
                const { instruction } = req.body as { instruction?: string };
                const result = await generateChapterVersionText(req.params.chapterId, instruction);
                if (!result.success) {
                    res.status(400).json({ error: result.message });
                    return;
                }
                const version = await createVersion({
                    chapterId: req.params.chapterId,
                    content: textToLexicalContent(result.text),
                    sourceType: "ai",
                    label: null
                });
                res.status(201).json(version);
            })
        );

        // PUT /api/chapters/:chapterId/versions/:versionId — autosave target for a version's
        // own editor. Body: { content }.
        router.put(
            "/:chapterId/versions/:versionId",
            asyncHandler(async (req, res) => {
                const { content } = req.body as { content?: string };
                if (typeof content !== "string") {
                    res.status(400).json({ error: "content is required" });
                    return;
                }
                const existing = await getVersionById(req.params.versionId);
                if (!existing || existing.chapterId !== req.params.chapterId) {
                    res.status(404).json({ error: "Version not found" });
                    return;
                }
                const version = await updateVersionContent(req.params.versionId, content);
                res.json(version);
            })
        );

        // PATCH /api/chapters/:chapterId/versions/:versionId — set or clear a version's label.
        // Body: { label: string | null }
        router.patch(
            "/:chapterId/versions/:versionId",
            asyncHandler(async (req, res) => {
                const { label } = req.body as { label?: string | null };
                const existing = await getVersionById(req.params.versionId);
                if (!existing || existing.chapterId !== req.params.chapterId) {
                    res.status(404).json({ error: "Version not found" });
                    return;
                }
                const version = await setVersionLabel(req.params.versionId, label ?? null);
                res.json(version);
            })
        );

        // POST /api/chapters/:chapterId/versions/:versionId/compile — promote this version's
        // content into the live chapter. One-directional; the version itself is left in place
        // afterward (not auto-deleted — deleting is a separate, explicit action).
        router.post(
            "/:chapterId/versions/:versionId/compile",
            asyncHandler(async (req, res) => {
                const [error, result] = await attemptPromise(() =>
                    compileVersionToChapter(req.params.chapterId, req.params.versionId)
                );
                if (error) {
                    res.status(404).json({ error: error.message });
                    return;
                }
                res.json(result);
            })
        );

        // DELETE /api/chapters/:chapterId/versions/:versionId
        router.delete(
            "/:chapterId/versions/:versionId",
            asyncHandler(async (req, res) => {
                const existing = await getVersionById(req.params.versionId);
                if (!existing || existing.chapterId !== req.params.chapterId) {
                    res.status(404).json({ error: "Version not found" });
                    return;
                }
                await deleteVersion(req.params.versionId);
                res.json({ success: true });
            })
        );
    }
});
