import { attemptPromise } from "@jfdi/attempt";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { ChapterVersion, ChapterVersionSourceType } from "../../src/types/chapterVersion.js";
import { safetySnapshot } from "./chapterSnapshotsRepository.js";
import { indexChapter } from "./ragIndexService.js";

const rowToVersion = (row: typeof schema.chapterVersions.$inferSelect): ChapterVersion => ({
    id: row.id,
    chapterId: row.chapterId,
    content: row.content,
    sourceType: row.sourceType as ChapterVersionSourceType,
    label: row.label ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date
});

export const listVersionsForChapter = async (chapterId: string): Promise<ChapterVersion[]> => {
    const rows = await db
        .select()
        .from(schema.chapterVersions)
        .where(eq(schema.chapterVersions.chapterId, chapterId))
        .orderBy(desc(schema.chapterVersions.createdAt));
    return rows.map(rowToVersion);
};

export const getVersionById = async (versionId: string): Promise<ChapterVersion | null> => {
    const [row] = await db.select().from(schema.chapterVersions).where(eq(schema.chapterVersions.id, versionId));
    return row ? rowToVersion(row) : null;
};

export const createVersion = async (params: {
    chapterId: string;
    content: string;
    sourceType: ChapterVersionSourceType;
    label?: string | null;
}): Promise<ChapterVersion> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.chapterVersions)
        .values({
            id: crypto.randomUUID(),
            chapterId: params.chapterId,
            content: params.content,
            sourceType: params.sourceType,
            label: params.label ?? null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToVersion(row);
};

// Autosave target for a version's own editor — mirrors chapters' PUT /content path, just scoped
// to a chapterVersions row instead.
export const updateVersionContent = async (versionId: string, content: string): Promise<ChapterVersion | null> => {
    const [row] = await db
        .update(schema.chapterVersions)
        .set({ content, updatedAt: new Date() })
        .where(eq(schema.chapterVersions.id, versionId))
        .returning();
    return row ? rowToVersion(row) : null;
};

export const setVersionLabel = async (versionId: string, label: string | null): Promise<ChapterVersion | null> => {
    const [row] = await db
        .update(schema.chapterVersions)
        .set({ label })
        .where(eq(schema.chapterVersions.id, versionId))
        .returning();
    return row ? rowToVersion(row) : null;
};

export const deleteVersion = async (versionId: string): Promise<void> => {
    await db.delete(schema.chapterVersions).where(eq(schema.chapterVersions.id, versionId));
};

// "Compile" (Project Saves scoping decision: main chapter stays king, versions are temp until
// explicitly promoted). Copies the version's content into the live chapter — one-directional,
// not a toggle — and reindexes the chapter for RAG the same way any other content change would,
// since this bypasses the client-side autosave path that normally triggers that debounce.
//
// Takes an unconditional chapterSnapshots safety checkpoint of the chapter's pre-compile content
// first (P0.2b) — when this action originally shipped it had no backup at all; closing that gap
// was the explicit reason P0.2b's compile/restore interaction was scoped the way it was, see
// DECISIONS.md's "Chapter Content Undo/Restore (P0.2b)" entry.
export const compileVersionToChapter = async (
    chapterId: string,
    versionId: string
): Promise<{ chapter: typeof schema.chapters.$inferSelect; version: ChapterVersion }> => {
    const version = await getVersionById(versionId);
    if (!version) throw new Error(`Version not found: ${versionId}`);
    if (version.chapterId !== chapterId) throw new Error(`Version ${versionId} does not belong to chapter ${chapterId}`);

    const [existing] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!existing) throw new Error(`Chapter not found: ${chapterId}`);
    if (existing.content !== version.content) await safetySnapshot(chapterId, existing.content, versionId);

    const [chapter] = await db
        .update(schema.chapters)
        .set({ content: version.content })
        .where(eq(schema.chapters.id, chapterId))
        .returning();
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    void attemptPromise(() => indexChapter(chapterId));

    return { chapter, version };
};
