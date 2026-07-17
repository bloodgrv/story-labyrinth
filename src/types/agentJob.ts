// Agent Jobs domain types — durable background job queue (jobRunner.ts).
// See docs/Agent_Framework_And_Project_Memory_Design.md §3.

export type AgentJobType =
    | "reconcile_index"
    | "rag_scan_chapter"
    | "rag_scan_story"
    | "prune_history"
    | "distill_memory";
// distill_memory is never auto-enqueued by jobRunner.ts's schedule tick (Phase B) — same
// "background LLM spend must not surprise the user" reasoning as rag_scan_story. It's only
// ever created via the manual POST /api/agent/jobs route.

export type AgentJobStatus = "queued" | "running" | "completed" | "failed";

export interface AgentJobProgress {
    processed: number;
    total: number;
    message?: string;
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
