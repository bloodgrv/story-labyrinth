const SHEET_SPAN_PROPOSAL_FENCE = /```sheet-span-proposal\s*\n([\s\S]*?)```/;

// T9 (Lore Sheet inline rework) counterpart to parseSheetProposal.ts — a distinct fence, not a
// reuse of sheet-proposal, since that one is locked to always emit the ENTIRE sheet (FS4) and
// overloading it with conditional "just this bit" instructions risks the model reverting to that
// well-reinforced whole-sheet habit (see docs/Lore_Sheet_Inline_Rework_Design.md §2.5/§3 risk #2).
// The payload here is ONLY the replacement text for the highlighted span — Accept splices it back
// into the current sheetBody at the captured offsets (ChatInterface.tsx's handleAcceptSheetSpan),
// it never replaces the whole document.
export const parseSheetSpanProposal = (content: string): { cleanedContent: string; sheetSpanProposal: string | null } => {
    const match = content.match(SHEET_SPAN_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, sheetSpanProposal: null };

    const cleanedContent = content.replace(SHEET_SPAN_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
    const sheetSpanProposal = match[1].trim();
    if (!sheetSpanProposal) return { cleanedContent, sheetSpanProposal: null };

    return { cleanedContent, sheetSpanProposal };
};
