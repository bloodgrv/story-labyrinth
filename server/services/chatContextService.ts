import { inArray } from "drizzle-orm";
import type { CodexPendingChange } from "../../src/types/codex.js";
import type { ChatContext, ChatContextCodexEntry } from "../../src/types/worldbuilding.js";
import { getTemplate } from "../../src/types/worldbuilding.js";
import { db, schema } from "../db/client.js";
import { getChatCodexProposals } from "./chatCodexService.js";
import { getChatById } from "./chatRepository.js";
import { search } from "./ragIndexService.js";

const RELEVANT_ENTRIES_LIMIT = 8;

// Base framing applied to every World-Building Chat, regardless of template.
// Template-specific guidance (systemPromptHint) is appended after this.
//
// The ```codex-proposal fenced-block convention below is this app's only mechanism for
// turning a chat reply into an actual Codex change — there is no server-side parsing of
// free text (see server/services/chatCodexService.ts), so the exact JSON shape here must
// match POST /api/chats/:chatId/codex-proposals's body (server/routes/chats.ts) and what
// src/features/chat/services/parseCodexProposals.ts extracts client-side.
const BASE_SYSTEM_FRAMING =
    "You are a collaborative world-building assistant for a long-form fiction project. " +
    "Stay factually consistent with the story's established Codex state and the reference " +
    "context provided below. When you learn a new concrete fact, or a character/location/item's " +
    "physical state changes, propose it as a Codex entry or update — never just state it in " +
    "conversation as if it were already canon. All Codex changes require explicit user approval " +
    "before they take effect.\n\n" +
    "To propose a change, include a fenced block in this exact form:\n\n" +
    "```codex-proposal\n" +
    '{"type": "new_entry", "level": "story", "name": "...", "description": "...", "category": "character", "tags": ["..."]}\n' +
    "```\n\n" +
    "or, to modify an existing entry (use the entryId from the Codex context above):\n\n" +
    "```codex-proposal\n" +
    '{"type": "modify_entry", "entryId": "...", "proposedDescription": "...", "proposedTags": ["..."]}\n' +
    "```\n\n" +
    '"level" must be "global", "series", or "story" (use "story" unless told otherwise). ' +
    '"category" must be one of: character, location, item, event, note, synopsis, starting scenario, timeline. ' +
    "Write your normal conversational reply around the block — it's stripped out before the user sees it, " +
    "so don't reference '```codex-proposal' or 'the block' in your prose; just talk about the proposal naturally.";

// Assemble the effective system prompt for a chat: base framing + template hint (if any).
// Extend this — not the template catalogue — when adding further global system instructions.
const buildSystemPrompt = (templateSlug: string | null): string => {
    const template = templateSlug ? getTemplate(templateSlug as Parameters<typeof getTemplate>[0]) : undefined;
    return template?.systemPromptHint ? `${BASE_SYSTEM_FRAMING}\n\n${template.systemPromptHint}` : BASE_SYSTEM_FRAMING;
};

// Look up Codex entries relevant to a query via the hybrid search index (vector + keyword),
// filtered to lorebook entries only (excluding chapter matches, which aren't Codex state).
const getRelevantCodexEntries = async (storyId: string, query: string): Promise<ChatContextCodexEntry[]> => {
    if (!query.trim()) return [];

    const results = await search({ storyId, query, limit: RELEVANT_ENTRIES_LIMIT * 2 });
    const lorebookResults = results.filter(r => r.entityType === "lorebook_entry").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (lorebookResults.length === 0) return [];

    const entryIds = [...new Set(lorebookResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name, category: schema.lorebookEntries.category })
        .from(schema.lorebookEntries)
        .where(inArray(schema.lorebookEntries.id, entryIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return lorebookResults.map(r => ({
        entryId: r.entityId,
        name: meta.get(r.entityId)?.name ?? r.entityId,
        category: meta.get(r.entityId)?.category ?? "unknown",
        excerpt: r.content
    }));
};

/**
 * Assemble everything a chat needs to generate a well-grounded response or proposal:
 *   - systemPrompt: base framing + the chat's template systemPromptHint (if any)
 *   - pendingProposals: this chat's own not-yet-resolved Codex proposals, so it can
 *     follow up on or revise them instead of re-proposing the same thing
 *   - relevantCodexEntries: Codex entries retrieved via the RAG hybrid index for `query`
 *     (defaults to the chat's title when no query is given, e.g. on first load)
 *
 * Degrades gracefully rather than failing: if the story has no indexed content, or no
 * embedding endpoint is configured, relevantCodexEntries is simply empty (search() itself
 * already falls back to keyword-only when embeddings are unavailable).
 */
export const getChatContext = async (chatId: string, query?: string): Promise<ChatContext> => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);

    const effectiveQuery = query?.trim() || chat.title;

    // Global chats (e.g. Research) have no storyId, so there's no per-story index to search —
    // Codex-entry grounding is only available for story-scoped chats.
    const [pendingProposals, relevantCodexEntries]: [CodexPendingChange[], ChatContextCodexEntry[]] = await Promise.all([
        getChatCodexProposals(chatId, "pending"),
        chat.storyId ? getRelevantCodexEntries(chat.storyId, effectiveQuery) : Promise.resolve([])
    ]);

    return {
        systemPrompt: buildSystemPrompt(chat.templateSlug),
        pendingProposals,
        relevantCodexEntries
    };
};
