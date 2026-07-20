// RAG Scanner domain types — factual consistency scanning over chapters vs. Codex + prior chapters.

export type RagIssueType = "contradiction" | "state_mismatch" | "timeline" | "other";
export type RagIssueSeverity = "low" | "medium" | "high";
export type RagIssueStatus = "open" | "dismissed" | "resolved";
export type RagScanScope = "chapter" | "story";
export type RagScanStatus = "running" | "completed" | "failed";

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
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}
