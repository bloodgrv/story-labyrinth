import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { sanitizeNoteHtml } from "../lib/sanitizeHtml.js";
import { buildNoteText, indexNote, removeEntityFromIndex } from "../services/ragIndexService.js";
import { resolveNotesFolderId } from "../services/folderService.js";
import { unlinkPinsForSource } from "../services/storyTimelineService.js";

type NoteRow = typeof schema.notes.$inferSelect;

// Indexes or de-indexes a note per its own includeInAi flag (the Notes/Outline ↔ chat bridge's
// per-item gate — docs/Notes_Outline_Chat_Bridges_Design.md). Fire-and-forget on index (mirrors
// lorebook.ts's indexLorebookEntry calls) since it's just a search-quality improvement, not
// something the write response needs to wait on; removal runs synchronously since it's cheap
// (a delete) and keeps chunk state consistent with the response the client just received.
const syncNoteIndex = (note: NoteRow) => {
    if (note.includeInAi) void attemptPromise(() => indexNote({ noteId: note.id, storyId: note.storyId, text: buildNoteText(note) }));
    else removeEntityFromIndex("note", note.id);
};

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — the real hard-delete this route
// used to run directly, relocated unchanged. Called by purgeExpiredTrash() (scheduled) and by the
// Trash panel's manual "Delete forever" action. The DELETE route below now just sets deletedAt.
export const purgeNote = async (noteId: string): Promise<void> => {
    await db.delete(schema.notes).where(eq(schema.notes.id, noteId));
    removeEntityFromIndex("note", noteId);
    await unlinkPinsForSource("note", noteId);
};

export default createCrudRouter({
    table: schema.notes,
    name: "Note",
    parentKey: "storyId",
    softDelete: true,
    customRoutes: (router, { asyncHandler, table }) => {
        // Overrides the generic POST / (customRoutes are matched first, see server/lib/crud.ts)
        // so a newly created note that's already armed (includeInAi: true) gets indexed immediately.
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                // notesApi.create's own type (Omit<Note, "id"|"createdAt"|"updatedAt">) promises
                // the caller never has to supply these — updatedAt was missing here despite that
                // contract, which failed every create with a NOT NULL constraint error (found
                // while verifying the Brainstorm handoff-to-Notes path, P0.4 B0-B4; also blocked
                // the pre-existing "Save message as note"/note-proposal/New Note paths, all of
                // which call this same route with no updatedAt in the body).
                const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = req.body;
                // B42 (docs/CODE_REVIEW_2026-08-17.md) — content is raw HTML from
                // react-simple-wysiwyg, hydrated straight into a contentEditable div's innerHTML
                // on read, not rendered through React's escaped-text path.
                if (typeof rest.content === "string") rest.content = sanitizeNoteHtml(rest.content);
                const now = new Date();
                const data = { id: req.body.id || crypto.randomUUID(), ...rest, createdAt: now, updatedAt: now };
                const [created] = await db.insert(table).values(data).returning();
                syncNoteIndex(created as NoteRow);
                res.status(201).json(created);
            })
        );

        // Overrides the generic PUT /:id so any edit to an armed note re-indexes it (title/content
        // change), and any includeInAi flip (either direction) is applied to the RAG index
        // immediately — flipping off removes chunks but leaves the note row itself untouched
        // (design doc §3, "RAG vs DB" table).
        router.put(
            "/:id",
            asyncHandler(async (req, res) => {
                const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updates } = req.body;
                if (typeof updates.content === "string") updates.content = sanitizeNoteHtml(updates.content); // B42
                // Was previously never set on update at all (only at create), so "Last updated"
                // stayed frozen at creation time forever and nothing external (e.g. the "Rework in
                // chat" flow, which saves the note from a sibling chat-rail component) could signal
                // the open NoteEditor to resync its own stale local state off a changed timestamp.
                updates.updatedAt = new Date();
                const [existing] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (!existing) {
                    res.status(404).json({ error: "Note not found" });
                    return;
                }
                // T7 (NO3) — validates/auto-resolves folderId the same way lorebook.ts's PUT
                // (resolveLorebookFolderId) already does — a bad explicit choice is a user
                // mistake, 400 not 500, same convention.
                if ("folderId" in updates) {
                    const [folderError, resolvedFolderId] = await attemptPromise(() =>
                        resolveNotesFolderId(existing as NoteRow, { folderId: updates.folderId })
                    );
                    if (folderError) {
                        res.status(400).json({ error: folderError.message });
                        return;
                    }
                    updates.folderId = resolvedFolderId;
                }

                const [updated] = await db.update(table).set(updates).where(eq(table.id, req.params.id)).returning();
                if (!updated) {
                    res.status(404).json({ error: "Note not found" });
                    return;
                }
                syncNoteIndex(updated as NoteRow);
                res.json(updated);
            })
        );

        // Overrides the generic DELETE /:id to move the note to Trash instead of deleting it, and
        // remove it from the RAG index immediately (undone on restore, gated the same way as
        // syncNoteIndex above) so a trashed note never lingers in search/context while trashed.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, req.params.id));
                removeEntityFromIndex("note", req.params.id);
                res.json({ success: true });
            })
        );
    }
});
