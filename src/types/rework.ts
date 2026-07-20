// Shared types for the Selection/Focus Rework Bridge (docs/Chat_Panel_Integrations_Design.md §3).
// A FocusTarget identifies a specific span/field a rework is bound to, precisely enough to be
// re-resolved later (after a multi-turn chat conversation) and safely re-applied on Accept.
// Shaped as a discriminated union so a later Lorebook/Outline pass can add its own target kinds
// without touching this one — v1 only needs the chapter-editor-selection case.
export type FocusTarget = {
    kind: "chapter-selection";
    chapterId: string;
    // Lexical node keys + offsets captured at the moment of "Rework in chat" — not just the
    // selection's plain text — so the exact span can be re-located and re-selected later, even
    // though React state (and thus the live Lexical selection) doesn't survive across chat turns.
    anchorKey: string;
    anchorOffset: number;
    focusKey: string;
    focusOffset: number;
    isBackward: boolean;
    // The captured selection's own text, kept both for display (ReworkCard) and as a safety
    // check at apply time — if the chapter changed since capture, the reconstructed selection's
    // text won't match this anymore, and applyChapterSelectionReplace degrades rather than guesses.
    text: string;
};

// Local before/selection/after context window around a FocusTarget, injected into the bound
// chat's context alongside its normal context pack (docs/Chat_Panel_Integrations_Design.md §2.1).
export interface FocusPacket {
    before: string;
    selection: string;
    after: string;
    beforeTruncated: boolean;
    afterTruncated: boolean;
}
