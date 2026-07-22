import { attempt } from "@jfdi/attempt";
import { NAME_POOL_GENDERS, NAME_POOL_KINDS } from "@/types/nameGenerator";
import type { NamePoolGender, NamePoolKind } from "@/types/nameGenerator";

export interface ParsedNameProposal {
    kind: NamePoolKind;
    gender?: NamePoolGender;
    region?: string;
    era?: string;
    count?: number;
}

const NAME_PROPOSAL_FENCE = /```name-proposal\s*\n([\s\S]*?)```/;

// NG6 (docs/Name_Generator_Design.md v0.4) — extracts a model-emitted ```name-proposal fenced
// JSON block (Editor/WB/Outline/Brainstorm chats — see chatContextService.ts's
// NAME_PROPOSAL_INSTRUCTIONS). This is the "optional tool" the design calls for: a fence a
// weak/non-tool-calling model can still emit as plain text, not real LLM function-calling (v0.4
// correction #3) — the client fulfills the request by calling the real (non-LLM) generate API,
// same as the panel. Never persisted server-side and never auto-writes anything; NameProposalCard
// renders the same per-name Copy/Use/Create-Codex actions the panel's GeneratedNameRow does.
export const parseNameProposal = (content: string): { cleanedContent: string; proposal: ParsedNameProposal | null } => {
    const match = content.match(NAME_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, proposal: null };

    const cleanedContent = content.replace(NAME_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, proposal: null };

    const record = parsed as Record<string, unknown>;
    const kind = typeof record.kind === "string" && NAME_POOL_KINDS.includes(record.kind as NamePoolKind) ? (record.kind as NamePoolKind) : null;
    if (!kind) return { cleanedContent, proposal: null };

    const gender =
        typeof record.gender === "string" && NAME_POOL_GENDERS.includes(record.gender as NamePoolGender)
            ? (record.gender as NamePoolGender)
            : undefined;
    const region = typeof record.region === "string" ? record.region : undefined;
    const era = typeof record.era === "string" ? record.era : undefined;
    const count = typeof record.count === "number" ? record.count : undefined;

    return { cleanedContent, proposal: { kind, gender, region, era, count } };
};
