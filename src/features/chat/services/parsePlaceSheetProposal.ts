import { attempt } from "@jfdi/attempt";
import type { PlaceState } from "@/types/story";

const PLACE_SHEET_PROPOSAL_FENCE = /```place-sheet-proposal\s*\n([\s\S]*?)```/;

// Extracts a model-emitted ```place-sheet-proposal fenced JSON block from a World-Building chat
// reply (L1, docs/Locations_And_Maps_Design.md — Locations template's light place sheet, see
// chatContextService.ts's PLACE_SHEET_INSTRUCTIONS). Mirrors parsePsychProposal.ts exactly: single
// fence per reply, never persisted server-side — ephemeral until the user accepts (merges into
// the anchor entry's metadata.placeState, ChatInterface.tsx's handleAcceptPlaceSheet) or rejects
// (discarded).
export const parsePlaceSheetProposal = (
    content: string
): { cleanedContent: string; placeSheetProposal: PlaceState | null } => {
    const match = content.match(PLACE_SHEET_PROPOSAL_FENCE);
    if (!match) return { cleanedContent: content, placeSheetProposal: null };

    const cleanedContent = content.replace(PLACE_SHEET_PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, placeSheetProposal: null };

    const record = parsed as Record<string, unknown>;
    const proposal: PlaceState = {};
    if (typeof record.scale === "string") proposal.scale = record.scale;
    if (typeof record.biomeOrClimate === "string") proposal.biomeOrClimate = record.biomeOrClimate;
    if (typeof record.holder === "string") proposal.holder = record.holder;
    if (typeof record.dangerLevel === "string") proposal.dangerLevel = record.dangerLevel;
    if (Array.isArray(record.landmarks)) proposal.landmarks = record.landmarks.filter((v): v is string => typeof v === "string");
    if (typeof record.exitsSummary === "string") proposal.exitsSummary = record.exitsSummary;
    if (typeof record.layoutMd === "string") proposal.layoutMd = record.layoutMd;
    if (typeof record.imageBrief === "string") proposal.imageBrief = record.imageBrief;
    if (typeof record.floorLabel === "string") proposal.floorLabel = record.floorLabel;

    if (Object.keys(proposal).length === 0) return { cleanedContent, placeSheetProposal: null };
    return { cleanedContent, placeSheetProposal: proposal };
};
