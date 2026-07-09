export interface ParsedMessageProseProposal {
    cleanedContent: string;
    proseProposal: string | null;
}

const PROSE_PROPOSAL_FENCE = /```prose-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```prose-proposal fenced plain-text block out of a chat reply,
// matching the wire format documented in server/services/chatContextService.ts's system prompt
// (PROSE_PROPOSAL_INSTRUCTIONS). Only one prose proposal per reply is supported, matching that
// same instruction. Unlike parseCodexProposals, the block is plain prose, not JSON.
export const parseProseProposal = (content: string): ParsedMessageProseProposal => {
    const match = content.match(PROSE_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, proseProposal: null };

    const proseProposal = match[1].trim() || null;
    const cleanedContent = content.replace(PROSE_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
    return { cleanedContent, proseProposal };
};
