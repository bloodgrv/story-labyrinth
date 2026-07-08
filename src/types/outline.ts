// Story Outlining: a visual, two-level hierarchical outline (chapters containing scenes) that
// sits above the actual Chapter/prose content — a planning layer, not a replacement for the
// existing per-chapter free-text outline field (Chapter.outline / ChapterOutline.tsx), which is
// unrelated and untouched. An outline "chapter" row may optionally link to a real Chapter (via
// chapterId) for cross-navigation, but doesn't have to — outlining can happen before any prose
// exists.

export type OutlineItemType = "chapter" | "scene";

// Mirrors ConcreteBeatSource/ConcreteBeatStatus exactly (see src/types/beats.ts) — 'manual' for
// user-created rows, 'ai_suggested'+'pending' for AI-generated ones awaiting accept/reject.
export type OutlineItemSource = "manual" | "ai_suggested";
export type OutlineItemStatus = "confirmed" | "pending" | "rejected";

export interface OutlineItem {
    id: string;
    storyId: string;
    parentId?: string | null;
    type: OutlineItemType;
    title: string;
    summary?: string | null;
    wordCountTarget?: number | null;
    order: number;
    source: OutlineItemSource;
    status: OutlineItemStatus;
    chapterId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// A character's link to a specific outline item, carrying a short free-text note about that
// character's development/state at this point in the story. The ordered sequence of these
// (in outline order) across every item a character is linked to is the "arc overview" — see
// useCharacterArcQuery / CharacterArcPanel.
export interface OutlineItemCharacterLink {
    id: string;
    outlineItemId: string;
    storyId: string;
    characterId: string;
    arcNote?: string | null;
    createdAt: Date;
}

// One row in a character's arc overview: the outline item they're linked to, plus that link's
// note, already in story order (chapter order, then scene order within it).
export interface CharacterArcEntry {
    outlineItem: OutlineItem;
    link: OutlineItemCharacterLink;
}

// POST /api/outline/generate always responds 200 — expected failure modes (no AI provider,
// nothing to generate from) are `{ success: false, message }`, matching the beats/humanizer/TTS
// soft-fail convention.
export interface OutlineGenerationResult {
    success: boolean;
    suggestions?: OutlineItem[];
    message?: string;
}

// Bulk reorder/reparent payload for PATCH /api/outline/reorder — sent as a batch (rather than
// one PUT per moved row) since a single drag can change the parentId and/or order of many
// sibling rows at once.
export interface OutlineReorderUpdate {
    id: string;
    parentId?: string | null;
    order: number;
}
