// A single named item within a codex state array (wardrobe, appearance, wounds, items)
export interface CodexStateItem {
    id: string;
    value: string;
}

// A user-defined key/value field attached to a codex entry
export interface CodexCustomField {
    key: string;
    label: string;
    value: string;
}

// Physical state snapshot stored per lorebook entry
export interface CodexState {
    wardrobe: CodexStateItem[];
    appearance: CodexStateItem[];
    wounds: CodexStateItem[];
    items: CodexStateItem[];
    customFields: CodexCustomField[];
}

export type CodexSourceType = "user" | "chat" | "ai_suggestion";
export type CodexPendingSourceType = "chat" | "ai";
export type CodexPendingStatus = "pending" | "approved" | "rejected";

// A point-in-time snapshot of a codex entry (append-only history)
export interface CodexSnapshot {
    id: string;
    entryId: string;
    description: string;
    codexState: CodexState | null;
    sourceType: CodexSourceType;
    sourceRef: string | null;
    createdAt: Date;
}

// An AI-proposed change awaiting user approval
export interface CodexPendingChange {
    id: string;
    entryId: string;
    proposedDescription: string | null;
    proposedState: CodexState | null;
    proposedTags: string[] | null;
    proposedNeedsFleshingOut: boolean | null;
    sourceType: CodexPendingSourceType;
    sourceRef: string | null;
    status: CodexPendingStatus;
    createdAt: Date;
    resolvedAt: Date | null;
}
