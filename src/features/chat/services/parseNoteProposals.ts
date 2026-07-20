import { attempt } from "@jfdi/attempt";
import type { Note } from "@/types/story";

export interface ParsedNoteProposal {
    title: string;
    content: string;
    type: Note["type"];
}

const NOTE_PROPOSAL_FENCE = /```note-proposal\s*\n([\s\S]*?)```/;
const VALID_TYPES: Note["type"][] = ["idea", "research", "todo", "other"];

// Extracts a model-emitted ```note-proposal fenced JSON block out of a chat reply, matching the
// wire format documented in server/services/chatContextService.ts's system prompt (N6,
// Notes_Outline_Chat_Bridges_Design.md §4 — "AI propose" write path, same spirit as
// codex-proposal/prose-proposal). Only one note proposal per reply, mirroring prose-proposal.
// Never persisted server-side pending a UI accept — same posture as ProseProposalCard, since
// creating a Note is a single lightweight write, not a multi-stage review like Codex changes.
export const parseNoteProposals = (content: string): { cleanedContent: string; noteProposal: ParsedNoteProposal | null } => {
    const match = content.match(NOTE_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, noteProposal: null };

    const cleanedContent = content.replace(NOTE_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, noteProposal: null };

    const record = parsed as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.content !== "string") return { cleanedContent, noteProposal: null };

    const type = VALID_TYPES.includes(record.type as Note["type"]) ? (record.type as Note["type"]) : "idea";
    return { cleanedContent, noteProposal: { title: record.title, content: record.content, type } };
};
