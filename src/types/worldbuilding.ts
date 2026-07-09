import type { CodexPendingChange } from "./codex.js";

// Chat type discriminator — matches the chatType column on aiChats.
// null / undefined → treat as 'general' at the application layer.
export type ChatType = "worldbuilding" | "research" | "editor" | "general";

// Slugs for built-in World-Building Chat templates.
export type WorldBuildingTemplateSlug =
    | "character_codex"
    | "outline"
    | "locations"
    | "factions"
    | "timeline"
    | "freeform";

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
        slug: "outline",
        name: "Outline",
        description: "Plan story structure, chapter beats, and narrative arc.",
        defaultTitle: "Story Outline",
        systemPromptHint:
            "Help structure the narrative arc, chapter sequence, and scene beats. Keep suggestions concrete and actionable."
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

// A Codex entry surfaced as relevant context for a chat (via the RAG hybrid search index).
export interface ChatContextCodexEntry {
    entryId: string;
    name: string;
    category: string;
    excerpt: string;
}

// A chapter passage surfaced as relevant context for an Editor chat (via the RAG hybrid
// search index) — only populated for chatType="editor", see chatContextService.ts.
export interface ChatContextChapterPassage {
    chapterId: string;
    title: string;
    excerpt: string;
}

// Assembled context for generating a chat response or proposal: the effective system
// prompt (chat-type framing + template hint for World-Building), this chat's own unresolved
// Codex proposals, and Codex entries / chapter passages relevant to the current topic.
// See chatContextService.ts.
export interface ChatContext {
    systemPrompt: string;
    pendingProposals: CodexPendingChange[];
    relevantCodexEntries: ChatContextCodexEntry[];
    relevantChapterPassages: ChatContextChapterPassage[];
}
