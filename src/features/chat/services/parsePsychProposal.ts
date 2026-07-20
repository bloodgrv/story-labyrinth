import { attempt } from "@jfdi/attempt";

export interface ParsedPsychProposal {
    mbti?: string;
    enneagram?: string;
    blurb?: string;
}

const PSYCH_PROPOSAL_FENCE = /```psych-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```psych-proposal fenced JSON block from a World-Building chat reply
// (P0.4 B5, Character template's opt-in psych module — see chatContextService.ts's
// PSYCH_MODULE_INSTRUCTIONS). Mirrors parseNoteProposals.ts exactly: single fence per reply,
// never persisted server-side — ephemeral until the user accepts (merges into the anchor entry's
// metadata.psychProfile, ChatInterface.tsx's handleAcceptPsych) or rejects (discarded).
export const parsePsychProposal = (content: string): { cleanedContent: string; psychProposal: ParsedPsychProposal | null } => {
    const match = content.match(PSYCH_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, psychProposal: null };

    const cleanedContent = content.replace(PSYCH_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, psychProposal: null };

    const record = parsed as Record<string, unknown>;
    const mbti = typeof record.mbti === "string" ? record.mbti : undefined;
    const enneagram = typeof record.enneagram === "string" ? record.enneagram : undefined;
    const blurb = typeof record.blurb === "string" ? record.blurb : undefined;
    if (!mbti && !enneagram && !blurb) return { cleanedContent, psychProposal: null };

    return { cleanedContent, psychProposal: { mbti, enneagram, blurb } };
};
