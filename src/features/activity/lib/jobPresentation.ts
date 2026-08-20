// Shared presentation helpers for agentJobs — used by both the Settings "Recent Jobs" card
// and the Activity Stoplight (docs/Activity_Stoplight_Design.md), so labels/colors never drift
// between the two surfaces.
import type { WorkspaceTool } from "@/features/stories/context/StoryContext";
import type { AgentJob, AgentJobType } from "@/types/agentJob";

export const STATUS_VARIANT: Record<AgentJob["status"], "default" | "secondary" | "destructive" | "outline"> = {
    queued: "outline",
    running: "secondary",
    completed: "default",
    failed: "destructive"
};

export const JOB_TYPE_LABELS: Record<AgentJobType, string> = {
    reconcile_index: "Reindex reconciliation",
    rag_scan_chapter: "Chapter scan",
    rag_scan_story: "Story scan",
    prune_history: "History cleanup",
    distill_memory: "Memory distillation",
    distill_writer_prefs: "Writer preferences check",
    suggest_codex_updates: "Codex update suggestions",
    graph_suggest_edges: "Relationship suggestions",
    timeline_suggest_pins: "Timeline pin suggestions",
    ai_review_quick: "AI Review (Quick)",
    ai_review_deep: "AI Review (Deep)"
};

// Where "Jump" should take the user for a working job of this type — omitted entries mean
// no clear single destination (reconcile_index/prune_history are global housekeeping with no
// story-scoped surface; suggest_codex_updates targets a specific chapter's pending-changes tray,
// which isn't reachable from a job row alone) — the design doc's "Jump when known" allows this.
export const JOB_TYPE_JUMP_TOOL: Partial<Record<AgentJobType, WorkspaceTool>> = {
    rag_scan_chapter: "scanner",
    rag_scan_story: "scanner",
    distill_memory: "memory",
    graph_suggest_edges: "relationships",
    timeline_suggest_pins: "story-timeline",
    ai_review_quick: "ai-review",
    ai_review_deep: "ai-review"
};

// "0:42" style elapsed-time formatter for a running job's clock.
export function formatElapsed(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
