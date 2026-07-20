import { and, eq, inArray } from "drizzle-orm";
import type {
    ChatContext,
    ChatContextChapterPassage,
    ChatContextCodexEntry,
    ChatContextMemoryExcerpt,
    ChatContextNoteExcerpt,
    ChatContextOutlineExcerpt,
    ChatType
} from "../../src/types/worldbuilding.js";
import { getTemplate } from "../../src/types/worldbuilding.js";
import { db, schema } from "../db/client.js";
import { parseJson } from "../lib/json.js";
import { getChatCodexProposals } from "./chatCodexService.js";
import { getChatById } from "./chatRepository.js";
import { search } from "./ragIndexService.js";
import { DEFAULT_SEARCH_ENTITY_TYPES, type RagEntityType, type SearchResult } from "./ragRepository.js";

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

// N6 (Notes_Outline_Chat_Bridges_Design.md §4, "AI propose" write path) — Editor chats never get
// this (PROSE_PROPOSAL_INSTRUCTIONS below doesn't include it), matching the doctrine that Editor
// stays canon-only and never surfaces the Notes bridge in either direction. Unlike Codex
// proposals, a note-proposal is never persisted server-side as a pending row — parsed client-side
// (parseNoteProposals.ts) into an ephemeral accept/reject card, same posture as prose proposals.
const NOTE_PROPOSAL_INSTRUCTIONS =
    "If something worth capturing as working material comes up — an idea, a research point, a " +
    "to-do, a loose thread — you may propose saving it as a Story Note. Notes are NOT canon and " +
    "must never be used instead of a Codex proposal for concrete facts.\n\n" +
    "To propose a Story Note, include a fenced block in this exact form:\n\n" +
    "```note-proposal\n" +
    '{"title": "...", "content": "...", "type": "idea"}\n' +
    "```\n\n" +
    '"type" must be one of: idea, research, todo, other. Propose at most one note per reply.';

const WORLDBUILDING_FRAMING =
    "You are a collaborative world-building assistant for a long-form fiction project. " +
    "Stay factually consistent with the story's established Codex state and the reference " +
    "context provided below.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user sees them, " +
    "so don't reference '```codex-proposal', '```note-proposal', or 'the block' in your prose; just talk about the proposal naturally.";

// The Editor chat's only mechanism for actually changing the manuscript — mirrors the
// Codex-proposal convention but for prose. Parsed client-side (parseProseProposal.ts) and
// rendered as an accept/reject card; accepting inserts the text as a new paragraph at the
// user's cursor (or appended to the chapter if there's no cursor context) — see
// src/features/chat/hooks/useChatMessageGeneration.ts. Never edits the document directly.
//
// The same ```prose-proposal fence also carries Selection Rework replies (docs/
// Chat_Panel_Integrations_Design.md §2.1/§3.3) — reused rather than a second fence type, since
// "replace this selection" vs "insert as a new paragraph" is purely a client-side distinction
// (ChatInterface.tsx tracks whether a FocusTarget was active for the turn that produced each
// proposal, see its proseProposals state) that the model never needs to encode itself.
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
    "If the conversation includes a [SELECTION REWORK] block with BEFORE/SELECTION/AFTER context, " +
    "your proposed prose should be a replacement for SELECTION only — do not repeat BEFORE or AFTER " +
    "in the fenced block. " +
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

// `excludeIds` keeps anchor/related entries (resolveAnchorAndRelated, below) from being listed
// twice if RAG search also happens to surface them.
const resolveCodexEntries = async (
    results: SearchResult[],
    excludeIds: Set<string>
): Promise<ChatContextCodexEntry[]> => {
    const lorebookResults = results
        .filter(r => r.entityType === "lorebook_entry" && !excludeIds.has(r.entityId))
        .slice(0, RELEVANT_ENTRIES_LIMIT);
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
        excerpt: r.content,
        role: "search" as const
    }));
};

// A Lorebook entry included directly in context, not via RAG ranking — either the chat's own
// anchor entry (WorldBuildingChatPanel opened it, aiChats.anchorEntryId) or a one-hop
// metadata.relationships target of that anchor. Degrades gracefully to an empty array rather
// than throwing if the anchor entry (or a related target) no longer exists — anchorEntryId is a
// plain column, not a real FK (see schema.ts's comment on it for why), so a deleted entry's id
// can linger with no DB-level cascade to clean it up.
const resolveAnchorAndRelated = async (anchorEntryId: string | null): Promise<ChatContextCodexEntry[]> => {
    if (!anchorEntryId) return [];

    const [anchorRow] = await db
        .select({
            id: schema.lorebookEntries.id,
            name: schema.lorebookEntries.name,
            category: schema.lorebookEntries.category,
            description: schema.lorebookEntries.description,
            metadata: schema.lorebookEntries.metadata
        })
        .from(schema.lorebookEntries)
        .where(eq(schema.lorebookEntries.id, anchorEntryId));
    if (!anchorRow) return [];

    const metadata = parseJson(anchorRow.metadata as string | null | undefined) as
        | { relationships?: Array<{ targetId: string; type: string; description?: string }> }
        | null;
    const relationships = metadata?.relationships ?? [];

    const entries: ChatContextCodexEntry[] = [
        { entryId: anchorRow.id, name: anchorRow.name, category: anchorRow.category, excerpt: anchorRow.description, role: "anchor" }
    ];

    const targetIds = [...new Set(relationships.map(r => r.targetId))].filter(id => id !== anchorEntryId);
    if (targetIds.length > 0) {
        const relatedRows = await db
            .select({
                id: schema.lorebookEntries.id,
                name: schema.lorebookEntries.name,
                category: schema.lorebookEntries.category,
                description: schema.lorebookEntries.description
            })
            .from(schema.lorebookEntries)
            .where(inArray(schema.lorebookEntries.id, targetIds));
        const relatedMeta = new Map(relatedRows.map(r => [r.id, r]));

        for (const rel of relationships) {
            const target = relatedMeta.get(rel.targetId);
            if (!target) continue; // stale relationship target (entry since deleted) — skip silently
            entries.push({
                entryId: target.id,
                name: target.name,
                category: target.category,
                excerpt: rel.description ? `${rel.type}: ${rel.description} — ${target.description}` : `${rel.type} — ${target.description}`,
                role: "related"
            });
        }
    }

    return entries;
};

// Chapter passages are only pulled for Editor chats (see getChatContext) — chapter content
// must actually be indexed first via POST /api/rag/index/chapter/:chapterId, which the
// chapter-content autosave now triggers (debounced) — see SaveChapterContent's plugin.
// `excludeIds` keeps the anchor chapter (resolveAnchorChapter, below) from being listed twice if
// RAG search also happens to surface a different chunk of it.
const resolveChapterPassages = async (
    results: SearchResult[],
    excludeIds: Set<string>
): Promise<ChatContextChapterPassage[]> => {
    const chapterResults = results
        .filter(r => r.entityType === "chapter" && !excludeIds.has(r.entityId))
        .slice(0, RELEVANT_ENTRIES_LIMIT);
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
        excerpt: r.content,
        role: "search" as const
    }));
};

// A chapter included directly in context, not via RAG ranking — the chat's own anchor chapter
// (EditorChatRail opened it while StoryEditor was focused there, aiChats.anchorChapterId). Pulls
// every one of the chapter's own ragChunks directly (entityType='chapter', entityId=
// anchorChapterId), ordered by chunkIndex — bypassing RAG relevance ranking entirely (it's the
// chapter actually being worked on, not a maybe-relevant one), same "bypass ranking, keep the
// real content" move resolveAnchorAndRelated makes for the entry case. Deliberately unbounded
// (all chunks, not RELEVANT_ENTRIES_LIMIT-capped) so a long chapter isn't silently truncated —
// reuses the indexing pipeline's existing per-chunk size bound rather than adding new truncation
// logic. Degrades gracefully to [] if the chapter no longer exists or hasn't been indexed yet.
const resolveAnchorChapter = async (anchorChapterId: string | null): Promise<ChatContextChapterPassage[]> => {
    if (!anchorChapterId) return [];

    const [chapterRow] = await db
        .select({ id: schema.chapters.id, title: schema.chapters.title })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, anchorChapterId));
    if (!chapterRow) return [];

    const chunks = await db
        .select({ content: schema.ragChunks.content })
        .from(schema.ragChunks)
        .where(and(eq(schema.ragChunks.entityType, "chapter"), eq(schema.ragChunks.entityId, anchorChapterId)))
        .orderBy(schema.ragChunks.chunkIndex);
    if (chunks.length === 0) return [];

    return chunks.map(c => ({ chapterId: chapterRow.id, title: chapterRow.title, excerpt: c.content, role: "anchor" as const }));
};

// Notes are only ever surfaced via RAG search (no anchor concept) — gated entirely on the
// double gate already having passed (note.includeInAi AND this chat's includeNotes, see
// getChatContext, which only adds "note" to entityTypes when the chat toggle is on; a note
// without includeInAi never gets indexed at all — see routes/notes.ts).
const resolveNotes = async (results: SearchResult[]): Promise<ChatContextNoteExcerpt[]> => {
    const noteResults = results.filter(r => r.entityType === "note").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (noteResults.length === 0) return [];

    const noteIds = [...new Set(noteResults.map(r => r.entityId))];
    const rows = await db.select({ id: schema.notes.id, title: schema.notes.title }).from(schema.notes).where(inArray(schema.notes.id, noteIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return noteResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        excerpt: r.content,
        role: "search" as const
    }));
};

// Same posture as resolveNotes, for outline items — gated on this chat's includeOutline toggle.
const resolveOutlineItems = async (results: SearchResult[]): Promise<ChatContextOutlineExcerpt[]> => {
    const itemResults = results.filter(r => r.entityType === "outline_item").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (itemResults.length === 0) return [];

    const itemIds = [...new Set(itemResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.outlineItems.id, title: schema.outlineItems.title, type: schema.outlineItems.type })
        .from(schema.outlineItems)
        .where(inArray(schema.outlineItems.id, itemIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return itemResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        type: (meta.get(r.entityId)?.type as "chapter" | "scene" | undefined) ?? "scene",
        excerpt: r.content,
        role: "search" as const
    }));
};

// Active Project Memory entries are only ever surfaced via RAG search (no anchor concept), gated
// entirely on this chat's includeMemory toggle (see getChatContext) — every `status: "active"`
// memory is already index-eligible on its own (agentMemoriesService.ts's approve step is the
// gate), unlike notes/outline which need their own per-item includeInAi flag too.
const resolveMemories = async (results: SearchResult[]): Promise<ChatContextMemoryExcerpt[]> => {
    const memoryResults = results.filter(r => r.entityType === "agent_memory").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (memoryResults.length === 0) return [];

    const memoryIds = [...new Set(memoryResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.agentMemories.id, title: schema.agentMemories.title, category: schema.agentMemories.category })
        .from(schema.agentMemories)
        .where(inArray(schema.agentMemories.id, memoryIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return memoryResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        category: meta.get(r.entityId)?.category ?? "unknown",
        excerpt: r.content,
        role: "search" as const
    }));
};

/**
 * Assemble everything a chat needs to generate a well-grounded response or proposal:
 *   - systemPrompt: chat-type framing (+ template hint for World-Building)
 *   - pendingProposals: this chat's own not-yet-resolved Codex proposals, so it can
 *     follow up on or revise them instead of re-proposing the same thing
 *   - projectSynopsis: the story's own synopsis, injected unconditionally (not RAG-dependent)
 *     as baseline project grounding for any story-scoped chat
 *   - relevantCodexEntries: the chat's anchor entry (if any, see aiChats.anchorEntryId) plus its
 *     one-hop metadata.relationships targets — always included, not RAG-ranked — followed by
 *     whatever else a RAG hybrid-index search for `query` (defaults to the chat's title) surfaces
 *   - relevantChapterPassages: the chat's anchor chapter (if any, see aiChats.anchorChapterId,
 *     Editor chats only), pulled directly from its own ragChunks — always included, not
 *     RAG-ranked — followed by whatever else the RAG search surfaces (chapter entity type only
 *     populates for Editor chats)
 *   - relevantNotes / relevantOutlineItems: non-canon working material, only populated when this
 *     chat's own includeNotes/includeOutline toggle is on (Notes_Outline_Chat_Bridges_Design.md's
 *     double gate — the other half is each note/outline item's own includeInAi flag, enforced at
 *     index time, see routes/notes.ts / routes/outline.ts)
 *   - relevantMemories: active Project Memory entries, only populated when this chat's own
 *     includeMemory toggle is on (C1, Agent_Framework_And_Project_Memory_Design.md §4.5) — no
 *     separate per-memory flag, every active memory is already index-eligible on its own
 *
 * Degrades gracefully rather than failing: if the story has no indexed content, no embedding
 * endpoint is configured, or an anchor entry/chapter no longer exists, the relevant-* fields are
 * simply empty/absent (search() itself already falls back to keyword-only when embeddings are
 * unavailable; resolveAnchorAndRelated/resolveAnchorChapter return [] rather than throwing on a
 * missing anchor).
 */
export const getChatContext = async (chatId: string, query?: string): Promise<ChatContext> => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);

    const effectiveQuery = query?.trim() || chat.title;
    const chatType = (chat.chatType ?? "general") as ChatType;
    const includeChapters = chatType === "editor";
    const includeNotes = chat.includeNotes === true;
    const includeOutline = chat.includeOutline === true;
    const includeMemory = chat.includeMemory === true;

    // Only build a non-default entityTypes array when a bridge toggle is actually on — search()/
    // hybridSearch's own DEFAULT_SEARCH_ENTITY_TYPES stays the single source of truth for
    // "omitted" otherwise (design doc §4.5).
    const entityTypes: RagEntityType[] = [...DEFAULT_SEARCH_ENTITY_TYPES];
    if (includeNotes) entityTypes.push("note");
    if (includeOutline) entityTypes.push("outline_item");
    if (includeMemory) entityTypes.push("agent_memory");

    // Global chats (e.g. Research) have no storyId, so there's no per-story index/story row to
    // search/fetch, and never carry an anchorEntryId/anchorChapterId (only
    // createWorldBuildingChat/createGenericChat accept those respectively).
    const [pendingProposals, searchResults, storyRows, anchorEntries, anchorChapterPassages] = await Promise.all([
        getChatCodexProposals(chatId, "pending"),
        chat.storyId
            ? search({ storyId: chat.storyId, query: effectiveQuery, limit: SEARCH_POOL_SIZE, entityTypes })
            : Promise.resolve([]),
        chat.storyId
            ? db.select({ synopsis: schema.stories.synopsis }).from(schema.stories).where(eq(schema.stories.id, chat.storyId))
            : Promise.resolve([]),
        resolveAnchorAndRelated(chat.anchorEntryId),
        resolveAnchorChapter(chat.anchorChapterId)
    ]);

    const anchorIds = new Set(anchorEntries.map(e => e.entryId));
    const anchorChapterIds = new Set(anchorChapterPassages.map(p => p.chapterId));
    const [searchCodexEntries, searchChapterPassages, notes, outlineItems, memories] = await Promise.all([
        resolveCodexEntries(searchResults, anchorIds),
        includeChapters ? resolveChapterPassages(searchResults, anchorChapterIds) : Promise.resolve([]),
        includeNotes ? resolveNotes(searchResults) : Promise.resolve([]),
        includeOutline ? resolveOutlineItems(searchResults) : Promise.resolve([]),
        includeMemory ? resolveMemories(searchResults) : Promise.resolve([])
    ]);

    return {
        systemPrompt: buildSystemPrompt(chatType, chat.templateSlug),
        pendingProposals,
        projectSynopsis: storyRows[0]?.synopsis ?? null,
        relevantCodexEntries: [...anchorEntries, ...searchCodexEntries],
        relevantChapterPassages: [...anchorChapterPassages, ...searchChapterPassages],
        relevantNotes: notes,
        relevantOutlineItems: outlineItems,
        relevantMemories: memories
    };
};
