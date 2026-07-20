import { attempt } from "@jfdi/attempt";
import type { HandoffPacket } from "@/types/brainstorm";

const HANDOFF_PACKET_FENCE = /```handoff-packet\s*\n([\s\S]*?)```/;
const VALID_DESTINATIONS = ["outline", "worldbuilding", "notes", "research"];

// Extracts a model-emitted ```handoff-packet block from a Brainstorm chat reply — mirrors
// parseLoreSuggestions.ts (single fence wrapping an array, so multiple handoffs can be proposed
// in one reply, e.g. an Outline handoff AND a WB handoff from the same Grill-me session). Each
// handoff IS persisted immediately server-side on parse (durable brainstormChecklist rows, B4),
// unlike lore-suggestion which stays purely ephemeral.
const isValidHandoff = (value: unknown): value is HandoffPacket => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        VALID_DESTINATIONS.includes(record.destination as string) &&
        typeof record.summary === "string" &&
        typeof record.detail === "string"
    );
};

export const parseHandoffPackets = (content: string): { cleanedContent: string; packets: HandoffPacket[] } => {
    const match = content.match(HANDOFF_PACKET_FENCE);
    if (!match) return { cleanedContent: content, packets: [] };

    const cleanedContent = content.replace(HANDOFF_PACKET_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, packets: [] };

    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.handoffs)) return { cleanedContent, packets: [] };

    return { cleanedContent, packets: record.handoffs.filter(isValidHandoff) };
};
