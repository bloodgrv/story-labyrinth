import type { CodexState } from "./codex.js";
import type { ChatType, WorldBuildingTemplateSlug } from "./worldbuilding.js";

// Base types for common fields (used across all entities)
interface BaseEntity {
    id: string;
    createdAt: Date;
    isDemo?: boolean; // Flag to identify demo content
}

// Core story type
export interface Story extends BaseEntity {
    title: string;
    author: string;
    language: string;
    synopsis?: string;
    seriesId?: string;
    // Book-order position within seriesId (1, 2, 3, ...). Null/undefined until manually reordered
    // via SeriesStoriesList.tsx's drag handle — falls back to createdAt order until then.
    seriesOrder?: number | null;
    // C4 (docs/CURRENT_BACKLOG.md P0.3) — opt-in for jobRunner.ts's daily unattended rag_scan_story
    // schedule tick. Defaults false server-side.
    unattendedScanEnabled?: boolean;
}

// Series type
export interface Series extends BaseEntity {
    name: string;
    description?: string;
}

// Chapter structure
export interface Chapter extends BaseEntity {
    storyId: string;
    title: string;
    summary?: string;
    order: number;
    content: string;
    outline?: ChapterOutline;
    wordCount: number;
    povCharacter?: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    notes?: ChapterNotes;
}

export interface ChapterOutline {
    content: string;
    lastUpdated: Date;
}

export interface ChapterNotes {
    content: string;
    lastUpdated: Date;
}

// AI Chat types
export interface AIChat extends BaseEntity {
    storyId: string | null; // null for global chats (e.g. Research) — see ChatType
    title: string;
    messages: ChatMessage[];
    updatedAt?: Date;
    // Archive/soft-delete (app-wide) — set = hidden from its normal rail, restorable from Settings.
    archivedAt?: Date | null;
    lastUsedPromptId?: string;
    lastUsedModelId?: string;
    // Chat context type — null/undefined treated as 'general'
    chatType?: ChatType | null;
    // Worldbuilding template identifier; only meaningful when chatType = 'worldbuilding'
    templateSlug?: WorldBuildingTemplateSlug | null;
    // The Lorebook entry this chat was opened from (WorldBuildingChatPanel), for direct
    // grounding in getChatContext — null for chats not opened from an entry.
    anchorEntryId?: string | null;
    // The chapter this chat was opened while focused on (EditorChatRail), for direct grounding
    // in getChatContext and for resolving which Editor chat a "Rework in chat" request binds to
    // (see EditorChatRail.tsx) — null for chats not anchored to a chapter.
    anchorChapterId?: string | null;
    // Double-gate opt-in for the Notes/Outline ↔ chat bridge (docs/Notes_Outline_Chat_Bridges_Design.md)
    // — paired with each note/outline item's own includeInAi flag. Both default false server-side
    // (optional here since creation never needs to specify them); Editor chats never expose these
    // toggles (stay canon-only).
    includeNotes?: boolean;
    includeOutline?: boolean;
    // Opt-in gate for surfacing active Project Memory in this chat's context (Agent Framework
    // Phase B / Agent_Framework_And_Project_Memory_Design.md §4.5's "Include project memory", C1).
    // Defaults false server-side; optional here for the same reason as the two fields above.
    includeMemory?: boolean;
    // TL8, docs/Story_Timeline_Design.md — opt-in gate for the compact Spine chronology block.
    // Same posture as includeMemory above. Defaults false server-side.
    includeTimeline?: boolean;
    // Opt-in gate for surfacing relevant Guide (app documentation, not story content) sections —
    // available on every chat type, default false. See chatContextService.ts's getChatContext.
    includeGuide?: boolean;
    // Brainstorm-only opt-in gates (P0.4 B0-B4, docs/Chat_Panel_Integrations_Design.md §5) —
    // lorebook search and chapter titles+summaries are OFF by default for Brainstorm, unlike
    // every other chat type. Ignored for any other chatType. Defaults false server-side.
    includeLorebook?: boolean;
    includeChapterSummaries?: boolean;
    // Light | Standard | Grill-me — Brainstorm's interview-depth style (P0.4 B2). Defaults
    // 'standard' server-side; ignored for any other chatType.
    brainstormStyle?: string;
    // Same guided-start style concept, extended to WB and Outline chats (P0.4 B5) — each ignored
    // outside its own chatType. Defaults 'standard' server-side.
    wbStyle?: string;
    outlineStyle?: string;
    // Opt-in for the Character template's psych module (P0.4 B5) — only meaningful for
    // worldbuilding chats whose templateSlug is "character_codex". Defaults false server-side.
    includePsychModule?: boolean;
    // Character Guided Playbook Packs (Hybrid D) — arm toggle for injecting a resolved
    // playbookPacks row into context. Only meaningful for worldbuilding chats whose templateSlug
    // is "character_codex". Defaults false server-side.
    usePlaybookPack?: boolean;
    // Auto-insert/auto-accept toggles (P0.4 R6, docs/Chat_Panel_Integrations_Design.md doctrine
    // "no silent canon unless an explicit toggle is ON") — all default false server-side.
    // autoInsertProse only matters for Editor chats; autoAcceptCodex for Editor/WB/Outline;
    // autoAcceptOutline for Outline only (create/edit/reorder, never delete).
    autoInsertProse?: boolean;
    autoAcceptCodex?: boolean;
    autoAcceptOutline?: boolean;
    // Research-only (P0.4 S1) — live web search + page fetch off-switch. Defaults true
    // server-side, unlike every other opt-in toggle above (search is the desk's core job).
    webSearchEnabled?: boolean;
    // Chat Shuttle H7 (docs/Chat_Shuttle_Design.md) — Editor/Outline/WB-only "always-shuttle" pref.
    // Defaults false server-side, same posture as autoAcceptCodex.
    autoShuttle?: boolean;
    // Cosmetic org folder this chat is filed under (B9, docs/Folders_Org_Design.md) — null =
    // Unfiled. See src/types/folders.ts's OrgFolder.
    folderId?: string | null;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    // Optional edit metadata
    originalContent?: string; // the original content before the first edit
    editedAt?: string; // ISO timestamp when last edited
    editedBy?: string; // who edited it (e.g., 'user')
    edited?: boolean; // convenience flag
    // Context/Token Meter (T4, M3) — real provider usage for this turn, when reported (Local
    // only this pass, via stream_options.include_usage — see LocalAIProvider.generate()).
    // Assistant messages only; absent for every other provider or if usage wasn't reported.
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Prompt related types
export interface PromptMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AllowedModel {
    id: string;
    provider: AIProvider;
    name: string;
}

export interface Prompt extends BaseEntity {
    name: string;
    description?: string;
    promptType:
        | "gen_summary"
        | "selection_specific"
        | "continue_writing"
        | "other"
        | "brainstorm"
        | "worldbuilding"
        | "research"
        | "editor"
        | "outline"
        | "notes";
    messages: PromptMessage[];
    allowedModels: AllowedModel[];
    storyId?: string;
    isSystem?: boolean; // Flag to identify system prompts
}

// AI Provider and Model types
export type AIProvider = "openai" | "openrouter" | "local" | "gemini" | "grok" | "grok-session" | "grok-oauth";

export interface AIModel {
    id: string;
    name: string;
    provider: AIProvider;
    contextLength: number;
    enabled: boolean;
}

export interface AISettings extends BaseEntity {
    openaiKey?: string;
    openrouterKey?: string;
    geminiKey?: string;
    grokKey?: string;
    grokSessionCookie?: string;
    grokOAuthAccessToken?: string;
    grokOAuthRefreshToken?: string;
    grokOAuthExpiresAt?: number;
    availableModels: AIModel[];
    lastModelsFetch?: Date;
    localApiUrl?: string;
    defaultLocalModel?: string;
    defaultOpenAIModel?: string;
    defaultOpenRouterModel?: string;
    defaultGeminiModel?: string;
    defaultGrokModel?: string;
    defaultGrokSessionModel?: string;
    defaultGrokOAuthModel?: string;
    // Chat Model Routing (MR0) — see server/db/schema.ts's aiSettings comment.
    preferredMode: ChatMode;
    // Context/Token Meter (T4) — see server/db/schema.ts's aiSettings comment.
    contextWindowOverride?: number | null;
    softWarnNearLimit?: boolean;
    softWarnThreshold?: number;
    // Local generation output budget override (2026-07-27) — see server/db/schema.ts's
    // aiSettings comment. Null = use AIService's hardcoded default.
    localMaxOutputTokens?: number | null;
}

// Chat Model Routing (docs/Chat_Model_Routing_And_Chrome_Design.md) — not a "current provider",
// just which family a chat's model should default to. "local" maps to provider "local"; every
// other AIProvider (openai/openrouter/gemini/grok/grok-session/grok-oauth) is "cloud".
export type ChatMode = "cloud" | "local";

// Note types
export interface Note extends BaseEntity {
    storyId: string;
    title: string;
    content: string;
    type: "idea" | "research" | "todo" | "other";
    updatedAt: Date;
    // Opt-in gate for the Notes/Outline ↔ chat bridge — see aiChats.includeNotes on AIChat above.
    // Defaults false server-side; optional here since creation never needs to specify it.
    includeInAi?: boolean;
    // P0.4 K0 — pins to the top of the Notes list. Defaults false server-side.
    pinned?: boolean;
    // T7 (NO3) — cosmetic org folder (orgFolders.kind="notes"). null/undefined = Unfiled.
    folderId?: string | null;
    // T7 (NO5) — thin optional tags, filter/search only, never affects RAG/chat context.
    tags?: string[] | null;
}

// Lorebook types
export type LorebookLevel = "global" | "series" | "story";

// Location template's "light place sheet" fields (L0/L1, docs/Locations_And_Maps_Design.md) —
// exported so both PlaceSheetFields.tsx (manual edit form) and parsePlaceSheetProposal.ts (chat
// fence) share one shape.
export interface PlaceState {
    scale?: string;
    biomeOrClimate?: string;
    holder?: string;
    dangerLevel?: string;
    landmarks?: string[];
    exitsSummary?: string;
    layoutMd?: string;
    imageBrief?: string;
    // L5a, docs/Locations_And_Maps_Design.md — free text ("Ground Floor", "2F", "Sub-basement"),
    // not a strict numeric level. Only meaningful for a location nested under another via a
    // storyMapEdges "contains" edge — see StoryMapCanvas.tsx's region-focus sibling sort.
    floorLabel?: string;
}

export interface LorebookEntry extends BaseEntity {
    level: LorebookLevel;
    scopeId?: string; // seriesId when level='series', storyId when level='story'
    name: string;
    description: string;
    category: "character" | "location" | "item" | "event" | "note" | "synopsis" | "starting scenario" | "timeline";
    // Tags are stored as an array of strings, can contain spaces and special characters
    tags: string[];
    metadata?: {
        type?: string;
        importance?: "major" | "minor" | "background";
        status?: "active" | "inactive" | "historical";
        relationships?: Array<{
            targetId: string;
            type: string;
            description?: string;
        }>;
        customFields?: Record<string, unknown>;
        // Character template's opt-in psych module (P0.4 B5, docs/Chat_Panel_Integrations_Design.md
        // §1's "Character playbook — psych module") — MBTI + Enneagram + freeform blurb, derived
        // from a chat interview then propose→accept (ChatInterface.tsx's psych-proposal handling,
        // PsychProfilePanel.tsx for display). Deliberately NOT part of codexState — writing aid
        // only, never scanner-enforced, never a continuity "law" pipeline.
        psychProfile?: { mbti?: string; enneagram?: string; blurb?: string };
        // Location template's "light place sheet" (L0/L1, docs/Locations_And_Maps_Design.md) —
        // scale/climate/holder/danger/landmarks/exits/layout/image-brief. Same posture as
        // psychProfile: not Codex state, editable directly on the entry form (PlaceSheetFields.tsx)
        // AND propose→accept via WB chat (ChatInterface.tsx's handleAcceptPlaceSheet). layoutMd is
        // export/legacy-only once a Maps v2 sketch exists for this location (StoryMapDocument.
        // sceneJson is the real SoT, see src/types/storyMaps.ts) — MapDetailPanel.tsx's Export/
        // Convert-to-sketch bridge both directions between the two.
        placeState?: PlaceState;
    };
    isDisabled?: boolean;
    // Codex extension — null/undefined means plain lorebook entry
    codexEnabled?: boolean | null;
    needsFleshingOut?: boolean | null;
    codexState?: CodexState | null;
    updatedAt?: Date | null;
    // Generated filename on disk (server/services/lorebookImageStorage.ts) — fetch the actual
    // image via GET /api/lorebook/:id/image, this is not a usable URL on its own.
    imageFilename?: string | null;
    // Cosmetic org folder this entry is filed under (B9, docs/Folders_Org_Design.md) — null =
    // Unfiled. See src/types/folders.ts's OrgFolder.
    folderId?: string | null;
    // Lore Sheet (T5, docs/Lore_Sheet_And_Sync_Design.md) — sheet-first source of truth; markdown
    // with category section headings. Structured Codex/description fields are a derived
    // projection produced by the separate Sync propose→Accept loop, never written from here.
    sheetBody?: string | null;
    // Set on Sync accept only — lets the UI detect "sheet edited since last sync" by comparing
    // against updatedAt. Not touched by a plain sheet save.
    sheetSyncedAt?: Date | null;
    // Scribble — per-entry scratch pad, same shape/doctrine as Chapter.notes: never RAG-indexed or
    // chat-visible, bridges to a real Notes-desk note only via an explicit one-shot "Send to Notes".
    scribble?: ChapterNotes | null;
}

// Prompt Parser types
export interface PromptParserConfig {
    storyId: string;
    chapterId?: string;
    promptId: string;
    // Generic "current instruction" carrier resolved by {{scenebeat}} in any prompt template —
    // named after its origin (the old Scene Beat feature), but populated by every chat type's
    // createPromptConfig (ChatInterface.tsx) with the composer's current input text.
    scenebeat?: string;
    cursorPosition?: number;
    previousWords?: string;
    additionalContext?: Record<string, unknown>;
    chapterMatchedEntries?: Set<LorebookEntry>;
    povCharacter?: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    storyLanguage?: string;
}

export interface PromptContext {
    storyId: string;
    chapterId?: string;
    scenebeat?: string;
    cursorPosition?: number;
    previousWords?: string;
    chapters?: Chapter[];
    currentChapter?: Chapter;
    additionalContext?: Record<string, unknown>;
    chapterMatchedEntries?: Set<LorebookEntry>;
    povCharacter?: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    storyLanguage?: string;
}

export interface ParsedPrompt {
    messages: PromptMessage[];
    error?: string;
}

// Story Export/Import types
export interface StoryExport {
    version: string;
    type: "story";
    exportDate: string;
    story: Story;
    series?: Series;
    chapters: Chapter[];
    lorebookEntries: LorebookEntry[];
    aiChats: AIChat[];
    notes?: Note[];
}

export interface SeriesExport {
    version: string;
    type: "series";
    exportDate: string;
    series: Series;
    lorebookEntries: LorebookEntry[];
    stories: StoryExport[];
    [key: string]: unknown;
}

export interface GlobalLorebookExport {
    version: string;
    type: "global-lorebook";
    exportDate: string;
    lorebookEntries: LorebookEntry[];
}

export interface DatabaseExport {
    version: string;
    exportedAt: string;
    tables: {
        stories: Story[];
        chapters: Chapter[];
        prompts: Prompt[];
        lorebookEntries: LorebookEntry[];
        aiChats: AIChat[];
        notes: Note[];
        aiSettings: AISettings[];
    };
}
