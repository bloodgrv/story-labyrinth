import { attempt } from "@jfdi/attempt";
import type { ShuttlePayload } from "@/types/brainstorm";

const SHUTTLE_PROPOSAL_FENCE = /```shuttle-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```shuttle-proposal block from an Editor/Outline/World-Building chat
// reply (Chat Shuttle H1/H4, docs/Chat_Shuttle_Design.md) — mirrors parseNoteSplitProposal.ts
// (single fence, non-'g', persisted immediately server-side as a durable brainstormChecklist row
// rather than staying ephemeral — see ChatInterface.tsx's onShuttleProposal).
const isValidPayload = (value: unknown): value is ShuttlePayload => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return record.destination === "research" && typeof record.question === "string" && record.question.trim().length > 0;
};

export const parseShuttleProposal = (content: string): { cleanedContent: string; proposal: ShuttlePayload | null } => {
    const match = content.match(SHUTTLE_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, proposal: null };

    const cleanedContent = content.replace(SHUTTLE_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || !isValidPayload(parsed)) return { cleanedContent, proposal: null };

    return { cleanedContent, proposal: parsed };
};
