import { parseSheetHeadings } from "@/features/lorebook/components/form/sheetTemplates";
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

// Walks headings (in document order, from parseSheetHeadings) to find which `## Section` an
// offset falls under — null if the offset is before the first heading.
const sectionAt = (headings: { heading: string; index: number }[], offset: number): string | null => {
    let current: string | null = null;
    for (const h of headings) {
        if (h.index <= offset) current = h.heading;
        else break;
    }
    return current;
};

// T9 (Lore Sheet inline rework, docs/Lore_Sheet_Inline_Rework_Design.md) — sibling to
// captureDescriptionSelection above, same plain-<textarea> selectionStart/selectionEnd capture,
// but additionally resolves which `## Section` heading the selection falls under (via the sheet's
// own parseSheetHeadings) and rejects a selection that crosses two different sections (v1 scope,
// design doc §3 risk #3 — "reject rather than support"). Returns "empty"/"cross-section" instead
// of null for the two distinct failure cases so the caller can show a specific toast.
export const captureSheetSelection = (
    entryId: string,
    textarea: HTMLTextAreaElement
): { target: FocusTarget; packet: FocusPacket } | "empty" | "cross-section" => {
    const { selectionStart, selectionEnd, value } = textarea;
    if (selectionStart === selectionEnd) return "empty";

    const headings = parseSheetHeadings(value);
    const startSection = sectionAt(headings, selectionStart);
    const endSection = sectionAt(headings, selectionEnd - 1);
    if (startSection !== endSection) return "cross-section";

    const before = value.slice(0, selectionStart);
    const selection = value.slice(selectionStart, selectionEnd);
    const after = value.slice(selectionEnd);

    return {
        target: {
            kind: "lorebook-sheet-field",
            entryId,
            selectionStart,
            selectionEnd,
            text: selection,
            section: startSection
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
