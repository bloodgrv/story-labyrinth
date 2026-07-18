// Chapter Versions — alternate drafts of a chapter, shown as tabs next to the main chapter.
// Flat, not a branching tree. See DECISIONS.md's "Story-Layer Chapter Versioning" entry.

export type ChapterVersionSourceType = "ai" | "manual";

export interface ChapterVersion {
    id: string;
    chapterId: string;
    content: string;
    sourceType: ChapterVersionSourceType;
    label: string | null;
    createdAt: Date;
    updatedAt: Date;
}
