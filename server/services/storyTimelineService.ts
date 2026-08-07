import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { PinLinkType, PinWhen, StoryTimeline, TimelineMembership, TimelinePin } from "../../src/types/storyTimeline.js";
import { db, schema } from "../db/client.js";

// Story Timeline (T6, TL0-TL6, docs/Story_Timeline_Design.md) — schema + CRUD, no AI propose/
// accept (TL7) or scanner hook (TL11) yet. DB access inlined here rather than a separate repository
// layer, same "small enough not to be worth it" call storyMapsService.ts already made.

type TimelineRow = typeof schema.storyTimelines.$inferSelect;
type PinRow = typeof schema.storyTimelinePins.$inferSelect;
type MembershipRow = typeof schema.storyTimelineMemberships.$inferSelect;

const rowToMembership = (row: MembershipRow): TimelineMembership => ({
    id: row.id,
    timelineId: row.timelineId,
    pinId: row.pinId,
    laneId: row.laneId ?? null,
    createdAt: row.createdAt as unknown as Date
});

const rowToTimeline = (row: TimelineRow): StoryTimeline => ({
    id: row.id,
    storyId: row.storyId,
    title: row.title,
    isDefault: Boolean(row.isDefault),
    orientation: (row.orientation as StoryTimeline["orientation"]) ?? "horizontal",
    swimlanesEnabled: Boolean(row.swimlanesEnabled),
    storyStartMode: (row.storyStartMode as StoryTimeline["storyStartMode"]) ?? "chapter_one",
    storyStartChapterId: row.storyStartChapterId ?? null,
    storyStartPinId: row.storyStartPinId ?? null,
    storyStartManualWhenJson: (row.storyStartManualWhenJson as PinWhen | null) ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date
});

const rowToPin = (row: PinRow, memberships: TimelineMembership[]): TimelinePin => ({
    id: row.id,
    storyId: row.storyId,
    title: row.title,
    blurb: row.blurb ?? null,
    whenKind: (row.whenKind as TimelinePin["whenKind"]) ?? "fuzzy",
    relativeOffsetYears: row.relativeOffsetYears ?? null,
    fuzzyPhrase: row.fuzzyPhrase ?? null,
    civilDate: row.civilDate ?? null,
    manualOrder: row.manualOrder,
    linkType: (row.linkType as PinLinkType | null) ?? null,
    linkId: row.linkId ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date,
    memberships
});

// Lazy get-or-create (deliberate deviation from the design doc's literal "spine created with
// story" — hooking story creation alone would leave every pre-existing story with zero timelines;
// this covers new and pre-existing stories with one code path, see DECISIONS.md). Pre-fills
// storyStartChapterId with the lowest-`order` chapter if one exists at creation time, satisfying
// decision #11's "Default/preferred: anchor to Chapter One" while staying manually overridable.
export const ensureSpineTimeline = async (storyId: string): Promise<StoryTimeline> => {
    const [existing] = await db
        .select()
        .from(schema.storyTimelines)
        .where(and(eq(schema.storyTimelines.storyId, storyId), eq(schema.storyTimelines.isDefault, true)));
    if (existing) return rowToTimeline(existing);

    const [firstChapter] = await db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.storyId, storyId))
        .orderBy(asc(schema.chapters.order))
        .limit(1);

    const now = new Date();
    const [row] = await db
        .insert(schema.storyTimelines)
        .values({
            id: randomUUID(),
            storyId,
            title: "Spine",
            isDefault: true,
            orientation: "horizontal",
            swimlanesEnabled: false,
            storyStartMode: "chapter_one",
            storyStartChapterId: firstChapter?.id ?? null,
            storyStartPinId: null,
            storyStartManualWhenJson: null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToTimeline(row);
};

export const listTimelinesForStory = async (storyId: string): Promise<StoryTimeline[]> => {
    await ensureSpineTimeline(storyId);
    const rows = await db.select().from(schema.storyTimelines).where(eq(schema.storyTimelines.storyId, storyId));
    return rows.map(rowToTimeline);
};

// TL5 — named timelines, board-first create (the switcher's "New timeline" action). Never
// isDefault — only ensureSpineTimeline ever creates the one true spine row.
export const createTimeline = async (storyId: string, title: string): Promise<StoryTimeline> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.storyTimelines)
        .values({
            id: randomUUID(),
            storyId,
            title,
            isDefault: false,
            orientation: "horizontal",
            swimlanesEnabled: false,
            storyStartMode: "chapter_one",
            storyStartChapterId: null,
            storyStartPinId: null,
            storyStartManualWhenJson: null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToTimeline(row);
};

export type UpdateTimelineInput = Partial<
    Pick<
        StoryTimeline,
        "title" | "orientation" | "swimlanesEnabled" | "storyStartMode" | "storyStartChapterId" | "storyStartPinId" | "storyStartManualWhenJson"
    >
>;

export const updateTimeline = async (id: string, input: UpdateTimelineInput): Promise<StoryTimeline> => {
    const [row] = await db
        .update(schema.storyTimelines)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.storyTimelines.id, id))
        .returning();
    if (!row) throw new Error(`Timeline not found: ${id}`);
    return rowToTimeline(row);
};

// TL5 — deletes a named timeline. Blocks deleting the spine (a story must always keep one
// guaranteed board). Before deleting, any pin whose ONLY membership is this timeline gets a Spine
// membership added first — guarantees a pin can never become orphaned/unreachable by a timeline
// delete (same "preserve, don't destroy" doctrine as unlinkMapsForLocation/unlinkPinsForSource).
export const deleteTimeline = async (id: string): Promise<void> => {
    const [timeline] = await db.select().from(schema.storyTimelines).where(eq(schema.storyTimelines.id, id));
    if (!timeline) throw new Error(`Timeline not found: ${id}`);
    if (timeline.isDefault) throw new Error("Cannot delete the spine timeline");

    const memberships = await db.select().from(schema.storyTimelineMemberships).where(eq(schema.storyTimelineMemberships.timelineId, id));
    if (memberships.length > 0) {
        const spine = await ensureSpineTimeline(timeline.storyId);
        for (const membership of memberships) {
            const otherMemberships = await db
                .select()
                .from(schema.storyTimelineMemberships)
                .where(eq(schema.storyTimelineMemberships.pinId, membership.pinId));
            const wouldBeOrphaned = otherMemberships.every(m => m.timelineId === id);
            if (wouldBeOrphaned) await addMembership(membership.pinId, spine.id);
        }
    }

    await db.delete(schema.storyTimelines).where(eq(schema.storyTimelines.id, id));
};

export const listPinsForStory = async (storyId: string): Promise<TimelinePin[]> => {
    const pinRows = await db.select().from(schema.storyTimelinePins).where(eq(schema.storyTimelinePins.storyId, storyId));
    if (pinRows.length === 0) return [];

    // Memberships fetched via one join across the whole story rather than per-pin — pin counts per
    // story are small, no pagination/N+1 concern.
    const allMemberships = await db
        .select({ membership: schema.storyTimelineMemberships })
        .from(schema.storyTimelineMemberships)
        .innerJoin(schema.storyTimelinePins, eq(schema.storyTimelineMemberships.pinId, schema.storyTimelinePins.id))
        .where(eq(schema.storyTimelinePins.storyId, storyId));

    const membershipsByPin = new Map<string, TimelineMembership[]>();
    for (const { membership } of allMemberships) {
        const list = membershipsByPin.get(membership.pinId) ?? [];
        list.push(rowToMembership(membership));
        membershipsByPin.set(membership.pinId, list);
    }

    return pinRows.map(row => rowToPin(row, membershipsByPin.get(row.id) ?? []));
};

export type CreatePinInput = {
    storyId: string;
    title: string;
    blurb?: string | null;
    whenKind: TimelinePin["whenKind"];
    relativeOffsetYears?: number | null;
    fuzzyPhrase?: string | null;
    civilDate?: string | null;
    linkType?: PinLinkType | null;
    linkId?: string | null;
    // Defaults to the story's spine timeline if omitted.
    timelineId?: string;
};

export const createPin = async (input: CreatePinInput): Promise<TimelinePin> => {
    const existingPins = await db.select().from(schema.storyTimelinePins).where(eq(schema.storyTimelinePins.storyId, input.storyId));
    const maxOrder = existingPins.reduce((max, r) => Math.max(max, r.manualOrder), 0);

    const now = new Date();
    const [row] = await db
        .insert(schema.storyTimelinePins)
        .values({
            id: randomUUID(),
            storyId: input.storyId,
            title: input.title,
            blurb: input.blurb ?? null,
            whenKind: input.whenKind,
            relativeOffsetYears: input.relativeOffsetYears ?? null,
            fuzzyPhrase: input.fuzzyPhrase ?? null,
            civilDate: input.civilDate ?? null,
            manualOrder: maxOrder + 1,
            linkType: input.linkType ?? null,
            linkId: input.linkId ?? null,
            createdAt: now,
            updatedAt: now
        })
        .returning();

    const timelineId = input.timelineId ?? (await ensureSpineTimeline(input.storyId)).id;
    const [membershipRow] = await db
        .insert(schema.storyTimelineMemberships)
        .values({ id: randomUUID(), timelineId, pinId: row.id, laneId: null, createdAt: now })
        .returning();

    return rowToPin(row, [rowToMembership(membershipRow)]);
};

export type UpdatePinInput = Partial<
    Pick<TimelinePin, "title" | "blurb" | "whenKind" | "relativeOffsetYears" | "fuzzyPhrase" | "civilDate" | "manualOrder">
>;

export const updatePin = async (id: string, input: UpdatePinInput): Promise<TimelinePin> => {
    const [row] = await db
        .update(schema.storyTimelinePins)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.storyTimelinePins.id, id))
        .returning();
    if (!row) throw new Error(`Timeline pin not found: ${id}`);

    const memberships = await db.select().from(schema.storyTimelineMemberships).where(eq(schema.storyTimelineMemberships.pinId, id));
    return rowToPin(row, memberships.map(rowToMembership));
};

export const deletePin = async (id: string): Promise<void> => {
    await db.delete(schema.storyTimelinePins).where(eq(schema.storyTimelinePins.id, id));
};

// TL5 — multi-timeline membership (design decision #7: "one pin SoT, multi-timeline membership").
// Idempotent-ish: if the pin is already a member, returns the existing row rather than erroring
// (the unique index on (timelineId, pinId) would otherwise throw on a double-click / re-add).
export const addMembership = async (pinId: string, timelineId: string, laneId?: string | null): Promise<TimelineMembership> => {
    const [existing] = await db
        .select()
        .from(schema.storyTimelineMemberships)
        .where(and(eq(schema.storyTimelineMemberships.timelineId, timelineId), eq(schema.storyTimelineMemberships.pinId, pinId)));
    if (existing) {
        if (laneId === undefined) return rowToMembership(existing);
        const [updated] = await db
            .update(schema.storyTimelineMemberships)
            .set({ laneId })
            .where(eq(schema.storyTimelineMemberships.id, existing.id))
            .returning();
        return rowToMembership(updated);
    }

    const [row] = await db
        .insert(schema.storyTimelineMemberships)
        .values({ id: randomUUID(), timelineId, pinId, laneId: laneId ?? null, createdAt: new Date() })
        .returning();
    return rowToMembership(row);
};

// Blocks removing a pin's LAST remaining membership — a pin with zero memberships would still
// exist as a DB row but be unreachable from any board (TL0-TL4/TL5 has no story-wide "all pins"
// browse view). Deleting the pin itself (deletePin) is the correct action for that case instead.
export const removeMembership = async (pinId: string, timelineId: string): Promise<void> => {
    const allMemberships = await db.select().from(schema.storyTimelineMemberships).where(eq(schema.storyTimelineMemberships.pinId, pinId));
    if (allMemberships.length <= 1) throw new Error("A pin must stay on at least one timeline — delete the pin instead");

    await db
        .delete(schema.storyTimelineMemberships)
        .where(and(eq(schema.storyTimelineMemberships.timelineId, timelineId), eq(schema.storyTimelineMemberships.pinId, pinId)));
};

// "Place on timeline" (TL3) — a pin already exists for this exact link, used by
// PlaceOnTimelineButton.tsx to switch between "Place on timeline" (create) and "Edit placement".
export const getPinForLink = async (storyId: string, linkType: PinLinkType, linkId: string): Promise<TimelinePin | null> => {
    const [row] = await db
        .select()
        .from(schema.storyTimelinePins)
        .where(
            and(
                eq(schema.storyTimelinePins.storyId, storyId),
                eq(schema.storyTimelinePins.linkType, linkType),
                eq(schema.storyTimelinePins.linkId, linkId)
            )
        );
    if (!row) return null;
    const memberships = await db.select().from(schema.storyTimelineMemberships).where(eq(schema.storyTimelineMemberships.pinId, row.id));
    return rowToPin(row, memberships.map(rowToMembership));
};

// Unlink-don't-destroy on source delete (same posture as storyMapsService.unlinkMapsForLocation) —
// a pin whose chapter/lorebook/note link gets deleted keeps its placement, just loses the deep
// link, rather than the writer's chronology work vanishing because a source got cleaned up.
export const unlinkPinsForSource = async (linkType: PinLinkType, linkId: string): Promise<number> => {
    const rows = await db
        .update(schema.storyTimelinePins)
        .set({ linkType: null, linkId: null, updatedAt: new Date() })
        .where(and(eq(schema.storyTimelinePins.linkType, linkType), eq(schema.storyTimelinePins.linkId, linkId)))
        .returning({ id: schema.storyTimelinePins.id });
    return rows.length;
};
