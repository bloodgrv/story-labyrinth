// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — in-world chronology board, the
// time twin of Story Maps (src/types/storyMaps.ts). Three domain shapes: timelines (spine + future
// named ones, TL5), pins (story-scoped SoT — a pin exists independent of which timeline(s) show
// it), memberships (join, a pin can appear on multiple timelines without duplicate drifting copies).

export type TimelineOrientation = "horizontal" | "vertical";
export type StoryStartMode = "chapter_one" | "manual_pin" | "manual_time";
export type PinWhenKind = "relative" | "fuzzy" | "civil";
export type PinLinkType = "chapter" | "lorebook" | "note";

// Same shape as storyTimelinePins' flat when-fields, reused for storyStartManualWhenJson
// (storyStartMode="manual_time" — a writer-set anchor with no backing chapter or pin).
export interface PinWhen {
    whenKind: PinWhenKind;
    relativeOffsetYears?: number | null;
    fuzzyPhrase?: string | null;
    civilDate?: string | null;
}

export interface StoryTimeline {
    id: string;
    storyId: string;
    title: string;
    isDefault: boolean;
    orientation: TimelineOrientation;
    storyStartMode: StoryStartMode;
    storyStartChapterId: string | null;
    storyStartPinId: string | null;
    storyStartManualWhenJson: PinWhen | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface TimelinePin extends PinWhen {
    id: string;
    storyId: string;
    title: string;
    blurb: string | null;
    manualOrder: number;
    linkType: PinLinkType | null;
    linkId: string | null;
    createdAt: Date;
    updatedAt: Date;
    // Resolved server-side alongside the pin list so "Place on timeline" buttons and the board can
    // both use one fetch — which timeline(s) this pin currently belongs to.
    memberships: TimelineMembership[];
}

export interface TimelineMembership {
    id: string;
    timelineId: string;
    pinId: string;
    laneId: string | null;
    createdAt: Date;
}
