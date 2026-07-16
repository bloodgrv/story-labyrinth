// Agent Jobs domain types — durable background job queue (jobRunner.ts).
// See docs/Agent_Framework_And_Project_Memory_Design.md §3.

export type AgentJobType = "reconcile_index" | "rag_scan_chapter" | "rag_scan_story" | "prune_history";
// NOTE: 'distill_memory' is Phase B only per the design doc §3.4 — deliberately excluded here.

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
