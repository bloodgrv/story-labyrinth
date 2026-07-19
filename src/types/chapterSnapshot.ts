// Chapter Snapshots — linear undo history for a chapter's own content (P0.2b). Unrelated to
// ChapterVersion (alternate drafts) — see DECISIONS.md's "Story-Layer Chapter Versioning (P0.2)"
// entry for why the two must not be conflated.

export type ChapterSnapshotSourceType = "auto" | "manual" | "restore";

export interface ChapterSnapshot {
    id: string;
    chapterId: string;
    content: string;
    sourceType: ChapterSnapshotSourceType;
    sourceRef: string | null;
    label: string | null;
    createdAt: Date;
    // Computed server-side on read (not stored) — first ~150 chars of the snapshot's plain text,
    // for the History list preview. See server/routes/chapters.ts's GET /:chapterId/snapshots.
    preview: string;
}
