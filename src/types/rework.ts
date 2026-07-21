// Shared types for the Selection/Focus Rework Bridge (docs/Chat_Panel_Integrations_Design.md §3).
// A FocusTarget identifies a specific span/field a rework is bound to, precisely enough to be
// re-resolved later (after a multi-turn chat conversation) and safely re-applied on Accept.
// Shaped as a discriminated union — the chapter-editor-selection case (R0-R3) re-resolves a live
// Lexical selection and replaces it client-side; the Lorebook/Outline cases (R4/R8) have no
// client-side "apply" at all — Accept is just the existing codex-proposal/outline-proposal
// approve flow, so their targets exist only to build the rework context sent to the model and to
// preview in ReworkCard, not to be re-resolved against a live DOM/editor.
export type FocusTarget =
    | {
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
      }
    | {
          kind: "lorebook-field";
          entryId: string;
          field: "description";
          selectionStart: number;
          selectionEnd: number;
          text: string;
      }
    | {
          kind: "lorebook-structured-field";
          entryId: string;
          field: "wardrobe" | "appearance" | "wounds" | "items" | "customFields";
          itemId: string;
          text: string;
      }
    | {
          kind: "outline-item";
          outlineItemId: string;
          text: string;
      }
    | {
          // P0.4 K2 — whole-note rework only, no sub-span. react-simple-wysiwyg's contentEditable
          // body has neither Lexical's node-key selection (chapter case) nor a plain <textarea>'s
          // character offsets (lorebook-field case), so precise span capture was deliberately
          // scoped out this pass (same kind of narrowing R4 did for structured Codex fields) —
          // shaped identically to outline-item for that reason.
          kind: "note-item";
          noteId: string;
          text: string;
      };

// Narrowed alias for call sites that only ever handle the chapter-editor case (Lexical re-resolve
// + replace) — chapterSelectionAdapter.ts's applyChapterSelectionReplace and ChatInterface.tsx's
// proseProposals both need this narrower shape rather than the full FocusTarget union, since
// Lorebook/Outline rework never produces a prose-proposal to apply this way (see their own Accept
// paths — plain codex-proposal / outline-proposal approval, no client-side replace step).
export type ChapterSelectionTarget = Extract<FocusTarget, { kind: "chapter-selection" }>;

// Local before/selection/after context window around a FocusTarget, injected into the bound
// chat's context alongside its normal context pack (docs/Chat_Panel_Integrations_Design.md §2.1).
export interface FocusPacket {
    before: string;
    selection: string;
    after: string;
    beforeTruncated: boolean;
    afterTruncated: boolean;
}
