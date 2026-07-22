import { attemptPromise } from "@jfdi/attempt";
import express from "express";
import type { AgentJobStatus, AgentJobType } from "../../src/types/agentJob.js";
import { enqueue, getJob, listJobs, retryJob } from "../services/agentJobsRepository.js";

const router = express.Router();

const JOB_TYPES: AgentJobType[] = [
    "reconcile_index",
    "rag_scan_chapter",
    "rag_scan_story",
    "prune_history",
    "distill_memory",
    "suggest_codex_updates",
    "graph_suggest_edges"
];
const JOB_STATUSES: AgentJobStatus[] = ["queued", "running", "completed", "failed"];

// GET /api/agent/jobs?storyId=&status=&jobType=&limit= — recent jobs, most recent first.
router.get("/", async (req, res) => {
    const { storyId, status, jobType, limit } = req.query as Record<string, string | undefined>;

    if (status && !JOB_STATUSES.includes(status as AgentJobStatus)) {
        res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(", ")}` });
        return;
    }
    if (jobType && !JOB_TYPES.includes(jobType as AgentJobType)) {
        res.status(400).json({ error: `jobType must be one of: ${JOB_TYPES.join(", ")}` });
        return;
    }

    const [error, jobs] = await attemptPromise(() =>
        listJobs({
            storyId,
            status: status as AgentJobStatus | undefined,
            jobType: jobType as AgentJobType | undefined,
            limit: limit ? Number(limit) : undefined
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to load jobs", details: error.message });
        return;
    }
    res.json({ jobs });
});

// GET /api/agent/jobs/:id — a single job's status/progress/error/result.
router.get("/:id", async (req, res) => {
    const [error, job] = await attemptPromise(() => getJob(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to load job", details: error.message });
        return;
    }
    if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
    }
    res.json(job);
});

// POST /api/agent/jobs/:id/retry — requeue a failed job (attempts reset). 400 if the job isn't
// currently 'failed', 404 if it doesn't exist.
router.post("/:id/retry", async (req, res) => {
    const [findError, existing] = await attemptPromise(() => getJob(req.params.id));
    if (findError) {
        res.status(500).json({ error: "Failed to load job", details: findError.message });
        return;
    }
    if (!existing) {
        res.status(404).json({ error: "Job not found" });
        return;
    }
    if (existing.status !== "failed") {
        res.status(400).json({ error: "Only a failed job can be retried" });
        return;
    }

    const [error, job] = await attemptPromise(() => retryJob(req.params.id));
    if (error) {
        res.status(500).json({ error: "Failed to retry job", details: error.message });
        return;
    }
    res.json(job);
});

// POST /api/agent/jobs — manually enqueue a job. Body: { jobType, storyId?, entityId?, payload? }.
// This is intentionally the only way to create a rag_scan_story job in Phase A — the schedule
// tick never auto-enqueues one (see jobRunner.ts's "unattended scan policy: default OFF" note).
router.post("/", async (req, res) => {
    const { jobType, storyId, entityId, payload } = req.body as {
        jobType?: unknown;
        storyId?: unknown;
        entityId?: unknown;
        payload?: unknown;
    };

    if (typeof jobType !== "string" || !JOB_TYPES.includes(jobType as AgentJobType)) {
        res.status(400).json({ error: `jobType must be one of: ${JOB_TYPES.join(", ")}` });
        return;
    }

    const [error, result] = await attemptPromise(async () =>
        enqueue({
            jobType: jobType as AgentJobType,
            storyId: typeof storyId === "string" ? storyId : null,
            entityId: typeof entityId === "string" ? entityId : null,
            payload
        })
    );
    if (error) {
        res.status(500).json({ error: "Failed to enqueue job", details: error.message });
        return;
    }
    res.status(result.deduped ? 200 : 201).json(result.job);
});

export default router;
