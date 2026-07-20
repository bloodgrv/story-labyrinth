import { attempt } from "@jfdi/attempt";
import type { OverviewProposalPayload } from "@/types/brainstorm";

const OVERVIEW_PROPOSAL_FENCE = /```overview-proposal\s*\n([\s\S]*?)```/;
const VALID_NOTE_TYPES = ["idea", "research", "todo", "other"];

// Extracts a model-emitted ```overview-proposal block from a Brainstorm chat reply, matching the
// wire format documented in chatContextService.ts's OVERVIEW_PROPOSAL_INSTRUCTIONS. Mirrors
// parseNoteProposals.ts (single fence, non-'g') — one overview proposal per reply. Unlike
// note-proposal, this IS persisted immediately server-side on parse (as a pending
// brainstormChecklist row, see ChatInterface.tsx) rather than staying purely ephemeral, since
// B4's tray needs it durable across reloads.
const isValidPayload = (value: Record<string, unknown>): value is OverviewProposalPayload => {
    if (value.proposalType === "synopsis") return typeof value.content === "string";
    if (value.proposalType === "note")
        return (
            typeof value.title === "string" &&
            typeof value.content === "string" &&
            VALID_NOTE_TYPES.includes(value.noteType as string)
        );
    if (value.proposalType === "memory") return typeof value.title === "string" && typeof value.body === "string" && typeof value.category === "string";
    return false;
};

export const parseOverviewProposals = (content: string): { cleanedContent: string; proposal: OverviewProposalPayload | null } => {
    const match = content.match(OVERVIEW_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, proposal: null };

    const cleanedContent = content.replace(OVERVIEW_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, proposal: null };

    const record = parsed as Record<string, unknown>;
    if (!isValidPayload(record)) return { cleanedContent, proposal: null };

    return { cleanedContent, proposal: record };
};
