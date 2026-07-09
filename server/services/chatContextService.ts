import { inArray } from "drizzle-orm";
import type { ChatContext, ChatContextChapterPassage, ChatContextCodexEntry, ChatType } from "../../src/types/worldbuilding.js";
import { getTemplate } from "../../src/types/worldbuilding.js";
import { db, schema } from "../db/client.js";
import { getChatCodexProposals } from "./chatCodexService.js";
import { getChatById } from "./chatRepository.js";
import { search } from "./ragIndexService.js";
import type { SearchResult } from "./ragRepository.js";

const RELEVANT_ENTRIES_LIMIT = 8;
const SEARCH_POOL_SIZE = RELEVANT_ENTRIES_LIMIT * 2;

// Shared by both World-Building and Editor chats — the ```codex-proposal fenced-block
// convention is this app's only mechanism for turning a chat reply into an actual Codex
// change (no server-side parsing of free text — see chatCodexService.ts), so the exact JSON
// shape here must match POST /api/chats/:chatId/codex-proposals's body (server/routes/chats.ts)
// and what src/features/chat/services/parseCodexProposals.ts extracts client-side.
const CODEX_PROPOSAL_INSTRUCTIONS =
    "When you learn a new concrete fact, or a character/location/item's physical state changes, " +
    "propose it as a Codex entry or update — never just state it in conversation as if it were " +
    "already canon. All Codex changes require explicit user approval before they take effect.\n\n" +
    "To propose a Codex change, include a fenced block in this exact form:\n\n" +
    "```codex-proposal\n" +
    '{"type": "new_entry", "level": "story", "name": "...", "description": "...", "category": "character", "tags": ["..."]}\n' +
    "```\n\n" +
    "or, to modify an existing entry (use the entryId from the Codex context below):\n\n" +
    "```codex-proposal\n" +
    '{"type": "modify_entry", "entryId": "...", "proposedDescription": "...", "proposedTags": ["..."]}\n' +
    "```\n\n" +
    '"level" must be "global", "series", or "story" (use "story" unless told otherwise). ' +
    '"category" must be one of: character, location, item, event, note, synopsis, starting scenario, timeline.';

const WORLDBUILDING_FRAMING =
    "You are a collaborative world-building assistant for a long-form fiction project. " +
    "Stay factually consistent with the story's established Codex state and the reference " +
    "context provided below.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around the block — it's stripped out before the user sees it, " +
    "so don't reference '```codex-proposal' or 'the block' in your prose; just talk about the proposal naturally.";

// The Editor chat's only mechanism for actually changing the manuscript — mirrors the
// Codex-proposal convention but for prose. Parsed client-side (parseProseProposal.ts) and
// rendered as an accept/reject card; accepting inserts the text as a new paragraph at the
// user's cursor (or appended to the chapter if there's no cursor context) — see
// src/features/chat/hooks/useChatMessageGeneration.ts. Never edits the document directly.
const PROSE_PROPOSAL_INSTRUCTIONS =
    "You are a writing companion embedded in this chapter's editor — a collaborator, not a ghostwriter. " +
    "Stay consistent with this story's established Codex state and the chapter excerpts provided below. " +
    "When the user asks you to write or revise prose — a continuation, a rewrite, a new scene — propose it " +
    "for review rather than assuming it will be used verbatim; you never edit the manuscript directly.\n\n" +
    "To propose prose, include a fenced block in this exact form:\n\n" +
    "```prose-proposal\n" +
    "Your proposed prose text goes here, as plain prose (not JSON).\n" +
    "```\n\n" +
    "You may propose only one piece of prose per reply. " +
    "You may also propose Codex changes in the same reply, using the convention below, if the " +
    "conversation surfaces a concrete fact worth recording.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
    "sees them, so don't reference the blocks themselves in your prose.";

// Assemble the effective system prompt for a chat: chat-type framing + template hint (World-
// Building only). Extend the framing constants above — not the template catalogue — when
// adding further global system instructions.
const buildSystemPrompt = (chatType: ChatType, templateSlug: string | null): string => {
    if (chatType === "editor") return PROSE_PROPOSAL_INSTRUCTIONS;

    const template = templateSlug ? getTemplate(templateSlug as Parameters<typeof getTemplate>[0]) : undefined;
    return template?.systemPromptHint ? `${WORLDBUILDING_FRAMING}\n\n${template.systemPromptHint}` : WORLDBUILDING_FRAMING;
};

const resolveCodexEntries = async (results: SearchResult[]): Promise<ChatContextCodexEntry[]> => {
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

// Chapter passages are only pulled for Editor chats (see getChatContext) — chapter content
// must actually be indexed first via POST /api/rag/index/chapter/:chapterId, which the
// chapter-content autosave now triggers (debounced) — see SaveChapterContent's plugin.
const resolveChapterPassages = async (results: SearchResult[]): Promise<ChatContextChapterPassage[]> => {
    const chapterResults = results.filter(r => r.entityType === "chapter").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (chapterResults.length === 0) return [];

    const chapterIds = [...new Set(chapterResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.chapters.id, title: schema.chapters.title })
        .from(schema.chapters)
        .where(inArray(schema.chapters.id, chapterIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return chapterResults.map(r => ({
        chapterId: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        excerpt: r.content
    }));
};

/**
 * Assemble everything a chat needs to generate a well-grounded response or proposal:
 *   - systemPrompt: chat-type framing (+ template hint for World-Building)
 *   - pendingProposals: this chat's own not-yet-resolved Codex proposals, so it can
 *     follow up on or revise them instead of re-proposing the same thing
 *   - relevantCodexEntries / relevantChapterPassages: retrieved via one RAG hybrid-index
 *     search for `query` (defaults to the chat's title when no query is given), split by
 *     entity type — chapter passages only populate for Editor chats.
 *
 * Degrades gracefully rather than failing: if the story has no indexed content, or no
 * embedding endpoint is configured, the relevant-* fields are simply empty (search() itself
 * already falls back to keyword-only when embeddings are unavailable).
 */
export const getChatContext = async (chatId: string, query?: string): Promise<ChatContext> => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);

    const effectiveQuery = query?.trim() || chat.title;
    const chatType = (chat.chatType ?? "general") as ChatType;
    const includeChapters = chatType === "editor";

    // Global chats (e.g. Research) have no storyId, so there's no per-story index to search.
    const [pendingProposals, searchResults] = await Promise.all([
        getChatCodexProposals(chatId, "pending"),
        chat.storyId
            ? search({ storyId: chat.storyId, query: effectiveQuery, limit: SEARCH_POOL_SIZE })
            : Promise.resolve([])
    ]);

    const [relevantCodexEntries, relevantChapterPassages] = await Promise.all([
        resolveCodexEntries(searchResults),
        includeChapters ? resolveChapterPassages(searchResults) : Promise.resolve([])
    ]);

    return {
        systemPrompt: buildSystemPrompt(chatType, chat.templateSlug),
        pendingProposals,
        relevantCodexEntries,
        relevantChapterPassages
    };
};
