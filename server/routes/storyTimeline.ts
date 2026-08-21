import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import { z } from "zod";
import {
    addMembership,
    approvePin,
    createPin,
    createTimeline,
    getPinForLink,
    getTimelineSuggestSettings,
    listPendingPinsForStory,
    listPinsForStory,
    listTimelinesForStory,
    rejectPin,
    removeMembership,
    softDeletePin,
    softDeleteTimeline,
    updatePin,
    updateTimeline,
    updateTimelineSuggestSettings
} from "../services/storyTimelineService.js";

// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — in-world chronology board,
// mounted at bare /api same as storyMaps.ts/storyGraph.ts: story-scoped list (timelines/pins),
// flat id-addressed mutate (timeline/pin id is a global UUID). Editor-level auth (requireAuth +
// blockViewerMutations, already applied globally in server/index.ts) — matches storyMaps.ts's
// posture, no requireOwner.
const router = express.Router();

// B39 extension (docs/CURRENT_BACKLOG.md P2 residual) — this route is the real write path for
// the WB timeline template's `timeline-pin-proposal` fence (TL7, single item and Accept All),
// as well as manual pin creation from the board UI. Previously each field was pulled off
// `req.body` individually with an ad hoc `as` cast and no runtime type check on most of
// them (e.g. `relativeOffsetYears as number | null` accepted whatever the client sent, including
// a string, straight into the DB) — same "AI fence trust = client-parse -> API body" gap B39
// closed for the codex-proposal route. `.strict()` so an unexpected field is a clean 400.
const timelinePinCreateBodySchema = z
    .object({
        title: z.string().min(1),
        blurb: z.string().nullable().optional(),
        whenKind: z.enum(["relative", "fuzzy", "civil"]),
        relativeOffsetYears: z.number().nullable().optional(),
        fuzzyPhrase: z.string().nullable().optional(),
        civilDate: z.string().nullable().optional(),
        linkType: z.enum(["chapter", "lorebook", "note"]).nullable().optional(),
        linkId: z.string().nullable().optional(),
        timelineId: z.string().optional(),
        manuscriptStatus: z.enum(["planned", "written"]).optional()
    })
    .strict();
const timelinePinUpdateBodySchema = z
    .object({
        title: z.string().min(1).optional(),
        blurb: z.string().nullable().optional(),
        whenKind: z.enum(["relative", "fuzzy", "civil"]).optional(),
        relativeOffsetYears: z.number().nullable().optional(),
        fuzzyPhrase: z.string().nullable().optional(),
        civilDate: z.string().nullable().optional(),
        manualOrder: z.number().optional(),
        manuscriptStatus: z.enum(["planned", "written"]).optional()
    })
    .strict();

router.get("/stories/:storyId/timelines", async (req, res) => {
    const [error, result] = await attemptPromise(() => listTimelinesForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load timelines", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/stories/:storyId/timelines", async (req, res) => {
    const { title } = req.body as { title?: unknown };
    if (typeof title !== "string" || !title.trim()) {
        res.status(400).json({ error: "title is required" });
        return;
    }
    const [error, result] = await attemptPromise(() => createTimeline(req.params.storyId, title.trim()));
    if (error) {
        res.status(400).json({ error: "Failed to create timeline", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.patch("/timelines/:id", async (req, res) => {
    const { title, orientation, swimlanesEnabled, storyStartMode, storyStartChapterId, storyStartPinId, storyStartManualWhenJson } =
        req.body as Record<string, unknown>;
    const [error, result] = await attemptPromise(() =>
        updateTimeline(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            orientation: orientation as "horizontal" | "vertical" | undefined,
            swimlanesEnabled: typeof swimlanesEnabled === "boolean" ? swimlanesEnabled : undefined,
            storyStartMode: storyStartMode as "chapter_one" | "manual_pin" | "manual_time" | undefined,
            storyStartChapterId: storyStartChapterId === undefined ? undefined : (storyStartChapterId as string | null),
            storyStartPinId: storyStartPinId === undefined ? undefined : (storyStartPinId as string | null),
            storyStartManualWhenJson: storyStartManualWhenJson === undefined ? undefined : (storyStartManualWhenJson as never)
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update timeline", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/timelines/:id", async (req, res) => {
    const [error] = await attemptPromise(() => softDeleteTimeline(req.params.id));
    if (error) {
        res.status(400).json({ error: "Failed to delete timeline", details: error.message });
        return;
    }
    res.json({ success: true });
});

router.get("/stories/:storyId/timeline-pins", async (req, res) => {
    const [error, result] = await attemptPromise(() => listPinsForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load timeline pins", details: error.message });
        return;
    }
    res.json(result);
});

// TL11B — pending review, mirrors storyGraph.ts's own pending/approve/reject routes.
router.get("/stories/:storyId/timeline-pins/pending", async (req, res) => {
    const [error, result] = await attemptPromise(() => listPendingPinsForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load pending timeline pins", details: error.message });
        return;
    }
    res.json({ pending: result });
});

router.post("/timeline-pins/:id/approve", async (req, res) => {
    const [error, result] = await attemptPromise(() => approvePin(req.params.id));
    if (error) {
        res.status(400).json({ error: "Failed to approve timeline pin", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/timeline-pins/:id/reject", async (req, res) => {
    const [error, result] = await attemptPromise(() => rejectPin(req.params.id));
    if (error) {
        res.status(400).json({ error: "Failed to reject timeline pin", details: error.message });
        return;
    }
    res.json(result);
});

router.get("/stories/:storyId/timeline-pins/by-link/:linkType/:linkId", async (req, res) => {
    const linkType = req.params.linkType as "chapter" | "lorebook" | "note";
    const [error, result] = await attemptPromise(() => getPinForLink(req.params.storyId, linkType, req.params.linkId));
    if (error) {
        res.status(500).json({ error: "Failed to load timeline pin", details: error.message });
        return;
    }
    res.json(result);
});

router.post("/stories/:storyId/timeline-pins", async (req, res) => {
    const parsed = timelinePinCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid timeline pin payload", details: parsed.error.issues });
        return;
    }
    const { title, blurb, whenKind, relativeOffsetYears, fuzzyPhrase, civilDate, linkType, linkId, timelineId, manuscriptStatus } =
        parsed.data;

    const [error, result] = await attemptPromise(() =>
        createPin({
            storyId: req.params.storyId,
            title,
            blurb: blurb ?? null,
            whenKind,
            relativeOffsetYears: relativeOffsetYears ?? null,
            fuzzyPhrase: fuzzyPhrase ?? null,
            civilDate: civilDate ?? null,
            linkType: linkType ?? null,
            linkId: linkId ?? null,
            timelineId,
            manuscriptStatus
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to create timeline pin", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.patch("/timeline-pins/:id", async (req, res) => {
    const parsed = timelinePinUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid timeline pin payload", details: parsed.error.issues });
        return;
    }
    const { title, blurb, whenKind, relativeOffsetYears, fuzzyPhrase, civilDate, manualOrder, manuscriptStatus } = parsed.data;
    const [error, result] = await attemptPromise(() =>
        updatePin(req.params.id, { title, blurb, whenKind, relativeOffsetYears, fuzzyPhrase, civilDate, manualOrder, manuscriptStatus })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update timeline pin", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/timeline-pins/:id", async (req, res) => {
    const [error] = await attemptPromise(() => softDeletePin(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete timeline pin", details: error.message });
        return;
    }
    res.json({ success: true });
});

// TL5 — multi-timeline membership. POST is also how PinMembershipPopover.tsx updates a pin's
// laneId for an already-active timeline (addMembership is idempotent on the unique pair).
router.post("/timeline-pins/:id/memberships", async (req, res) => {
    const { timelineId, laneId } = req.body as { timelineId?: unknown; laneId?: unknown };
    if (typeof timelineId !== "string" || !timelineId) {
        res.status(400).json({ error: "timelineId is required" });
        return;
    }
    const [error, result] = await attemptPromise(() =>
        addMembership(req.params.id, timelineId, laneId === undefined ? undefined : (laneId as string | null))
    );
    if (error) {
        res.status(400).json({ error: "Failed to add timeline membership", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.delete("/timeline-pins/:id/memberships/:timelineId", async (req, res) => {
    const [error] = await attemptPromise(() => removeMembership(req.params.id, req.params.timelineId));
    if (error) {
        res.status(400).json({ error: "Failed to remove timeline membership", details: error.message });
        return;
    }
    res.json({ success: true });
});

// TL13 — story-side context controls for timeline_suggest_pins (docs/Story_Timeline_Design.md).
// GET is get-or-create (mirrors ensureSpineTimeline's lazy pattern), so a story with no row yet
// still returns the defaults rather than 404ing.
router.get("/stories/:storyId/timeline-suggest-settings", async (req, res) => {
    const [error, result] = await attemptPromise(() => getTimelineSuggestSettings(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load timeline suggest settings", details: error.message });
        return;
    }
    res.json(result);
});

router.patch("/stories/:storyId/timeline-suggest-settings", async (req, res) => {
    const { includeSynopsis, includeNotes, includeCategories, includeChapterSummaryIds, includeChapterContentIds } = req.body as Record<
        string,
        unknown
    >;
    const [error, result] = await attemptPromise(() =>
        updateTimelineSuggestSettings(req.params.storyId, {
            includeSynopsis: typeof includeSynopsis === "boolean" ? includeSynopsis : undefined,
            includeNotes: typeof includeNotes === "boolean" ? includeNotes : undefined,
            includeCategories: includeCategories === undefined ? undefined : (includeCategories as string[] | null),
            includeChapterSummaryIds: Array.isArray(includeChapterSummaryIds) ? (includeChapterSummaryIds as string[]) : undefined,
            includeChapterContentIds: Array.isArray(includeChapterContentIds) ? (includeChapterContentIds as string[]) : undefined
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update timeline suggest settings", details: error.message });
        return;
    }
    res.json(result);
});

export default router;
