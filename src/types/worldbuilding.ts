import type { CodexPendingChange, CodexState } from "./codex.js";

// Chat type discriminator — matches the chatType column on aiChats.
// null / undefined → treat as 'general' at the application layer.
export type ChatType = "worldbuilding" | "research" | "editor" | "outline" | "brainstorm" | "notes" | "general";

// Guided-start interview depth, shared across every host that offers it (Brainstorm, WB, Outline
// — P0.4 B0-B5). Prompt-shaping only, not a tracked interview state machine (confirmed with user).
export type ChatStyle = "light" | "standard" | "grill";

// Slugs for built-in World-Building Chat templates.
// "outline" was removed here (P0.4 R5) — outline planning now belongs to its own dedicated
// Outline chat (chatType: "outline"), per docs/Chat_Panel_Integrations_Design.md §1 ("Outline
// template — Removed from WB — outline work on Outline rail/chat").
export type WorldBuildingTemplateSlug = "character_codex" | "locations" | "factions" | "timeline" | "freeform";

export interface WorldBuildingTemplate {
    slug: WorldBuildingTemplateSlug;
    name: string;
    description: string;
    defaultTitle: string;
    systemPromptHint: string;
}

// Built-in template registry. Extend here to add new templates.
export const WORLD_BUILDING_TEMPLATES: readonly WorldBuildingTemplate[] = [
    {
        slug: "character_codex",
        name: "Character Codex",
        description:
            "Develop characters and build out Codex entries. Focus on concrete physical details, history, and mannerisms.",
        defaultTitle: "Character Development",
        systemPromptHint:
            "Focus on concrete, physical details: appearance, wardrobe, mannerisms, history. Avoid psychological analysis. When information is confirmed, suggest it as a Codex entry update."
    },
    {
        slug: "locations",
        name: "Locations & Settings",
        description:
            "Build out the geography, architecture, and atmosphere of story locations.",
        defaultTitle: "Locations",
        systemPromptHint:
            "Focus on sensory details: sights, sounds, smells, textures. Build a vivid sense of place grounded in " +
            "concrete description. When developing a location, let the conversation work through these threads as " +
            "they come up naturally (not a rigid checklist to march through in order): role in the story, scale " +
            "(room / building / district / city / region / plane), sensory spine, layout bones, rules of the " +
            "place (what's allowed/forbidden/dangerous here), who holds or controls it, places it's linked to, " +
            "story functions it could serve, open mysteries worth leaving unresolved, and a visual/map brief for " +
            "image generation."
    },
    {
        slug: "factions",
        name: "Factions & Groups",
        description:
            "Define organisations, power structures, and social groups in the story world.",
        defaultTitle: "Factions",
        systemPromptHint:
            "Develop group dynamics, hierarchies, goals, and conflicts. Keep descriptions factual and concrete."
    },
    {
        slug: "timeline",
        name: "Timeline",
        description: "Establish story chronology, key events, and historical context.",
        defaultTitle: "Timeline",
        systemPromptHint:
            "Build a coherent timeline of events. Flag any contradictions with established facts and suggest resolutions."
    },
    {
        slug: "freeform",
        name: "Freeform",
        description: "Open-ended worldbuilding without a specific focus.",
        defaultTitle: "World-Building",
        systemPromptHint:
            "Help explore and develop the story world in whatever direction is most useful."
    }
];

export const getTemplate = (slug: WorldBuildingTemplateSlug): WorldBuildingTemplate | undefined =>
    WORLD_BUILDING_TEMPLATES.find(t => t.slug === slug);

// Maps a lorebook category (LorebookEntry["category"]) onto the WB template that best fits it —
// used to auto-start the docked WB chat for a handoff/quick-add seed. item/event/note/synopsis/
// "starting scenario" have no dedicated template, so they fall back to freeform.
const CATEGORY_TO_WB_TEMPLATE: Record<string, WorldBuildingTemplateSlug> = {
    character: "character_codex",
    location: "locations",
    timeline: "timeline"
};

export const categoryToWbTemplate = (category: string): WorldBuildingTemplateSlug =>
    CATEGORY_TO_WB_TEMPLATE[category] ?? "freeform";

// Auto-start-and-seed instruction for the docked WB chat (LorebookEntryEditor.tsx's
// WorldBuildingChatPanel) — carried on a Lorebook "new"/"entry" open-tab across the tab's own
// draft->real-entry promotion (see LorebookPage.tsx's onEntryCreated wiring), since a fresh
// entryId remounts that panel and would otherwise drop any local in-flight seed state.
export interface WorldBuildingSeed {
    templateSlug: WorldBuildingTemplateSlug;
    composerText: string;
}

// A Codex entry surfaced as context for a chat. `role` distinguishes how it was surfaced so the
// client can format/prioritize it differently — see chatContextService.ts:
//   "anchor"  — the entry this chat was opened from (WorldBuildingChatPanel), always current
//   "related" — a one-hop metadata.relationships target of the anchor entry
//   "search"  — found via RAG hybrid search against the chat's title/query, may be tangential
export interface ChatContextCodexEntry {
    entryId: string;
    name: string;
    category: string;
    excerpt: string;
    role: "anchor" | "related" | "search";
    // Only ever populated for role: "anchor" — the entry's current structured Codex state, so the
    // model can see what already exists before proposing wardrobe/appearance/wounds/items changes
    // (see CODEX_PROPOSAL_INSTRUCTIONS in chatContextService.ts). Omitted for related/search rows
    // to keep their context small.
    codexState?: CodexState | null;
    // T5 FS4 — only ever populated for role: "anchor". The entry's current Lore Sheet markdown, so
    // a sheet-proposal builds on what's already there instead of starting from scratch (see
    // SHEET_PROPOSAL_INSTRUCTIONS in chatContextService.ts).
    sheetBody?: string | null;
}

// A chapter passage surfaced as context for an Editor chat — only populated for
// chatType="editor", see chatContextService.ts:
//   "anchor" — the chapter this chat was opened while focused on (aiChats.anchorChapterId),
//              pulled directly from its own ragChunks, always current
//   "search" — found via RAG hybrid search against the chat's title/query, may be tangential
export interface ChatContextChapterPassage {
    chapterId: string;
    title: string;
    excerpt: string;
    role: "anchor" | "search";
}

// A Story Note surfaced as context — only populated when BOTH the note's own includeInAi flag
// and this chat's includeNotes toggle are on (docs/Notes_Outline_Chat_Bridges_Design.md's double
// gate). No anchor concept (notes aren't opened "from" a chat the way an entry/chapter can be) —
// always found via RAG hybrid search, so always "search". Non-canon working material, never
// treated as established fact by itself — see chatContextService.ts's framing text.
export interface ChatContextNoteExcerpt {
    id: string;
    title: string;
    excerpt: string;
    role: "search";
}

// An Outline item surfaced as context — same double-gate posture as ChatContextNoteExcerpt, via
// includeInAi + this chat's includeOutline toggle. Planning intent, not canon.
export interface ChatContextOutlineExcerpt {
    id: string;
    title: string;
    type: "chapter" | "scene";
    excerpt: string;
    role: "search";
}

// One row of the full outline tree — only populated for chatType="outline" (see
// chatContextService.ts's resolveFullOutlineTree). Unlike ChatContextOutlineExcerpt (RAG-search,
// opt-in via includeOutline, excerpt-only), this is the Outline chat's own always-on structured
// read: every outlineItem in the story (title + summary, not just a search excerpt), so the
// client can reconstruct the whole chapter/scene tree, not just a ranked list.
export interface ChatContextOutlineTreeItem {
    id: string;
    parentId: string | null;
    type: "chapter" | "scene";
    title: string;
    summary: string | null;
    order: number;
    chapterId: string | null;
}

// A written chapter's title + summary (chapters.summary, distinct from any linked outlineItem's
// own summary) — only populated for chatType="outline" (see resolveWrittenChapterSummaries).
// Never includes chapter body content (that's Editor-only, via relevantChapterPassages).
export interface ChatContextWrittenChapter {
    id: string;
    title: string;
    summary: string | null;
    order: number;
}

// An active Project Memory entry surfaced as context — gated on this chat's includeMemory toggle
// only (C1, Agent_Framework_And_Project_Memory_Design.md §4.5). Unlike notes/outline, there's no
// per-item flag on the memory side of the gate: every `status: "active"` memory is already
// index-eligible (Phase B's approve step is the gate). Distilled/approved, so — unlike notes/
// outline's "working material, not canon" framing — this is presented as project fact, just
// possibly outdated if superseded since; see chatContextService.ts's framing text.
export interface ChatContextMemoryExcerpt {
    id: string;
    title: string;
    category: string;
    excerpt: string;
    // "pinned" rows are always included (P1.1 pin semantics) regardless of hybridSearch ranking;
    // "search" rows only surfaced because they ranked into this turn's search pool.
    role: "search" | "pinned";
}

// A ladder-resolved Playbook Pack, ready to inject into context — Character Guided Playbook
// Packs (Hybrid D), docs/Character_Guided_Playbook_Packs_Design.md §5. `scope` reports which tier
// of the ladder actually resolved (story/global/shipped), shown in the client's packet label.
export interface ChatContextPlaybookPack {
    playbookKey: string;
    style: string;
    scope: "shipped" | "global" | "story";
    body: string;
}

// TL8, docs/Story_Timeline_Design.md — a Spine timeline pin surfaced as compact chronology
// context, gated on this chat's own includeTimeline toggle. "when" is a resolved display label
// (e.g. "6y before start", "that winter", "1890"), not the raw whenKind/offset fields — the model
// only needs order + a human label, not the full structured pin. No linked-entry body is ever
// included (design doc: "not full linked bodies") — see chatContextService.ts's resolveTimelinePins.
export interface ChatContextTimelinePinExcerpt {
    id: string;
    title: string;
    blurb: string | null;
    when: string;
}

// Gated on this chat's own includeGuide toggle — app-usage documentation (src/features/guide/
// content/*.mdx), not story content. Resolved by server/services/guideSearchService.ts's
// searchGuideForChat, a standalone in-memory text search deliberately NOT routed through
// hybridSearch/ragChunks (the guide isn't story-scoped and doesn't fit hybridSearch's required
// storyId partition — see chatContextService.ts's getChatContext).
export interface ChatContextGuideExcerpt {
    topicLabel: string;
    subTabLabel: string | null;
    heading: string;
    excerpt: string;
}

// Assembled context for generating a chat response or proposal: the effective system
// prompt (chat-type framing + template hint for World-Building), this chat's own unresolved
// Codex proposals, and Codex entries / chapter passages relevant to the current topic.
// See chatContextService.ts.
export interface ChatContext {
    systemPrompt: string;
    pendingProposals: CodexPendingChange[];
    // story.synopsis, injected unconditionally for any story-scoped chat (null for global chats
    // or stories with no synopsis set) — baseline project grounding independent of RAG.
    projectSynopsis: string | null;
    relevantCodexEntries: ChatContextCodexEntry[];
    relevantChapterPassages: ChatContextChapterPassage[];
    // Empty unless the chat's includeNotes/includeOutline toggle is on (Notes/Outline bridge) —
    // see getChatContext in chatContextService.ts.
    relevantNotes: ChatContextNoteExcerpt[];
    relevantOutlineItems: ChatContextOutlineExcerpt[];
    // Empty unless the chat's includeMemory toggle is on (C1) — see getChatContext.
    relevantMemories: ChatContextMemoryExcerpt[];
    // Empty except for chatType="outline" — the Outline chat's own always-on structured reads
    // (P0.4 R5), not RAG-ranked and not gated by any toggle (distinct from relevantOutlineItems
    // above, which stays the opt-in RAG-search path other chat types use).
    outlineTree: ChatContextOutlineTreeItem[];
    writtenChapters: ChatContextWrittenChapter[];
    // Chapter titles+summaries, gated on this chat's own includeChapterSummaries toggle (P0.4 B0-
    // B4) — reuses the same shape/resolver Outline's always-on writtenChapters above uses, just
    // toggle-gated instead of chatType-gated. Empty unless the toggle is on, for any chat type
    // (in practice only Brainstorm's UI ever exposes this toggle today).
    chapterSummaries: ChatContextWrittenChapter[];
    // Brainstorm's always-on setup-slot checklist (P0.4 B2/B4) — empty except for
    // chatType="brainstorm". Every entry in BRAINSTORM_SLOTS (src/types/brainstorm.ts) is always
    // present, defaulting to "unknown" if no brainstormSlots row exists yet for that slot.
    priorSetupSlots: { slotKey: string; label: string; status: "known" | "unknown" }[];
    // Count of this Brainstorm chat's own active vs. done checklist items (P0.4 B4) — empty/zero
    // except for chatType="brainstorm", lets the model see whether prior proposals/handoffs are
    // still sitting unresolved before proposing more.
    handoffStatus: { activeCount: number; doneCount: number };
    // Research chat's live web search (P0.4 S1) — empty except for chatType="research" with
    // webSearchEnabled on AND an explicit per-turn `query` passed to getChatContext (never fires
    // on the mount-time no-query fetch, only the per-send one — see ChatInterface.tsx's
    // handleSubmit). fetchedPages covers any http(s) URL found in that same query text.
    webSearchResults: { title: string; url: string; snippet: string }[];
    fetchedPages: { url: string; title: string; text: string }[];
    // Notes chat's own always-on desk reads (P0.4 K1) — empty/null except for chatType="notes".
    // allNotes: every story note's title/type, NOT gated by includeInAi (desk privilege — see
    // docs/Chat_Panel_Integrations_Design.md §7). focusedNote: full body of whichever note is
    // currently open in the Notes tool (getChatContext's focusedNoteId param).
    allNotes: { id: string; title: string; type: string; updatedAt: Date }[];
    focusedNote: { id: string; title: string; content: string; type: string; pinned: boolean } | null;
    // Character Guided Playbook Packs (Hybrid D) — populated only when this chat's usePlaybookPack
    // toggle is on AND templateSlug is "character_codex" (v1 scope). concrete: the coverage pack
    // for the chat's current wbStyle. psych: character_psych/"any", only when includePsychModule is
    // also on. Either may be null (soft-success: no pack found anywhere on the ladder) — see
    // chatContextService.ts's getChatContext / resolvePlaybookPack.
    playbookPack: {
        concrete: ChatContextPlaybookPack | null;
        psych: ChatContextPlaybookPack | null;
        sexuality: ChatContextPlaybookPack | null;
    };
    // Empty unless the chat's includeTimeline toggle is on (TL8) — see getChatContext.
    relevantTimelinePins: ChatContextTimelinePinExcerpt[];
    // Empty unless the chat's includeGuide toggle is on — see getChatContext.
    relevantGuideSections: ChatContextGuideExcerpt[];
    // B6 (docs/BUGS_2026-08-19.md) — full, non-RAG-ranked list of this story's character-category
    // Lorebook entries (names only), present whenever lorebook is in scope for this chat type/
    // toggle (same boolean as relevantCodexEntries' search gating — see chatContextService.ts's
    // getChatContext). Grounds the model against inventing/duplicating named characters, closing
    // the gap relevantCodexEntries' relevance-ranked top-8 cap leaves open for anything not
    // semantically close to the current turn. characterRosterTruncated is true only when the
    // story's real cast exceeds the resolver's sanity cap.
    characterRoster: { id: string; name: string }[];
    characterRosterTruncated: boolean;
    // MCP M2, docs/MCP_Tool_Connections_Design.md §3.3 — empty unless the chat's includeMcpTools
    // toggle is on. Flattened per-tool list from every enabled, in-scope MCP connection's cached
    // tools/list result (see chatContextService.ts's resolveMcpToolCatalogue). truncated mirrors
    // characterRosterTruncated's "cap + honest disclosure" shape (design §3.3's "N tools omitted").
    mcpToolCatalogue: { connectionId: string; connectionName: string; toolName: string; description: string }[];
    mcpToolCatalogueTruncated: boolean;
}
