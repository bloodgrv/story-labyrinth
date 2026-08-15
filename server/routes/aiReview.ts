import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import type { AiReviewFindingStatus, AiReviewTag } from "../../src/types/aiReview.js";
import { getFindingsForStory, updateFindingStatus } from "../services/aiReviewRepository.js";

const router = express.Router();

const FINDING_STATUSES: AiReviewFindingStatus[] = ["open", "dismissed", "resolved"];
const FINDING_TAGS: AiReviewTag[] = ["dev", "continuity", "voice", "line"];

// GET /api/ai-review/findings/story/:storyId?status=&tag=&chapterId= — list findings across all
// review runs for a story. Triggering a review itself goes through the generic agent job queue
// (POST /api/agent/jobs, jobType: "ai_review_quick", owner-gated) — same posture as RAG Scanner,
// see useRagScanQuery.ts. This route only serves the durable findings list + status updates.
router.get("/findings/story/:storyId", async (req, res) => {
    const { status, tag, chapterId } = req.query as Record<string, string | undefined>;

    if (status && !FINDING_STATUSES.includes(status as AiReviewFindingStatus)) {
        res.status(400).json({ error: `status must be one of: ${FINDING_STATUSES.join(", ")}` });
        return;
    }
    if (tag && !FINDING_TAGS.includes(tag as AiReviewTag)) {
        res.status(400).json({ error: `tag must be one of: ${FINDING_TAGS.join(", ")}` });
        return;
    }

    const [error, findings] = await attemptPromise(() =>
        getFindingsForStory(req.params.storyId, {
            status: status as AiReviewFindingStatus | undefined,
            tag: tag as AiReviewTag | undefined,
            chapterId
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to load findings", details: error.message });
        return;
    }
    res.json({ findings });
});

// PATCH /api/ai-review/findings/:findingId — triage a finding (dismiss/resolve/reopen).
// Non-destructive — findings are never deleted, only their status changes.
router.patch("/findings/:findingId", async (req, res) => {
    const { status } = req.body as { status?: unknown };
    if (status !== "open" && status !== "dismissed" && status !== "resolved") {
        res.status(400).json({ error: "status must be 'open', 'dismissed', or 'resolved'" });
        return;
    }

    const [error, finding] = await attemptPromise(() => updateFindingStatus(req.params.findingId, status));
    if (error) {
        res.status(500).json({ error: "Failed to update finding", details: error.message });
        return;
    }
    if (!finding) {
        res.status(404).json({ error: "Finding not found" });
        return;
    }
    res.json(finding);
});

export default router;
