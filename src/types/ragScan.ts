// RAG Scanner domain types — factual consistency scanning over chapters vs. Codex + prior chapters.

export type RagIssueType = "contradiction" | "state_mismatch" | "timeline" | "other";
export type RagIssueSeverity = "low" | "medium" | "high";
export type RagIssueStatus = "open" | "dismissed" | "resolved";
export type RagScanScope = "chapter" | "story";
// 'completed_with_errors' (B30) — the scan finished but one or more individual chapters threw
// (a bad chapter's own error doesn't abort scanning the rest, so this isn't 'failed', but the
// user still needs to know the results are partial). See RagScan.failedChapterIds below.
export type RagScanStatus = "running" | "completed" | "completed_with_errors" | "failed";

export interface RagScanEvidence {
    // "memory" (C3, docs/CURRENT_BACKLOG.md P0.3) — an active Project Memory entry cited as
    // evidence, only possible when a scan opted into includeMemory.
    source: "chapter" | "codex" | "memory";
    label: string;
    excerpt: string;
}

export interface RagScanIssue {
    id: string;
    scanId: string;
    storyId: string;
    chapterId: string;
    issueType: RagIssueType;
    severity: RagIssueSeverity;
    description: string;
    evidence: RagScanEvidence[];
    suggestedFix: string | null;
    relatedEntityId: string | null;
    status: RagIssueStatus;
    createdAt: Date;
}

export interface RagScan {
    id: string;
    storyId: string;
    scope: RagScanScope;
    chapterId: string | null;
    status: RagScanStatus;
    totalChapters: number;
    processedChapters: number;
    model: string | null;
    error: string | null;
    // B30 — chapter ids that threw during this scan and were skipped (not blank/empty text, a
    // genuine processing failure). Empty array when status isn't 'completed_with_errors'.
    failedChapterIds: string[];
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}
