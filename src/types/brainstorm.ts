import type { LorebookEntry } from "./story.js";

// P0.4 B0-B4 — Brainstorm Hub (docs/Chat_Panel_Integrations_Design.md §5). Shared between
// server (chatContextService.ts, brainstormChecklistService.ts, brainstormSlotsService.ts) and
// client (fence parsers, tray UI) — same cross-import pattern as src/types/worldbuilding.ts.

// The fixed 5-slot "known/unknown" project-setup checklist (B2's playbook depth control,
// confirmed with user as prompt-driven rather than a tracked interview state machine — this is
// the ONLY persisted "slot" concept; everything else about interview depth lives in the model's
// system prompt, see chatContextService.ts's STYLE_HINTS). Deliberately small and fixed rather
// than user-extensible — adding a slot is a code change, not a data migration concern.
export const BRAINSTORM_SLOTS: readonly { key: string; label: string }[] = [
    { key: "premise", label: "Premise / Logline" },
    { key: "genre_tone", label: "Genre & Tone" },
    { key: "protagonist", label: "Protagonist(s)" },
    { key: "setting", label: "Setting" },
    { key: "conflict_stakes", label: "Central Conflict & Stakes" }
];

export type BrainstormSlotKey = (typeof BRAINSTORM_SLOTS)[number]["key"];
export type BrainstormSlotStatus = "known" | "unknown";

export interface BrainstormSlot {
    slotKey: string;
    label: string;
    status: BrainstormSlotStatus;
}

// "note_split" (P0.4 K2/K3) reuses this same table/status lifecycle for the Notes chat's
// split-dump-into-many-notes proposal — see NOTE_SPLIT_PROPOSAL_INSTRUCTIONS (chatContextService.ts)
// and NotesChecklistTray.tsx. The table/service/route are chatType-agnostic (confirmed before
// adding this — no chatType check anywhere in the checklist write path), so no schema change was
// needed to add a third kind.
export type BrainstormChecklistKind = "overview_proposal" | "handoff" | "note_split";
export type BrainstormChecklistStatus = "pending" | "opened" | "done" | "dismissed";

// ```overview-proposal fence payload (chatContextService.ts's OVERVIEW_PROPOSAL_INSTRUCTIONS) —
// covers all of B3's "Overview SoT" writes (synopsis, overview note, opt-in memory) through one
// fence type, discriminated by proposalType, rather than three separate fences.
export type OverviewProposalPayload =
    | { proposalType: "synopsis"; content: string; slotKey?: string }
    | { proposalType: "note"; title: string; content: string; noteType: "idea" | "research" | "todo" | "other"; slotKey?: string }
    | { proposalType: "memory"; title: string; body: string; category: string; slotKey?: string };

// ```handoff-packet fence payload (HANDOFF_PACKET_INSTRUCTIONS) — B3/B4's "Handoff →
// Outline/WB/Notes/Research" writes. seedName/seedCategory are only meaningful for
// destination: "worldbuilding" (feeds the existing StoryContext.pendingLorebookSeed mechanism
// unchanged, see LorebookPage.tsx); every other destination only ever uses summary/detail.
export interface HandoffPacket {
    destination: "outline" | "worldbuilding" | "notes" | "research";
    summary: string;
    detail: string;
    seedName?: string;
    seedCategory?: LorebookEntry["category"];
}

// ```note-split-proposal fence payload (NOTE_SPLIT_PROPOSAL_INSTRUCTIONS) — P0.4 K2/K4's
// paste-a-dump-and-split-it-into-many-notes capability. One fence, one payload, many notes —
// mirrors overview-proposal/handoff-packet's "array inside one fence" shape rather than requiring
// the model to emit N separate note-proposal fences (note-proposal stays capped at one per reply).
export interface NoteSplitProposalPayload {
    notes: { title: string; content: string; type: "idea" | "research" | "todo" | "other" }[];
}

export type BrainstormChecklistPayload = OverviewProposalPayload | HandoffPacket | NoteSplitProposalPayload;

export interface BrainstormChecklistItem {
    id: string;
    chatId: string;
    storyId: string;
    kind: BrainstormChecklistKind;
    status: BrainstormChecklistStatus;
    payload: BrainstormChecklistPayload;
    sourceMessageId: string | null;
    createdAt: string;
    updatedAt: string;
}
