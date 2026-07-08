// Concrete Beats: small, observable units of action or change tagged inline on spans of chapter
// prose (physical actions, wardrobe/item changes, environmental/sensory detail, movement,
// dialogue, time/setting shifts). Deliberately excludes anything psychological, thematic, or
// internal — this taxonomy is fixed and should stay that way; see CLAUDE.md's Character Codex
// section, which this feature is designed to eventually feed (wardrobe/items/wounds tracking).
//
// This is NOT the same as the existing "Scene Beat" feature (src/types/story.ts SceneBeat) —
// that's a command a writer inserts for the AI to expand into prose. A Concrete Beat is a tag
// applied to prose that already exists, for tracking/consistency purposes. Two different
// concepts that happen to share the word "beat".

export type ConcreteBeatType =
    | "physical_action"
    | "dialogue_tag"
    | "environmental_detail"
    | "wardrobe_item_change"
    | "time_setting_shift"
    | "sensory_detail"
    | "character_movement";

export interface ConcreteBeatTypeMeta {
    id: ConcreteBeatType;
    label: string;
    description: string;
    // Tailwind classes for regular React UI (badges, list items) — NOT used for the inline
    // editor mark, which is styled via plain CSS in PlaygroundEditorTheme.css for specificity
    // reasons (see BeatMarkNode.ts).
    badgeClassName: string;
}

export const CONCRETE_BEAT_TYPES: ConcreteBeatTypeMeta[] = [
    {
        id: "physical_action",
        label: "Physical Action",
        description: "A concrete physical act — a punch thrown, a door opened, a hand reaching out.",
        badgeClassName: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
    },
    {
        id: "dialogue_tag",
        label: "Dialogue Tag",
        description: "A line of spoken dialogue or its attribution.",
        badgeClassName: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
    },
    {
        id: "environmental_detail",
        label: "Environmental Detail",
        description: "A concrete detail about the physical setting — weather, lighting, objects in the room.",
        badgeClassName: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
    },
    {
        id: "wardrobe_item_change",
        label: "Wardrobe/Item Change",
        description: "A character puts on, removes, or acquires clothing or an item.",
        badgeClassName: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
    },
    {
        id: "time_setting_shift",
        label: "Time/Setting Shift",
        description: "A jump in time or a change of location.",
        badgeClassName: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    },
    {
        id: "sensory_detail",
        label: "Sensory Detail",
        description: "A concrete sensory observation — a sound, smell, taste, or texture.",
        badgeClassName: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
    },
    {
        id: "character_movement",
        label: "Character Movement",
        description: "A character moves from one place to another within the scene.",
        badgeClassName: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
    }
];

export const CONCRETE_BEAT_TYPE_MAP: Record<ConcreteBeatType, ConcreteBeatTypeMeta> = Object.fromEntries(
    CONCRETE_BEAT_TYPES.map(type => [type.id, type])
) as Record<ConcreteBeatType, ConcreteBeatTypeMeta>;

// 'manual' (Task 1) or 'ai_suggested' (Task 3 — both the manually-triggered "Suggest Beats"
// button and background auto-tagging after a save use this same source/status pair).
export type ConcreteBeatSource = "manual" | "ai_suggested";

// 'confirmed' is immediate for manual beats. 'pending' is where every AI suggestion starts —
// it is NOT inserted into the document as a mark until the user accepts it (see
// BeatMarkSyncPlugin's accept handler). 'rejected' rows are kept (not deleted) as an audit
// trail, mirroring the codexPendingChanges 'pending'|'approved'|'rejected' convention.
export type ConcreteBeatStatus = "confirmed" | "pending" | "rejected";

export interface ConcreteBeat {
    id: string;
    storyId: string;
    chapterId: string;
    beatType: ConcreteBeatType;
    // Snippet of the marked prose, captured at creation time — also doubles as the id stored in
    // the Lexical BeatMarkNode's mark ids (this row IS the anchor's source of truth).
    text: string;
    // The character (lorebookEntries.id) this beat's concrete state applies to, if any — lets
    // the beat reference/pull the character's Codex state (wardrobe, items, wounds, appearance).
    // A real FK, unlike Chapter.povCharacter/SceneBeat.povCharacter which store a display name —
    // this needs to reliably re-fetch structured Codex data, not just render a label. May point
    // to a since-deleted entry (FK enforcement is off database-wide in this app — see
    // DECISIONS.md), so treat a non-resolving id as "character removed", not an error.
    characterId?: string | null;
    source: ConcreteBeatSource;
    status: ConcreteBeatStatus;
    createdAt: Date;
}

// POST /api/beats/detect always responds 200 with this shape — expected failure modes (no AI
// provider configured, model error) are `{ success: false, message }`, matching the
// TTS/Humanizer soft-fail convention.
export interface BeatDetectionResult {
    success: boolean;
    suggestions?: ConcreteBeat[];
    message?: string;
}
