// Agent Jobs domain types — durable background job queue (jobRunner.ts).
// See docs/Agent_Framework_And_Project_Memory_Design.md §3.

export type AgentJobType =
    | "reconcile_index"
    | "rag_scan_chapter"
    | "rag_scan_story"
    | "prune_history"
    | "distill_memory"
    | "suggest_codex_updates"
    | "graph_suggest_edges"
    | "timeline_suggest_pins"
    | "ai_review_quick";
// distill_memory is never auto-enqueued by jobRunner.ts's schedule tick (Phase B) — same
// "background LLM spend must not surprise the user" reasoning as rag_scan_story. It's only
// ever created via the manual POST /api/agent/jobs route.
// suggest_codex_updates (C5, docs/CURRENT_BACKLOG.md P0.3) follows the exact same precedent —
// never auto-enqueued, manual POST /api/agent/jobs only (see codexCompileJob.ts).
// graph_suggest_edges (P1.2 G1.5+, docs/CURRENT_BACKLOG.md) follows the same precedent —
// manual POST /api/agent/jobs only (see graphSuggestEdgesJob.ts). Produces storyGraphEdges rows
// with status: "pending", source: "ai_suggested" — reviewed through the existing Pending tab.
// timeline_suggest_pins (TL11B, docs/Story_Timeline_Design.md) follows the exact same precedent —
// manual POST /api/agent/jobs only (see timelineSuggestPinsJob.ts). Produces storyTimelinePins
// rows with status: "pending", source: "ai_suggested" — reviewed through their own Pending tab.
// ai_review_quick (AR1, docs/AI_Review_Design.md) follows the same precedent — manual trigger
// only (see aiReviewJobs.ts). Writes aiReviews/aiReviewFindings, its own tables separate from
// ragScans/ragScanIssues (design lock #11).

export type AgentJobStatus = "queued" | "running" | "completed" | "failed";

export interface AgentJobProgress {
    processed: number;
    total: number;
    message?: string;
    // rag_scan_story only (B4, docs/CURRENT_BACKLOG.md P2): the ragScans row this attempt is
    // writing to. Recorded before each chapter, not just after, so a requeue after a crash can
    // find it (via getScan) and resume into the same scan at `processed` rather than starting a
    // fresh scan from chapter 0 — see ragScanJobs.ts's runRagScanStoryJob.
    scanId?: string;
    // ai_review_quick only: the aiReviews row this attempt is writing to (same resume-after-crash
    // rationale as scanId above).
    reviewId?: string;
}

export interface AgentJob {
    id: string;
    jobType: AgentJobType;
    status: AgentJobStatus;
    storyId: string | null;
    entityId: string | null;
    payload: unknown;
    result: unknown;
    progress: AgentJobProgress | null;
    attempts: number;
    maxAttempts: number;
    error: string | null;
    createdAt: Date;
    queuedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    lastAttemptAt: Date | null;
}
