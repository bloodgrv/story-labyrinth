import { attempt } from "@jfdi/attempt";
import type { PinWhenKind } from "@/types/storyTimeline";

export interface ParsedTimelinePinProposalItem {
    title: string;
    blurb?: string;
    whenKind: PinWhenKind;
    relativeOffsetYears?: number;
    fuzzyPhrase?: string;
    civilDate?: string;
}

const TIMELINE_PIN_PROPOSAL_FENCE = /```timeline-pin-proposal\s*\n([\s\S]*?)```/;
const VALID_WHEN_KINDS: PinWhenKind[] = ["relative", "fuzzy", "civil"];

// Extracts a model-emitted ```timeline-pin-proposal fenced JSON array from the WB "timeline"
// template's chat reply (TL7, chatContextService.ts's TIMELINE_PIN_INSTRUCTIONS). Mirrors
// parsePsychProposal.ts's shape, but the payload is an ARRAY (not a single object) — a planning
// conversation naturally yields several beats at once, same "multiple per reply" precedent
// handoff-packet/note-split-proposal already established. Never persisted server-side —
// ephemeral until the user accepts/rejects each item individually (TimelinePinProposalCard.tsx).
export const parseTimelinePinProposal = (
    content: string
): { cleanedContent: string; timelinePinProposals: ParsedTimelinePinProposalItem[] | null } => {
    const match = content.match(TIMELINE_PIN_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, timelinePinProposals: null };

    const cleanedContent = content.replace(TIMELINE_PIN_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || !Array.isArray(parsed)) return { cleanedContent, timelinePinProposals: null };

    const items = parsed
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .map((entry): ParsedTimelinePinProposalItem | null => {
            const title = typeof entry.title === "string" ? entry.title.trim() : "";
            const whenKind = typeof entry.whenKind === "string" && VALID_WHEN_KINDS.includes(entry.whenKind as PinWhenKind)
                ? (entry.whenKind as PinWhenKind)
                : null;
            if (!title || !whenKind) return null;
            return {
                title,
                blurb: typeof entry.blurb === "string" ? entry.blurb : undefined,
                whenKind,
                relativeOffsetYears: typeof entry.relativeOffsetYears === "number" ? entry.relativeOffsetYears : undefined,
                fuzzyPhrase: typeof entry.fuzzyPhrase === "string" ? entry.fuzzyPhrase : undefined,
                civilDate: typeof entry.civilDate === "string" ? entry.civilDate : undefined
            };
        })
        .filter((item): item is ParsedTimelinePinProposalItem => item !== null);

    if (items.length === 0) return { cleanedContent, timelinePinProposals: null };
    return { cleanedContent, timelinePinProposals: items };
};
