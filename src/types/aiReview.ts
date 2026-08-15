// AI Review domain types — manuscript-editor judgment pass over chapters (dev/continuity/voice/
// line). Separate from RAG Scanner's factual-consistency types (src/types/ragScan.ts) — see
// docs/AI_Review_Design.md lock #11.

export type AiReviewTag = "dev" | "continuity" | "voice" | "line";
export type AiReviewSeverity = "low" | "medium" | "high";
export type AiReviewFindingStatus = "open" | "dismissed" | "resolved";
export type AiReviewMode = "quick" | "deep";
export type AiReviewStatus = "running" | "completed" | "failed";

export interface AiReviewFinding {
    id: string;
    reviewId: string;
    storyId: string;
    chapterId: string | null;
    tag: AiReviewTag;
    severity: AiReviewSeverity;
    title: string;
    description: string;
    excerpt: string | null;
    excerptStart: number | null;
    excerptEnd: number | null;
    direction: string | null;
    status: AiReviewFindingStatus;
    createdAt: Date;
}

export interface AiReview {
    id: string;
    storyId: string;
    mode: AiReviewMode;
    chapterIds: string[];
    status: AiReviewStatus;
    model: string | null;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
}
