import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { indexNote, removeEntityFromIndex } from "../services/ragIndexService.js";

type NoteRow = typeof schema.notes.$inferSelect;

const buildNoteText = (note: Pick<NoteRow, "title" | "content">): string =>
    [note.title, note.content].filter(Boolean).join("\n\n");

// Indexes or de-indexes a note per its own includeInAi flag (the Notes/Outline ↔ chat bridge's
// per-item gate — docs/Notes_Outline_Chat_Bridges_Design.md). Fire-and-forget on index (mirrors
// lorebook.ts's indexLorebookEntry calls) since it's just a search-quality improvement, not
// something the write response needs to wait on; removal runs synchronously since it's cheap
// (a delete) and keeps chunk state consistent with the response the client just received.
const syncNoteIndex = (note: NoteRow) => {
    if (note.includeInAi) void attemptPromise(() => indexNote({ noteId: note.id, storyId: note.storyId, text: buildNoteText(note) }));
    else removeEntityFromIndex("note", note.id);
};

export default createCrudRouter({
    table: schema.notes,
    name: "Note",
    parentKey: "storyId",
    customRoutes: (router, { asyncHandler, table }) => {
        // Overrides the generic POST / (customRoutes are matched first, see server/lib/crud.ts)
        // so a newly created note that's already armed (includeInAi: true) gets indexed immediately.
        router.post(
            "/",
            asyncHandler(async (req, res) => {
                const { id: _id, createdAt: _createdAt, ...rest } = req.body;
                const data = { id: req.body.id || crypto.randomUUID(), ...rest, createdAt: new Date() };
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
                const { id: _id, createdAt: _createdAt, ...updates } = req.body;
                const [updated] = await db.update(table).set(updates).where(eq(table.id, req.params.id)).returning();
                if (!updated) {
                    res.status(404).json({ error: "Note not found" });
                    return;
                }
                syncNoteIndex(updated as NoteRow);
                res.json(updated);
            })
        );

        // Overrides the generic DELETE /:id so a deleted note's RAG chunks (if any) never linger
        // as orphans.
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                await db.delete(table).where(eq(table.id, req.params.id));
                removeEntityFromIndex("note", req.params.id);
                res.json({ success: true });
            })
        );
    }
});
