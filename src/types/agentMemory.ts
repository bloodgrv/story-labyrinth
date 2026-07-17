// Agent Memories domain types — Project Persistent Memory (Phase B).
// See docs/Agent_Framework_And_Project_Memory_Design.md §4.

export type AgentMemoryCategory =
    | "established_fact"
    | "open_thread"
    | "event"
    | "voice_rule"
    | "project_note"
    | "writer_pref";

export const AGENT_MEMORY_CATEGORIES: AgentMemoryCategory[] = [
    "established_fact",
    "open_thread",
    "event",
    "voice_rule",
    "project_note",
    "writer_pref"
];

export const AGENT_MEMORY_CATEGORY_LABELS: Record<AgentMemoryCategory, string> = {
    established_fact: "Established Fact",
    open_thread: "Open Thread",
    event: "Event",
    voice_rule: "Voice Rule",
    project_note: "Project Note",
    writer_pref: "Writer Preference"
};

export type AgentMemoryStatus = "pending" | "active" | "rejected" | "superseded";
export type AgentMemoryCreatedBy = "job" | "user" | "chat";

export interface AgentMemoryEvidence {
    source: string;
    label: string;
    excerpt: string;
}

export interface AgentMemory {
    id: string;
    storyId: string | null;
    memoryKey: string;
    category: AgentMemoryCategory;
    title: string;
    body: string;
    status: AgentMemoryStatus;
    sourceJobId: string | null;
    sourceScanId: string | null;
    sourceEvidence: AgentMemoryEvidence[] | null;
    pinned: boolean;
    createdBy: AgentMemoryCreatedBy;
    createdAt: Date;
    updatedAt: Date;
    approvedAt: Date | null;
}
