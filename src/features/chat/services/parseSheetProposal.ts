const SHEET_PROPOSAL_FENCE = /```sheet-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```sheet-proposal fenced block from a World-Building chat reply (T5
// FS4, see chatContextService.ts's SHEET_PROPOSAL_INSTRUCTIONS). Unlike psych-proposal/
// place-sheet-proposal (JSON objects), the payload here is the raw Lore Sheet markdown itself —
// the model is instructed to emit the whole sheet (existing content + its edits), not a diff, so
// Accept is a wholesale replace. Never persisted server-side — ephemeral until accepted
// (ChatInterface.tsx's handleAcceptSheet/handleAcceptSheetAndSync) or rejected (discarded).
export const parseSheetProposal = (content: string): { cleanedContent: string; sheetProposal: string | null } => {
    const match = content.match(SHEET_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, sheetProposal: null };

    const cleanedContent = content.replace(SHEET_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
    const sheetProposal = match[1].trim();
    if (!sheetProposal) return { cleanedContent, sheetProposal: null };

    return { cleanedContent, sheetProposal };
};
