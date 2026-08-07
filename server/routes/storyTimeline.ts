import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import {
    createPin,
    deletePin,
    getPinForLink,
    listPinsForStory,
    listTimelinesForStory,
    updatePin,
    updateTimeline
} from "../services/storyTimelineService.js";

// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — in-world chronology board,
// mounted at bare /api same as storyMaps.ts/storyGraph.ts: story-scoped list (timelines/pins),
// flat id-addressed mutate (timeline/pin id is a global UUID). Editor-level auth (requireAuth +
// blockViewerMutations, already applied globally in server/index.ts) — matches storyMaps.ts's
// posture, no requireOwner.
const router = express.Router();

router.get("/stories/:storyId/timelines", async (req, res) => {
    const [error, result] = await attemptPromise(() => listTimelinesForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load timelines", details: error.message });
        return;
    }
    res.json(result);
});

router.patch("/timelines/:id", async (req, res) => {
    const { title, orientation, storyStartMode, storyStartChapterId, storyStartPinId, storyStartManualWhenJson } = req.body as Record<
        string,
        unknown
    >;
    const [error, result] = await attemptPromise(() =>
        updateTimeline(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            orientation: orientation as "horizontal" | "vertical" | undefined,
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

router.get("/stories/:storyId/timeline-pins", async (req, res) => {
    const [error, result] = await attemptPromise(() => listPinsForStory(req.params.storyId));
    if (error) {
        res.status(500).json({ error: "Failed to load timeline pins", details: error.message });
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
    const { title, blurb, whenKind, relativeOffsetYears, fuzzyPhrase, civilDate, linkType, linkId, timelineId } = req.body as Record<
        string,
        unknown
    >;
    if (typeof title !== "string" || !title.trim()) {
        res.status(400).json({ error: "title is required" });
        return;
    }
    if (typeof whenKind !== "string" || !["relative", "fuzzy", "civil"].includes(whenKind)) {
        res.status(400).json({ error: "whenKind must be one of relative|fuzzy|civil" });
        return;
    }

    const [error, result] = await attemptPromise(() =>
        createPin({
            storyId: req.params.storyId,
            title,
            blurb: (blurb as string | null | undefined) ?? null,
            whenKind: whenKind as "relative" | "fuzzy" | "civil",
            relativeOffsetYears: (relativeOffsetYears as number | null | undefined) ?? null,
            fuzzyPhrase: (fuzzyPhrase as string | null | undefined) ?? null,
            civilDate: (civilDate as string | null | undefined) ?? null,
            linkType: (linkType as "chapter" | "lorebook" | "note" | null | undefined) ?? null,
            linkId: (linkId as string | null | undefined) ?? null,
            timelineId: timelineId as string | undefined
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to create timeline pin", details: error.message });
        return;
    }
    res.status(201).json(result);
});

router.patch("/timeline-pins/:id", async (req, res) => {
    const { title, blurb, whenKind, relativeOffsetYears, fuzzyPhrase, civilDate, manualOrder } = req.body as Record<string, unknown>;
    const [error, result] = await attemptPromise(() =>
        updatePin(req.params.id, {
            title: typeof title === "string" ? title : undefined,
            blurb: blurb === undefined ? undefined : (blurb as string | null),
            whenKind: whenKind as "relative" | "fuzzy" | "civil" | undefined,
            relativeOffsetYears: relativeOffsetYears === undefined ? undefined : (relativeOffsetYears as number | null),
            fuzzyPhrase: fuzzyPhrase === undefined ? undefined : (fuzzyPhrase as string | null),
            civilDate: civilDate === undefined ? undefined : (civilDate as string | null),
            manualOrder: typeof manualOrder === "number" ? manualOrder : undefined
        })
    );
    if (error) {
        res.status(400).json({ error: "Failed to update timeline pin", details: error.message });
        return;
    }
    res.json(result);
});

router.delete("/timeline-pins/:id", async (req, res) => {
    const [error] = await attemptPromise(() => deletePin(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to delete timeline pin", details: error.message });
        return;
    }
    res.json({ success: true });
});

export default router;
