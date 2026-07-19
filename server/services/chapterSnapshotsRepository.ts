import { attemptPromise } from "@jfdi/attempt";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { ChapterSnapshot, ChapterSnapshotSourceType } from "../../src/types/chapterSnapshot.js";
import { extractTextFromLexical } from "./entityDetector.js";
import { indexChapter } from "./ragIndexService.js";

// 'auto' snapshots are throttled to roughly this often per chapter — chapters autosave
// continuously while typing (unlike Codex, which only snapshots on discrete mutations), so
// snapshotting on every save would produce hundreds of rows per writing session. See
// DECISIONS.md's "Chapter Content Undo/Restore (P0.2b)" entry for the scoping trail.
const AUTO_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

const PREVIEW_LENGTH = 150;

const rowToSnapshot = (row: typeof schema.chapterSnapshots.$inferSelect): ChapterSnapshot => ({
    id: row.id,
    chapterId: row.chapterId,
    content: row.content,
    sourceType: row.sourceType as ChapterSnapshotSourceType,
    sourceRef: row.sourceRef ?? null,
    label: row.label ?? null,
    createdAt: row.createdAt as unknown as Date,
    preview: extractTextFromLexical(row.content).slice(0, PREVIEW_LENGTH)
});

// createdAt alone isn't a reliable sort key: this column only has 1-second resolution (same
// epoch-seconds behavior as every other timestamp column in this codebase), and restoreSnapshot/
// compileVersionToChapter each create two snapshots back-to-back in one request — easily landing
// in the same second. Confirmed live: a restore's safety-checkpoint and its result snapshot tied
// on createdAt, and `ORDER BY createdAt DESC` alone returned them in insertion order (oldest
// first) instead of newest-first. SQLite's implicit rowid increases monotonically with insertion,
// so it's a reliable secondary sort key for breaking those ties correctly.
export const listSnapshotsForChapter = async (chapterId: string): Promise<ChapterSnapshot[]> => {
    const rows = await db
        .select()
        .from(schema.chapterSnapshots)
        .where(eq(schema.chapterSnapshots.chapterId, chapterId))
        .orderBy(desc(schema.chapterSnapshots.createdAt), desc(sql`rowid`));
    return rows.map(rowToSnapshot);
};

export const getSnapshotById = async (snapshotId: string): Promise<ChapterSnapshot | null> => {
    const [row] = await db.select().from(schema.chapterSnapshots).where(eq(schema.chapterSnapshots.id, snapshotId));
    return row ? rowToSnapshot(row) : null;
};

export const createSnapshot = async (params: {
    chapterId: string;
    content: string;
    sourceType: ChapterSnapshotSourceType;
    sourceRef?: string | null;
    label?: string | null;
}): Promise<ChapterSnapshot> => {
    const [row] = await db
        .insert(schema.chapterSnapshots)
        .values({
            id: crypto.randomUUID(),
            chapterId: params.chapterId,
            content: params.content,
            sourceType: params.sourceType,
            sourceRef: params.sourceRef ?? null,
            label: params.label ?? null,
            createdAt: new Date()
        })
        .returning();
    return rowToSnapshot(row);
};

export const setSnapshotLabel = async (snapshotId: string, label: string | null): Promise<ChapterSnapshot | null> => {
    const [row] = await db
        .update(schema.chapterSnapshots)
        .set({ label })
        .where(eq(schema.chapterSnapshots.id, snapshotId))
        .returning();
    return row ? rowToSnapshot(row) : null;
};

const getLatestSnapshot = async (chapterId: string): Promise<ChapterSnapshot | null> => {
    const [row] = await db
        .select()
        .from(schema.chapterSnapshots)
        .where(eq(schema.chapterSnapshots.chapterId, chapterId))
        .orderBy(desc(schema.chapterSnapshots.createdAt))
        .limit(1);
    return row ? rowToSnapshot(row) : null;
};

// Called from the chapter content PUT route before applying a content change. Snapshots the
// OLD (about-to-be-replaced) content, but only if it's actually different from what's being
// saved AND the last snapshot for this chapter (of any sourceType) is older than the throttle
// interval — a coarse "checkpoint every ~15 minutes of active editing", not a snapshot per save.
export const maybeAutoSnapshot = async (chapterId: string, oldContent: string, newContent: string): Promise<void> => {
    if (oldContent === newContent) return;

    const latest = await getLatestSnapshot(chapterId);
    if (latest && Date.now() - latest.createdAt.getTime() < AUTO_SNAPSHOT_INTERVAL_MS) return;

    await createSnapshot({ chapterId, content: oldContent, sourceType: "auto" });
};

// Unconditional safety checkpoint before a one-way, un-backed-up overwrite (Compile from
// chapterVersions, or right before a Restore below) — bypasses the throttle above on purpose,
// since these are rare, deliberate, high-stakes actions rather than routine autosaves.
export const safetySnapshot = async (chapterId: string, content: string, sourceRef?: string | null): Promise<void> => {
    await createSnapshot({ chapterId, content, sourceType: "auto", sourceRef: sourceRef ?? null });
};

// Non-destructive restore (Project Saves Phase 1's Codex pattern, adapted): applies the target
// snapshot's content to the live chapter, then takes a NEW snapshot of the result tagged
// 'restore' — the restore itself becomes part of history, not a silent rewind. Unlike Codex
// (which snapshots every mutation, so restoring can never lose anything), this project's 'auto'
// snapshots are throttled — so this ALSO takes an unconditional safety snapshot of whatever was
// live immediately before the restore, closing that gap rather than inheriting it.
export const restoreSnapshot = async (
    chapterId: string,
    snapshotId: string
): Promise<{ chapter: typeof schema.chapters.$inferSelect; snapshot: ChapterSnapshot }> => {
    const target = await getSnapshotById(snapshotId);
    if (!target) throw new Error(`Snapshot not found: ${snapshotId}`);
    if (target.chapterId !== chapterId) throw new Error(`Snapshot ${snapshotId} does not belong to chapter ${chapterId}`);

    const [existing] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!existing) throw new Error(`Chapter not found: ${chapterId}`);

    if (existing.content !== target.content) await safetySnapshot(chapterId, existing.content);

    const [chapter] = await db
        .update(schema.chapters)
        .set({ content: target.content })
        .where(eq(schema.chapters.id, chapterId))
        .returning();

    void attemptPromise(() => indexChapter(chapterId));

    const snapshot = await createSnapshot({
        chapterId,
        content: target.content,
        sourceType: "restore",
        sourceRef: snapshotId
    });

    return { chapter, snapshot };
};
