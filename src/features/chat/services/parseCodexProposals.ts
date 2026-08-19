import { attempt } from "@jfdi/attempt";
import type { CodexState } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";

export interface ParsedNewEntryProposal {
    type: "new_entry";
    level: "global" | "series" | "story";
    scopeId?: string;
    name: string;
    description: string;
    category: LorebookEntry["category"];
    tags?: string[];
    proposedState?: CodexState;
}

export interface ParsedModifyEntryProposal {
    type: "modify_entry";
    // entryId is now optional — the model has no legitimate way to know or safely invent a real
    // database id (see B1/B20), so entryName is the primary field going forward and the server
    // resolves it against the story's lorebook. entryId is still accepted when the context
    // block happened to surface a real id, for back-compat with older prompt output.
    entryId?: string;
    entryName?: string;
    proposedDescription?: string;
    proposedState?: CodexState;
    proposedTags?: string[];
    proposedNeedsFleshingOut?: boolean;
}

export type ParsedCodexProposal = ParsedNewEntryProposal | ParsedModifyEntryProposal;

export interface ParsedMessageProposals {
    cleanedContent: string;
    proposals: ParsedCodexProposal[];
}

const CODEX_PROPOSAL_FENCE = /```codex-proposal\s*\n([\s\S]*?)```/g;

const isNewEntry = (value: Record<string, unknown>): boolean =>
    value.type === "new_entry" &&
    typeof value.level === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string";

const isModifyEntry = (value: Record<string, unknown>): boolean =>
    value.type === "modify_entry" && (typeof value.entryId === "string" || typeof value.entryName === "string");

const isValidProposal = (value: unknown): value is ParsedCodexProposal => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return isNewEntry(record) || isModifyEntry(record);
};

// Extracts model-emitted ```codex-proposal fenced JSON blocks out of a chat reply, matching
// the wire format documented in server/services/chatContextService.ts's system prompt and
// POST /api/chats/:chatId/codex-proposals's body shape (server/routes/chats.ts).
export const parseCodexProposals = (content: string): ParsedMessageProposals => {
    const proposals: ParsedCodexProposal[] = [];

    const cleanedContent = content.replace(CODEX_PROPOSAL_FENCE, (_match, jsonBlock: string) => {
        const [error, parsed] = attempt(() => JSON.parse(jsonBlock));
        if (!error && isValidProposal(parsed)) proposals.push(parsed);
        return "";
    });

    return { cleanedContent: cleanedContent.replace(/\n{3,}/g, "\n\n").trim(), proposals };
};
