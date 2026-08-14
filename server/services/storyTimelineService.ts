import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type {
    PinLinkType,
    PinWhen,
    StoryTimeline,
    TimelineMembership,
    TimelinePin,
    TimelineSuggestSettings
} from "../../src/types/storyTimeline.js";
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
    status: (row.status as TimelinePin["status"]) ?? "active",
    source: (row.source as TimelinePin["source"]) ?? "user",
    manuscriptStatus: (row.manuscriptStatus as TimelinePin["manuscriptStatus"]) ?? "planned",
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

// Active pins only — mirrors storyGraphService's listActiveEdgesForStory. Pending AI-suggested
// pins (TL11B) never appear on a board or in chronology context until approved via the Pending
// tab; use listPendingPinsForStory for that review surface instead.
export const listPinsForStory = async (storyId: string): Promise<TimelinePin[]> => {
    const pinRows = await db
        .select()
        .from(schema.storyTimelinePins)
        .where(and(eq(schema.storyTimelinePins.storyId, storyId), eq(schema.storyTimelinePins.status, "active")));
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
    // Defaults to "planned" at the DB level; callers that genuinely know better (PinFormDialog's
    // own chapter-link default) pass it explicitly.
    manuscriptStatus?: TimelinePin["manuscriptStatus"];
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
            manuscriptStatus: input.manuscriptStatus ?? "planned",
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

// TL11B — pending pin review, mirrors storyGraphService.ts's listPendingEdges/approveEdge/
// rejectEdge exactly. Only timelineSuggestPinsJob.ts writes "pending" rows; everything else
// (manual create, TL7's chat fence, Place-on-timeline) writes "active" directly via createPin.

export const listPendingPinsForStory = async (storyId: string): Promise<TimelinePin[]> => {
    const pinRows = await db
        .select()
        .from(schema.storyTimelinePins)
        .where(and(eq(schema.storyTimelinePins.storyId, storyId), eq(schema.storyTimelinePins.status, "pending")));
    if (pinRows.length === 0) return [];
    return pinRows.map(row => rowToPin(row, []));
};

export type ProposeAiSuggestedPinInput = CreatePinInput;

// Always onto Spine (createPin's own default when timelineId is omitted) — an AI-suggested pin
// has no natural "which named timeline" signal, same posture as TL7's chat-proposed pins.
//
// `linkType`/`linkId` pass through from `CreatePinInput` (previously hardcoded to null here) so
// T5 FS5's sheet-sync-proposed pins can link back to their source lorebook entry — unlike
// `timelineSuggestPinsJob.ts`'s own bulk-suggest pins, which read lorebook entries/notes only as
// inspiration and stay freestanding. Every other caller keeps getting null exactly as before.
export const proposeAiSuggestedPin = async (input: ProposeAiSuggestedPinInput): Promise<TimelinePin> => {
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
            status: "pending",
            source: "ai_suggested",
            manuscriptStatus: input.manuscriptStatus ?? "planned",
            createdAt: now,
            updatedAt: now
        })
        .returning();

    const spine = await ensureSpineTimeline(input.storyId);
    const [membershipRow] = await db
        .insert(schema.storyTimelineMemberships)
        .values({ id: randomUUID(), timelineId: spine.id, pinId: row.id, laneId: null, createdAt: now })
        .returning();

    return rowToPin(row, [rowToMembership(membershipRow)]);
};

// T5 FS5 — re-sync idempotency: before proposing another pending pin from the same entry's Lore
// Sheet, check whether one already exists (pending review, or already approved/active) so
// clicking Sync repeatedly doesn't spam duplicate pins. Mirrors the shape of listPinsForStory/
// listPendingPinsForStory above but filtered by link instead of status.
export const findPinsByLink = async (storyId: string, linkType: PinLinkType, linkId: string): Promise<TimelinePin[]> => {
    const rows = await db
        .select()
        .from(schema.storyTimelinePins)
        .where(
            and(
                eq(schema.storyTimelinePins.storyId, storyId),
                eq(schema.storyTimelinePins.linkType, linkType),
                eq(schema.storyTimelinePins.linkId, linkId)
            )
        );
    return rows.filter(row => row.status !== "rejected").map(row => rowToPin(row, []));
};

export const approvePin = async (id: string): Promise<TimelinePin> => {
    const [existing] = await db.select().from(schema.storyTimelinePins).where(eq(schema.storyTimelinePins.id, id));
    if (!existing) throw new Error(`Timeline pin not found: ${id}`);
    if (existing.status !== "pending") throw new Error(`Pin is not pending (status: ${existing.status})`);

    const [row] = await db
        .update(schema.storyTimelinePins)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(schema.storyTimelinePins.id, id))
        .returning();
    const memberships = await db.select().from(schema.storyTimelineMemberships).where(eq(schema.storyTimelineMemberships.pinId, id));
    return rowToPin(row, memberships.map(rowToMembership));
};

export const rejectPin = async (id: string): Promise<TimelinePin> => {
    const [existing] = await db.select().from(schema.storyTimelinePins).where(eq(schema.storyTimelinePins.id, id));
    if (!existing) throw new Error(`Timeline pin not found: ${id}`);
    if (existing.status !== "pending") throw new Error(`Pin is not pending (status: ${existing.status})`);

    const [row] = await db
        .update(schema.storyTimelinePins)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(schema.storyTimelinePins.id, id))
        .returning();
    return rowToPin(row, []);
};

export type UpdatePinInput = Partial<
    Pick<
        TimelinePin,
        "title" | "blurb" | "whenKind" | "relativeOffsetYears" | "fuzzyPhrase" | "civilDate" | "manualOrder" | "manuscriptStatus"
    >
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

export type ChronologyExcerpt = { id: string; title: string; blurb: string | null; when: string };

// Spine-only, compact chronology excerpt — "when" is a resolved display label (mirrors
// PinCard.tsx's own whenLabel), tier-sorted civil -> relative -> fuzzy (mirrors
// src/features/story-timeline/lib/sortPins.ts's pipeline). Shared by TL8's opt-in chat context
// (chatContextService.ts) and TL11A's scanner chronology-aware check (ragScanner.ts) — originally
// duplicated directly in chatContextService.ts as a small, deliberately-not-imported server-owned
// copy (see DECISIONS.md's TL7-TL8 entry); extracted here once a second consumer needed the exact
// same logic, since "keep two consumers in sync by hand" stopped being the simpler option.
export const getSpineChronologyExcerpt = async (storyId: string): Promise<ChronologyExcerpt[]> => {
    const spine = await ensureSpineTimeline(storyId);
    const allPins = await listPinsForStory(storyId);
    const pins = allPins.filter(pin => pin.memberships.some(m => m.timelineId === spine.id));

    const tier = (pin: (typeof pins)[number]) => (pin.civilDate ? 0 : pin.relativeOffsetYears != null ? 1 : 2);
    const sorted = [...pins].sort((a, b) => {
        const tierDiff = tier(a) - tier(b);
        if (tierDiff !== 0) return tierDiff;
        if (tier(a) === 0) return (a.civilDate ?? "").localeCompare(b.civilDate ?? "");
        if (tier(a) === 1) return (a.relativeOffsetYears ?? 0) - (b.relativeOffsetYears ?? 0);
        return a.manualOrder - b.manualOrder;
    });

    const whenLabel = (pin: (typeof pins)[number]): string => {
        if (pin.civilDate) return pin.civilDate;
        if (pin.relativeOffsetYears != null) {
            if (pin.relativeOffsetYears === 0) return "Story-start";
            const years = Math.abs(pin.relativeOffsetYears);
            return `${years}y ${pin.relativeOffsetYears < 0 ? "before" : "after"} start`;
        }
        if (pin.fuzzyPhrase) return pin.fuzzyPhrase;
        return "Unordered";
    };

    return sorted.map(pin => ({ id: pin.id, title: pin.title, blurb: pin.blurb, when: whenLabel(pin) }));
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

// ── Suggest-pins context settings ─────────────────────────────────────────────
// What timeline_suggest_pins draws from (TL13, docs/Story_Timeline_Design.md) — a story-side
// panel lets a writer scope the job down to the Notes/Lorebook-category/synopsis mix they
// actually want it reading, rather than always sweeping everything visible. Same lazy
// get-or-create shape as ensureSpineTimeline: a story with no row yet just gets the defaults.

type SuggestSettingsRow = typeof schema.storyTimelineSuggestSettings.$inferSelect;

const rowToSuggestSettings = (row: SuggestSettingsRow): TimelineSuggestSettings => ({
    storyId: row.storyId,
    includeSynopsis: Boolean(row.includeSynopsis),
    includeNotes: Boolean(row.includeNotes),
    includeCategories: (row.includeCategoriesJson as string[] | null) ?? null,
    includeChapterSummaryIds: (row.includeChapterSummaryIdsJson as string[] | null) ?? [],
    includeChapterContentIds: (row.includeChapterContentIdsJson as string[] | null) ?? []
});

export const getTimelineSuggestSettings = async (storyId: string): Promise<TimelineSuggestSettings> => {
    const [existing] = await db
        .select()
        .from(schema.storyTimelineSuggestSettings)
        .where(eq(schema.storyTimelineSuggestSettings.storyId, storyId));
    if (existing) return rowToSuggestSettings(existing);

    const now = new Date();
    const [row] = await db
        .insert(schema.storyTimelineSuggestSettings)
        .values({
            id: randomUUID(),
            storyId,
            includeSynopsis: true,
            includeNotes: true,
            includeCategoriesJson: null,
            includeChapterSummaryIdsJson: [],
            includeChapterContentIdsJson: [],
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToSuggestSettings(row);
};

export type UpdateTimelineSuggestSettingsInput = Partial<
    Pick<
        TimelineSuggestSettings,
        "includeSynopsis" | "includeNotes" | "includeCategories" | "includeChapterSummaryIds" | "includeChapterContentIds"
    >
>;

export const updateTimelineSuggestSettings = async (
    storyId: string,
    input: UpdateTimelineSuggestSettingsInput
): Promise<TimelineSuggestSettings> => {
    await getTimelineSuggestSettings(storyId); // ensures the row exists before the update below
    const [row] = await db
        .update(schema.storyTimelineSuggestSettings)
        .set({
            ...(input.includeSynopsis !== undefined ? { includeSynopsis: input.includeSynopsis } : {}),
            ...(input.includeNotes !== undefined ? { includeNotes: input.includeNotes } : {}),
            ...(input.includeCategories !== undefined ? { includeCategoriesJson: input.includeCategories } : {}),
            ...(input.includeChapterSummaryIds !== undefined ? { includeChapterSummaryIdsJson: input.includeChapterSummaryIds } : {}),
            ...(input.includeChapterContentIds !== undefined ? { includeChapterContentIdsJson: input.includeChapterContentIds } : {}),
            updatedAt: new Date()
        })
        .where(eq(schema.storyTimelineSuggestSettings.storyId, storyId))
        .returning();
    return rowToSuggestSettings(row);
};
