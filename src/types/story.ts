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

// SceneBeat structure
export interface SceneBeat extends BaseEntity {
    storyId: string;
    chapterId: string;
    command: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    povCharacter?: string;
    generatedContent?: string; // To store the last generated content
    accepted?: boolean; // Whether the generated content was accepted
    metadata?: {
        useMatchedChapter?: boolean;
        useMatchedSceneBeat?: boolean;
        useCustomContext?: boolean;
        [key: string]: unknown;
    };
}

// AI Chat types
export interface AIChat extends BaseEntity {
    storyId: string | null; // null for global chats (e.g. Research) — see ChatType
    title: string;
    messages: ChatMessage[];
    updatedAt?: Date;
    lastUsedPromptId?: string;
    lastUsedModelId?: string;
    // Chat context type — null/undefined treated as 'general'
    chatType?: ChatType | null;
    // Worldbuilding template identifier; only meaningful when chatType = 'worldbuilding'
    templateSlug?: WorldBuildingTemplateSlug | null;
    // The Lorebook entry this chat was opened from (WorldBuildingChatPanel), for direct
    // grounding in getChatContext — null for chats not opened from an entry.
    anchorEntryId?: string | null;
    // Double-gate opt-in for the Notes/Outline ↔ chat bridge (docs/Notes_Outline_Chat_Bridges_Design.md)
    // — paired with each note/outline item's own includeInAi flag. Both default false server-side
    // (optional here since creation never needs to specify them); Editor chats never expose these
    // toggles (stay canon-only).
    includeNotes?: boolean;
    includeOutline?: boolean;
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
        | "scene_beat"
        | "gen_summary"
        | "selection_specific"
        | "continue_writing"
        | "other"
        | "brainstorm"
        | "worldbuilding"
        | "research"
        | "editor";
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
}

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
}

// Lorebook types
export type LorebookLevel = "global" | "series" | "story";

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
}

// Prompt Parser types
export interface PromptParserConfig {
    storyId: string;
    chapterId?: string;
    promptId: string;
    scenebeat?: string;
    cursorPosition?: number;
    previousWords?: string;
    matchedEntries?: Set<LorebookEntry>;
    additionalContext?: Record<string, unknown>;
    chapterMatchedEntries?: Set<LorebookEntry>;
    sceneBeatMatchedEntries?: Set<LorebookEntry>;
    povCharacter?: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    storyLanguage?: string;
    sceneBeatContext?: {
        useMatchedChapter: boolean;
        useMatchedSceneBeat: boolean;
        useCustomContext: boolean;
        customContextItems?: string[]; // IDs of selected lorebook items
    };
}

export interface PromptContext {
    storyId: string;
    chapterId?: string;
    scenebeat?: string;
    cursorPosition?: number;
    previousWords?: string;
    matchedEntries?: Set<LorebookEntry>;
    chapters?: Chapter[];
    currentChapter?: Chapter;
    additionalContext?: Record<string, unknown>;
    chapterMatchedEntries?: Set<LorebookEntry>;
    sceneBeatMatchedEntries?: Set<LorebookEntry>;
    povCharacter?: string;
    povType?: "First Person" | "Third Person Limited" | "Third Person Omniscient";
    storyLanguage?: string;
    sceneBeatContext?: {
        useMatchedChapter: boolean;
        useMatchedSceneBeat: boolean;
        useCustomContext: boolean;
        customContextItems?: string[]; // IDs of selected lorebook items
    };
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
    sceneBeats: SceneBeat[];
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
        sceneBeats: SceneBeat[];
        notes: Note[];
        aiSettings: AISettings[];
    };
}
