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

// A fact the writer wants tracked but NOT surfaced into AI-generated prose/context until it's
// meant to be known — e.g. a spy's real identity behind a cover story. `revealed` is the always-
// authoritative manual gate (2026-08-14 design: "manual toggle + chapter-scoped reveal" — manual
// wins, chapter-scoping is additive, never the other way around). `revealedAtChapterId` is an
// optional convenience: once a chapter-aware AI surface (Editor chat, RAG Scanner) is generating
// for a chapter at or past that chapter's order, the secret is treated as revealed there too,
// without requiring the writer to remember to flip the manual toggle mid-draft. Never auto-set by
// any AI proposal flow — a secret only ever becomes revealed through explicit user action.
export interface CodexSecretItem {
    id: string;
    value: string;
    revealed: boolean;
    revealedAtChapterId: string | null;
}

// Physical state snapshot stored per lorebook entry.
// `appearance` is labeled fields (Hair/Facial Features/Physique/etc — see a reference character
// sheet's "Physical Appearance" section), same shape as customFields, not a flat list like
// wardrobe/wounds/items — those stay flat since a single free-text line per entry fits them
// (e.g. one wardrobe item, one wound), where appearance details read better as a labeled
// attribute the way Custom Fields already work. See DECISIONS.md's "Codex Appearance
// Relabeling" entry for the 2026-07-17 migration of pre-existing flat-string appearance data.
export interface CodexState {
    wardrobe: CodexStateItem[];
    appearance: CodexCustomField[];
    wounds: CodexStateItem[];
    items: CodexStateItem[];
    customFields: CodexCustomField[];
    // Optional (not every existing CodexState literal in this codebase sets it) — always treat a
    // missing array as empty, never as "unknown"/undefined-is-different-from-empty.
    secrets?: CodexSecretItem[];
}

// AI-extracted draft entry from an uploaded PDF/DOCX/MD/TXT reference document (see
// server/services/documentImportService.ts) — not persisted, reviewed/edited in the normal
// entry-creation UI before the user saves it.
export interface DocumentImportDraft {
    name: string;
    category: "character" | "location" | "item" | "event" | "note" | "synopsis" | "starting scenario" | "timeline";
    description: string;
    tags: string[];
    codexState: CodexState;
    // The largest embedded image found in the source document (PDF/DOCX). null when none found.
    // Converted into a File client-side (see entryFormUtils.ts) to plug into the existing
    // imageFile form field.
    image: { dataUrl: string; filename: string } | null;
}

// "restore" marks a snapshot created by restoring an earlier one — see codexService.ts's
// restoreSnapshot. Keeps restore itself part of the non-destructive history, not a silent rewind.
export type CodexSourceType = "user" | "chat" | "ai_suggestion" | "restore";
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
    // User-set name for this snapshot (Project Saves Phase 1) — null until named via the
    // History panel. Set retroactively, not at snapshot-creation time.
    label: string | null;
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
