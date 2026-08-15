import { attempt } from "@jfdi/attempt";

export interface ParsedSexualityProposal {
    orientation?: string;
    dynamic?: string;
    kinks?: string;
    limits?: string;
    blurb?: string;
}

const SEXUALITY_PROPOSAL_FENCE = /```sexuality-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```sexuality-proposal fenced JSON block from a World-Building chat
// reply (docs/Sexuality_Playbook_Design.md — Character template's opt-in sexuality module, see
// chatContextService.ts's SEXUALITY_MODULE_INSTRUCTIONS). Exact sibling of parsePsychProposal.ts:
// single fence per reply, never persisted server-side — ephemeral until the user accepts (merges
// into the anchor entry's metadata.sexualityProfile, ChatInterface.tsx's handleAcceptSexuality)
// or rejects (discarded).
export const parseSexualityProposal = (
    content: string
): { cleanedContent: string; sexualityProposal: ParsedSexualityProposal | null } => {
    const match = content.match(SEXUALITY_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, sexualityProposal: null };

    const cleanedContent = content.replace(SEXUALITY_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, sexualityProposal: null };

    const record = parsed as Record<string, unknown>;
    const orientation = typeof record.orientation === "string" ? record.orientation : undefined;
    const dynamic = typeof record.dynamic === "string" ? record.dynamic : undefined;
    const kinks = typeof record.kinks === "string" ? record.kinks : undefined;
    const limits = typeof record.limits === "string" ? record.limits : undefined;
    const blurb = typeof record.blurb === "string" ? record.blurb : undefined;
    if (!orientation && !dynamic && !kinks && !limits && !blurb) return { cleanedContent, sexualityProposal: null };

    return { cleanedContent, sexualityProposal: { orientation, dynamic, kinks, limits, blurb } };
};
