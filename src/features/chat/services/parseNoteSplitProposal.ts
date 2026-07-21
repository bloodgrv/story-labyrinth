import { attempt } from "@jfdi/attempt";
import type { NoteSplitProposalPayload } from "@/types/brainstorm";

const NOTE_SPLIT_PROPOSAL_FENCE = /```note-split-proposal\s*\n([\s\S]*?)```/;
const VALID_NOTE_TYPES = ["idea", "research", "todo", "other"];

// Extracts a model-emitted ```note-split-proposal block from a Notes chat reply, matching the
// wire format documented in chatContextService.ts's NOTE_SPLIT_PROPOSAL_INSTRUCTIONS (P0.4 K2).
// Mirrors parseOverviewProposals.ts (single fence, non-'g', persisted immediately server-side as
// a durable brainstormChecklist row rather than staying ephemeral — see ChatInterface.tsx).
const isValidPayload = (value: unknown): value is NoteSplitProposalPayload => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        Array.isArray(record.notes) &&
        record.notes.length > 0 &&
        record.notes.every(
            (n: unknown): n is NoteSplitProposalPayload["notes"][number] =>
                typeof n === "object" &&
                n !== null &&
                typeof (n as Record<string, unknown>).title === "string" &&
                typeof (n as Record<string, unknown>).content === "string" &&
                VALID_NOTE_TYPES.includes((n as Record<string, unknown>).type as string)
        )
    );
};

export const parseNoteSplitProposal = (content: string): { cleanedContent: string; proposal: NoteSplitProposalPayload | null } => {
    const match = content.match(NOTE_SPLIT_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, proposal: null };

    const cleanedContent = content.replace(NOTE_SPLIT_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || !isValidPayload(parsed)) return { cleanedContent, proposal: null };

    return { cleanedContent, proposal: parsed };
};
