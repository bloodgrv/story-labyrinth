import type { FocusPacket, FocusTarget } from "@/types/rework";

// Lorebook-field counterpart to chapterSelectionAdapter.ts — but there's no "apply" function
// here, unlike the chapter case. Accept for a lorebook-field rework is just the existing
// codex-proposal approve flow (chatCodexService.proposeEntryModification -> codexPendingChanges
// -> CodexProposalTray Approve -> approvePendingChange), which already patches the live entry
// directly server-side. This adapter only builds the capture (target + context packet) half of
// the pipeline; see reworkContext in ChatInterface.tsx for the instruction text that tells the
// model to reply with a full-field-value codex-proposal instead of a fragment.
const WINDOW_SIZE = 2000;

// Captures a sub-span selection from the plain <Textarea> description field (native
// selectionStart/selectionEnd — no Lexical, no node keys; the field's live value at capture time
// is split into before/selection/after, same shape as buildChapterFocusWindow but string-slice
// based since there's no document tree to walk). Returns null if nothing is selected.
export const captureDescriptionSelection = (
    entryId: string,
    textarea: HTMLTextAreaElement
): { target: FocusTarget; packet: FocusPacket } | null => {
    const { selectionStart, selectionEnd, value } = textarea;
    if (selectionStart === selectionEnd) return null;

    const before = value.slice(0, selectionStart);
    const selection = value.slice(selectionStart, selectionEnd);
    const after = value.slice(selectionEnd);

    return {
        target: {
            kind: "lorebook-field",
            entryId,
            field: "description",
            selectionStart,
            selectionEnd,
            text: selection
        },
        packet: {
            before: before.length > WINDOW_SIZE ? before.slice(-WINDOW_SIZE) : before,
            after: after.length > WINDOW_SIZE ? after.slice(0, WINDOW_SIZE) : after,
            selection,
            beforeTruncated: before.length > WINDOW_SIZE,
            afterTruncated: after.length > WINDOW_SIZE
        }
    };
};
