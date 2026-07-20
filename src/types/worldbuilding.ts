import type { CodexPendingChange } from "./codex.js";

// Chat type discriminator — matches the chatType column on aiChats.
// null / undefined → treat as 'general' at the application layer.
export type ChatType = "worldbuilding" | "research" | "editor" | "outline" | "general";

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
            "Focus on sensory details: sights, sounds, smells, textures. Build a vivid sense of place grounded in concrete description."
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
    role: "search";
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
}
