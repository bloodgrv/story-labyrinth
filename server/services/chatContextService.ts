import { and, eq, inArray, ne } from "drizzle-orm";
import type {
    ChatContext,
    ChatContextChapterPassage,
    ChatContextCodexEntry,
    ChatContextMemoryExcerpt,
    ChatContextNoteExcerpt,
    ChatContextOutlineExcerpt,
    ChatContextOutlineTreeItem,
    ChatContextWrittenChapter,
    ChatType
} from "../../src/types/worldbuilding.js";
import { getTemplate } from "../../src/types/worldbuilding.js";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";
import { getChecklistCounts } from "./brainstormChecklistService.js";
import { getSlots } from "./brainstormSlotsService.js";
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

// P0.4 R5 — Outline chat's own structure-proposal fence. "create" is handled specially client-
// side (src/features/chat/services/parseOutlineProposals.ts): it's inserted immediately as a
// `status: 'pending', source: 'ai_suggested'` outlineItems row, the exact mechanism the retired
// bulk-Generate button already used, so the existing tree Accept/Reject badges
// (OutlineChapterCard.tsx/OutlineSceneRow.tsx) handle it with no new UI. "edit"/"reorder"/"delete"
// act on an already-confirmed row, so they're parsed into an ephemeral proposal card instead
// (same posture as prose-proposal/note-proposal) — Accept calls the existing outline mutations
// directly.
const OUTLINE_PROPOSAL_INSTRUCTIONS =
    "When you and the user agree on a structural change, propose it as an outline change — never just describe it in " +
    "conversation as if it were already applied. All outline changes require explicit user approval before they take " +
    "effect (new chapters/scenes appear immediately in the tree marked 'AI Suggested' for the user to accept/reject; " +
    "edits/reorders/deletes show as a card in the chat for the user to accept/reject).\n\n" +
    "To propose a new chapter or scene, include a fenced block in this exact form:\n\n" +
    "```outline-proposal\n" +
    '{"type": "create", "itemType": "chapter", "parentId": null, "title": "...", "summary": "...", "wordCountTarget": null}\n' +
    "```\n\n" +
    "(`itemType` is \"chapter\" or \"scene\"; `parentId` is the chapter's id when creating a scene under it, else null.)\n\n" +
    "To propose editing an existing item's title/summary/word count target (use the itemId from the outline tree below):\n\n" +
    "```outline-proposal\n" +
    '{"type": "edit", "itemId": "...", "title": "...", "summary": "..."}\n' +
    "```\n\n" +
    "To propose reordering items:\n\n" +
    "```outline-proposal\n" +
    '{"type": "reorder", "updates": [{"id": "...", "order": 1, "parentId": "..."}]}\n' +
    "```\n\n" +
    "To propose deleting an item:\n\n" +
    "```outline-proposal\n" +
    '{"type": "delete", "itemId": "..."}\n' +
    "```\n\n" +
    "You may propose only one outline change per reply.";

// P0.4 R8 — a lightweight list of candidate new lorebook entities, handed off to the
// World-Building chat rather than created directly here (Outline is not a lore factory — see
// docs/Chat_Panel_Integrations_Design.md §4's "New lorebook entities" row). Parsed client-side
// into an ephemeral tray section (src/features/chat/services/parseLoreSuggestions.ts); each
// suggestion's "Open in WB" button hands the name/category/blurb to the Lorebook tool via a URL
// query-param handoff (different tool, different browser tab — see LorebookPage.tsx).
const LORE_SUGGESTION_INSTRUCTIONS =
    "If planning the outline surfaces a new character, location, or other entity worth developing in the Lorebook, " +
    "you may suggest it — but never create it directly; that belongs in a World-Building chat.\n\n" +
    "To suggest new lorebook entities, include a fenced block in this exact form:\n\n" +
    "```lore-suggestion\n" +
    '{"suggestions": [{"name": "...", "category": "character", "blurb": "one or two sentences"}]}\n' +
    "```\n\n" +
    '"category" must be one of: character, location, item, event, note, synopsis, starting scenario, timeline.';

// P0.4 B0-B4 — Brainstorm's only two write paths: a synopsis/note/memory proposal, or a handoff
// packet to another chat/tool. Never Codex/outline/prose — Brainstorm is an intake hub, not a
// structure desk or lore factory (docs/Chat_Panel_Integrations_Design.md §5's "Not:" list).
//
// "memory" is only offered when the chat's own includeMemory toggle is on (mirrored by
// buildSystemPrompt below) — same opt-in gate C1 already established, not a new concept.
const OVERVIEW_PROPOSAL_INSTRUCTIONS = (includeMemory: boolean): string =>
    "As the project overview takes shape, propose capturing it — never just state it in conversation as if it " +
    "were already saved. All overview proposals require explicit user approval before they take effect.\n\n" +
    "To propose the story synopsis, include a fenced block in this exact form:\n\n" +
    "```overview-proposal\n" +
    '{"proposalType": "synopsis", "content": "...", "slotKey": "premise"}\n' +
    "```\n\n" +
    "To propose an overview note (idea, research point, loose thread — not canon):\n\n" +
    "```overview-proposal\n" +
    '{"proposalType": "note", "title": "...", "content": "...", "noteType": "idea", "slotKey": "setting"}\n' +
    "```\n\n" +
    (includeMemory
        ? "To propose a Project Memory entry (an approved project fact worth remembering across sessions):\n\n" +
          "```overview-proposal\n" +
          '{"proposalType": "memory", "title": "...", "body": "...", "category": "project_note", "slotKey": "protagonist"}\n' +
          "```\n\n"
        : "") +
    '"slotKey", if the proposal addresses one of the setup checklist slots shown below, must be one of: ' +
    `${BRAINSTORM_SLOTS.map(s => s.key).join(", ")} — omit it otherwise. ` +
    '"noteType" must be one of: idea, research, todo, other. Propose at most one overview-proposal per reply.';

// Handoffs are lightweight suggestions, not deep creates — Brainstorm never builds outline items
// or lorebook entries directly; the destination chat/tool governs the real work (docs/
// Chat_Panel_Integrations_Design.md §5's "Direct outline items: none", "Direct lorebook/Codex
// deep: none"). seedName/seedCategory are only read for destination "worldbuilding" (feeds the
// existing pendingLorebookSeed pre-fill, same shape as the Outline chat's lore-suggestion, R8).
const HANDOFF_PACKET_INSTRUCTIONS =
    "When the conversation surfaces something ready to hand off to a more specialized chat, propose a handoff " +
    "— never act as if it's already been sent. The user reviews and opens/sends each handoff themselves.\n\n" +
    "To propose one or more handoffs, include a fenced block in this exact form:\n\n" +
    "```handoff-packet\n" +
    '{"handoffs": [{"destination": "outline", "summary": "one-line summary", "detail": "longer paste-ready text for that chat"}]}\n' +
    "```\n\n" +
    '"destination" must be one of: outline (structure/spine work), worldbuilding (a specific character/location/' +
    "item worth developing — also include \"seedName\" and \"seedCategory\"), notes (working material worth " +
    'saving as-is), research (a question worth looking into). "seedCategory" must be one of: character, ' +
    "location, item, event, note, synopsis, starting scenario, timeline.";

const OUTLINE_FRAMING =
    "You are a structure partner for this story's outline — chapter/scene sequencing and narrative arc. " +
    "Stay consistent with the full outline tree, the story synopsis, and the established Codex/lorebook state " +
    "provided below. You are not a manuscript writer: never propose or write chapter prose here.\n\n" +
    OUTLINE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    LORE_SUGGESTION_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user sees them, " +
    "so don't reference the fenced blocks themselves in your prose; just talk about the change naturally.";

const WORLDBUILDING_FRAMING =
    "You are a collaborative world-building assistant for a long-form fiction project. " +
    "Stay factually consistent with the story's established Codex state and the reference " +
    "context provided below.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user sees them, " +
    "so don't reference '```codex-proposal', '```note-proposal', or 'the block' in your prose; just talk about the proposal naturally.";

// P0.4 B0-B4 — Brainstorm is a project intake/orientation hub, not any of the specialized desks
// it hands work off to. Explicitly NOT a manuscript writer, structure desk, or Codex/lore
// factory — those stay Editor/Outline/World-Building's jobs (docs/Chat_Panel_Integrations_Design.md
// §5's "Not:" list). Depth/interview style is layered on via STYLE_HINTS below, not encoded here.
const BRAINSTORM_FRAMING =
    "You are a project intake and orientation assistant for a long-form fiction project — helping the user " +
    "figure out and articulate what their story is before the specialized desks (Outline for structure, " +
    "World-Building for lore/characters, the Editor for prose) take over. You are NOT a structure desk, " +
    "not a lore factory, and never write manuscript prose here. Ask questions, help the user think out loud, " +
    "and propose capturing what emerges — you never assume something is settled until the user confirms it " +
    "and it's proposed and accepted below.";

// Confirmed with user: depth is purely a prompt-shaping hint the model follows in ordinary
// multi-turn chat, NOT a tracked ask/capture/confirm state machine — see BRAINSTORM_SLOTS
// (src/types/brainstorm.ts) for the only persisted "slot" concept.
const LIGHT_STYLE_HINT =
    "\n\nStyle: Light. Keep it brief — a handful of high-level questions, propose a short synopsis and a " +
    "thin handoff or two once the basics are clear. Don't push for more depth than the user is offering.";
const STANDARD_STYLE_HINT =
    "\n\nStyle: Standard. Ask enough follow-up questions to get a solid synopsis plus a useful overview note, " +
    "and propose Outline/World-Building handoffs once you have enough concrete material for them to work with.";
const GRILL_STYLE_HINT =
    "\n\nStyle: Grill-me. Interview thoroughly — ask harder, more specific follow-up questions, don't accept " +
    "vague answers without probing once, and aim for richer overview notes and more complete handoffs before " +
    "moving on.";

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
const STYLE_HINTS: Record<string, string> = { light: LIGHT_STYLE_HINT, standard: STANDARD_STYLE_HINT, grill: GRILL_STYLE_HINT };

const buildSystemPrompt = (
    chatType: ChatType,
    templateSlug: string | null,
    brainstormStyle?: string,
    includeMemory?: boolean
): string => {
    if (chatType === "editor") return PROSE_PROPOSAL_INSTRUCTIONS;
    if (chatType === "outline") return OUTLINE_FRAMING;
    if (chatType === "brainstorm") {
        const styleHint = STYLE_HINTS[brainstormStyle ?? "standard"] ?? STANDARD_STYLE_HINT;
        return (
            BRAINSTORM_FRAMING +
            styleHint +
            "\n\n" +
            OVERVIEW_PROPOSAL_INSTRUCTIONS(includeMemory === true) +
            "\n\n" +
            HANDOFF_PACKET_INSTRUCTIONS +
            "\n\n" +
            NOTE_PROPOSAL_INSTRUCTIONS +
            "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
            "sees them, so don't reference the fenced blocks themselves in your prose; just talk about the proposal naturally."
        );
    }

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

// The Outline chat's own always-on structured read (P0.4 R5) — every outlineItem in the story,
// not RAG-ranked and not gated by the includeOutline toggle (that toggle stays the *other* chat
// types' opt-in path, see resolveOutlineItems above). Excludes rejected items (dead ends the
// model shouldn't be planning around); includes pending ("AI Suggested", not yet accepted) ones
// since seeing them helps the model avoid re-proposing the same thing.
const resolveFullOutlineTree = async (storyId: string): Promise<ChatContextOutlineTreeItem[]> => {
    const rows = await db
        .select({
            id: schema.outlineItems.id,
            parentId: schema.outlineItems.parentId,
            type: schema.outlineItems.type,
            title: schema.outlineItems.title,
            summary: schema.outlineItems.summary,
            order: schema.outlineItems.order,
            chapterId: schema.outlineItems.chapterId
        })
        .from(schema.outlineItems)
        .where(and(eq(schema.outlineItems.storyId, storyId), ne(schema.outlineItems.status, "rejected")))
        .orderBy(schema.outlineItems.order);

    return rows.map(r => ({
        id: r.id,
        parentId: r.parentId,
        type: r.type as "chapter" | "scene",
        title: r.title,
        summary: r.summary,
        order: r.order,
        chapterId: r.chapterId
    }));
};

// "Written chapters: titles + summaries only" (P0.4 R5) — chapters.summary is a distinct field
// from any linked outlineItem's own summary (see server/db/schema.ts), so this is a real, separate
// read, not a subset of resolveFullOutlineTree above. Never includes chapter body content.
const resolveWrittenChapterSummaries = async (storyId: string): Promise<ChatContextWrittenChapter[]> => {
    const rows = await db
        .select({
            id: schema.chapters.id,
            title: schema.chapters.title,
            summary: schema.chapters.summary,
            order: schema.chapters.order
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.storyId, storyId))
        .orderBy(schema.chapters.order);

    return rows;
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

// Lets the model see whether prior proposals/handoffs from this same Brainstorm chat are still
// sitting unresolved (status pending/opened) before proposing more (P0.4 B4).
const resolveHandoffStatus = async (chatId: string) => {
    const [active, done] = await Promise.all([
        getChecklistCounts(chatId, "active"),
        getChecklistCounts(chatId, "done")
    ]);
    return { activeCount: active, doneCount: done };
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
 *   - outlineTree / writtenChapters: the Outline chat's own always-on structured reads (P0.4 R5)
 *     — full outline tree + written chapter titles/summaries, not RAG-ranked, not toggle-gated.
 *     Empty for every other chatType.
 *   - chapterSummaries: written chapter titles+summaries, populated when this chat's own
 *     includeChapterSummaries toggle is on (P0.4 B0-B4) — reuses writtenChapters' own resolver.
 *   - priorSetupSlots / handoffStatus: Brainstorm's always-on setup-slot checklist + this chat's
 *     own checklist activity counts (P0.4 B2/B4). Empty/zero for every other chatType.
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
    const includeOutlineTree = chatType === "outline";
    const includeNotes = chat.includeNotes === true;
    const includeOutline = chat.includeOutline === true;
    const includeMemory = chat.includeMemory === true;
    const isBrainstorm = chatType === "brainstorm";
    const includeChapterSummaries = chat.includeChapterSummaries === true;
    const includeLorebook = chat.includeLorebook === true;

    // Only build a non-default entityTypes array when a bridge toggle is actually on — search()/
    // hybridSearch's own DEFAULT_SEARCH_ENTITY_TYPES stays the single source of truth for
    // "omitted" otherwise (design doc §4.5). Brainstorm is the one exception where a default-ON
    // entity type (lorebook_entry) needs to become opt-in too — every other chat type's lorebook
    // search stays always-on, unchanged (P0.4 B0-B4, design doc §5's "Lorebook | Opt-in").
    const entityTypes: RagEntityType[] = isBrainstorm
        ? DEFAULT_SEARCH_ENTITY_TYPES.filter(t => t !== "lorebook_entry")
        : [...DEFAULT_SEARCH_ENTITY_TYPES];
    if (isBrainstorm && includeLorebook) entityTypes.push("lorebook_entry");
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
    const [
        searchCodexEntries,
        searchChapterPassages,
        notes,
        outlineItems,
        memories,
        outlineTree,
        writtenChapters,
        chapterSummaries,
        priorSetupSlots,
        handoffStatus
    ] = await Promise.all([
        resolveCodexEntries(searchResults, anchorIds),
        includeChapters ? resolveChapterPassages(searchResults, anchorChapterIds) : Promise.resolve([]),
        includeNotes ? resolveNotes(searchResults) : Promise.resolve([]),
        includeOutline ? resolveOutlineItems(searchResults) : Promise.resolve([]),
        includeMemory ? resolveMemories(searchResults) : Promise.resolve([]),
        includeOutlineTree && chat.storyId ? resolveFullOutlineTree(chat.storyId) : Promise.resolve([]),
        includeOutlineTree && chat.storyId ? resolveWrittenChapterSummaries(chat.storyId) : Promise.resolve([]),
        includeChapterSummaries && chat.storyId ? resolveWrittenChapterSummaries(chat.storyId) : Promise.resolve([]),
        isBrainstorm && chat.storyId ? getSlots(chat.storyId) : Promise.resolve([]),
        isBrainstorm ? resolveHandoffStatus(chatId) : Promise.resolve({ activeCount: 0, doneCount: 0 })
    ]);

    return {
        systemPrompt: buildSystemPrompt(chatType, chat.templateSlug, chat.brainstormStyle, includeMemory),
        pendingProposals,
        projectSynopsis: storyRows[0]?.synopsis ?? null,
        relevantCodexEntries: [...anchorEntries, ...searchCodexEntries],
        relevantChapterPassages: [...anchorChapterPassages, ...searchChapterPassages],
        relevantNotes: notes,
        relevantOutlineItems: outlineItems,
        relevantMemories: memories,
        outlineTree,
        writtenChapters,
        chapterSummaries,
        priorSetupSlots,
        handoffStatus
    };
};
