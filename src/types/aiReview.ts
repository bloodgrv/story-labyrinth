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

// AR5 — Deep mode's optional context toggles (Quick never sets these in v1's UI, but the shape
// isn't Deep-exclusive so a future Quick toggle wouldn't need a new column).
export interface AiReviewOptions {
    includeMemory?: boolean;
    includeTimeline?: boolean;
    includeLine?: boolean;
    // UI toggle ("Include focused cast Codex") — the server auto-detects which character entries
    // are actually present in the selection when this is true; there is no manual cast picker.
    includeCast?: boolean;
    // Populated server-side after auto-detection resolves — not set by the client. Recorded
    // purely for audit/reproducibility of which entries actually fed a given run.
    castEntryIds?: string[];
}

export interface AiReview {
    id: string;
    storyId: string;
    mode: AiReviewMode;
    chapterIds: string[];
    status: AiReviewStatus;
    options: AiReviewOptions | null;
    model: string | null;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
}
