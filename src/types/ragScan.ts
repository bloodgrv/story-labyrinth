// RAG Scanner domain types — factual consistency scanning over chapters vs. Codex + prior chapters.

export type RagIssueType = "contradiction" | "state_mismatch" | "timeline" | "other";
export type RagIssueSeverity = "low" | "medium" | "high";
export type RagIssueStatus = "open" | "dismissed" | "resolved";
export type RagScanScope = "chapter" | "story";
export type RagScanStatus = "running" | "completed" | "failed";

export interface RagScanEvidence {
    source: "chapter" | "codex";
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
