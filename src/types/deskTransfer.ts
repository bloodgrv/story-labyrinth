// Desk Transfer Log — story-scoped send journal of desk→desk seeds (docs/
// Transfer_Log_And_Settings_IA_Design.md). Records that a seed LEFT chat A for desk B, not the
// destination's own output — never a transcript, never the Active-work tray (brainstormChecklist
// keeps its own Mark-done lifecycle unchanged).

export type DeskTransferEvent = "proposed" | "opened";

// Full allowlist from the v1 seed-path inventory (design doc's "instrument every known seed path
// day one"). Mirrors brainstormChecklist's own `kind` vocabulary where the underlying mechanism is
// shared (handoff/overview_proposal/shuttle/shuttle_return all persist through that one table
// regardless of which desk originates them — fromDesk/toDesk on THIS row is what varies, not the
// kind) — deliberately not renamed per-desk (no "notes_promote" vs "brainstorm_handoff") so a
// transfer row's kind always matches its sourceChecklistItemId's own kind when one exists.
// Deliberately EXCLUDED (scoping call, see DECISIONS.md): note_split (same-desk, stays in Notes)
// and the Notes "Import dump" seed (also same-desk) — this log is desk→desk transfers only, per
// the design doc's own Job description, not every use of the generic seed mechanisms. Extend here
// first if a new desk-to-desk seed mechanism is added later.
export type DeskTransferKind =
    | "shuttle" // Chat Shuttle: Editor/Outline/WB -> Research
    | "shuttle_return" // Chat Shuttle: Research -> origin chat's own tray ("Send brief to origin")
    | "handoff" // Brainstorm/Notes handoff-packet: -> Outline/WB/Notes/Research
    | "overview_proposal" // Brainstorm/Notes overview-proposal "note" sub-type only: -> Notes (synopsis/memory sub-types write story fields/Project Memory, not a desk, so they're excluded)
    | "lore_suggestion" // Outline lore-suggestion "Open in WB"
    | "highlight_to_notes"; // Chat-bubble or chapter-prose text selection -> "Send to Notes chat"

export interface DeskTransfer {
    id: string;
    storyId: string;
    event: DeskTransferEvent;
    kind: DeskTransferKind;
    fromDesk: string;
    fromChatId: string | null;
    fromChatTitleSnapshot: string | null;
    toDesk: string;
    toChatId: string | null;
    toChatTitleSnapshot: string | null;
    subject: string;
    crumb: string | null;
    sourceChecklistItemId: string | null;
    createdAt: Date;
}
