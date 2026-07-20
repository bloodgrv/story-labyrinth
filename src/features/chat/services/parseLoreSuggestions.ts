import { attempt } from "@jfdi/attempt";
import type { LorebookEntry } from "@/types/story";

// P0.4 R8 — Outline chat's "suggest new lorebook entities" handoff. Mirrors parseNoteProposals.ts
// (single fence per reply, never persisted server-side — ephemeral until the user clicks
// "Open in WB" on a suggestion, which hands it to the Lorebook tool via a URL query-param handoff,
// see LorebookPage.tsx).
export interface ParsedLoreSuggestion {
    name: string;
    category: LorebookEntry["category"];
    blurb: string;
}

const LORE_SUGGESTION_FENCE = /```lore-suggestion\s*\n([\s\S]*?)```/;

const isValidSuggestion = (value: unknown): value is ParsedLoreSuggestion => {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return typeof record.name === "string" && typeof record.category === "string" && typeof record.blurb === "string";
};

export const parseLoreSuggestions = (content: string): { cleanedContent: string; suggestions: ParsedLoreSuggestion[] } => {
    const match = content.match(LORE_SUGGESTION_FENCE);
    if (!match) return { cleanedContent: content, suggestions: [] };

    const cleanedContent = content.replace(LORE_SUGGESTION_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

    const [error, parsed] = attempt(() => JSON.parse(match[1]));
    if (error || typeof parsed !== "object" || parsed === null) return { cleanedContent, suggestions: [] };

    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.suggestions)) return { cleanedContent, suggestions: [] };

    return { cleanedContent, suggestions: record.suggestions.filter(isValidSuggestion) };
};
