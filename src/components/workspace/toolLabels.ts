import type { WorkspaceTool } from "@/features/stories/context/StoryContext";

// Single source of truth for a tool's display name — used by Sidebar.tsx's nav buttons and by
// useDocumentTitle.ts (so a tab opened via "New tab" is distinguishable from the others, e.g.
// "Story Labyrinth - Editor").
export const TOOL_LABELS: Record<WorkspaceTool, string> = {
    stories: "Stories",
    series: "Series",
    editor: "Editor",
    chapters: "Chapters",
    outline: "Outline",
    lorebook: "Lorebook",
    brainstorm: "Brainstorm",
    research: "Research",
    notes: "Notes",
    "name-generator": "Names",
    memory: "Memory",
    relationships: "Relations",
    "story-map": "Maps",
    "story-timeline": "Timeline",
    scanner: "Scanner",
    "ai-review": "AI Review",
    users: "Users",
    playbooks: "Playbooks"
};
