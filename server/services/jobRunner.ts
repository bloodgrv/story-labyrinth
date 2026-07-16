import { db, schema } from "../db/client.js";
import type { AgentJob, AgentJobType } from "../../src/types/agentJob.js";
import {
    claimNextQueuedJob,
    completeJob,
    enqueue,
    getLastCompletedAt,
    hasActiveJob,
    recordJobFailure,
    recoverCrashedJobs
} from "./agentJobsRepository.js";
import { runReconcileIndexJob } from "./jobs/reconcileIndexJob.js";
import { runPruneHistoryJob } from "./jobs/pruneHistoryJob.js";
import { runRagScanChapterJob, runRagScanStoryJob } from "./jobs/ragScanJobs.js";

// In-process job runner — no queue library, no worker_threads, no second process (single Docker
// container, single SQLite file; see docs/Agent_Framework_And_Project_Memory_Design.md §3.2/3.3).
// Strictly serial: at most one job runs at a time, enforced by the `tickRunning` re-entrancy
// guard below, so a slow job can't let a second tick claim + run concurrently (SQLite
// write-contention rationale, design doc §3.3).

const TICK_INTERVAL_MS = 3000; // claim + run
const SCHEDULE_INTERVAL_MS = 60_000; // enqueue due periodic jobs

const RECONCILE_INDEX_CADENCE_MS = 15 * 60_000; // per story, design doc §3.5 cadence table
const PRUNE_HISTORY_CADENCE_MS = 24 * 60 * 60_000; // global
// rag_scan_story has no cadence constant here — deliberately not auto-enqueued, see below.

type JobHandler = (job: AgentJob) => Promise<unknown>;

const HANDLERS: Record<AgentJobType, JobHandler> = {
    reconcile_index: runReconcileIndexJob,
    rag_scan_chapter: runRagScanChapterJob,
    rag_scan_story: runRagScanStoryJob,
    prune_history: runPruneHistoryJob
};

let claimIntervalId: NodeJS.Timeout | null = null;
let scheduleIntervalId: NodeJS.Timeout | null = null;
let tickRunning = false;
let currentJobId: string | null = null;

export const getCurrentJobId = (): string | null => currentJobId;

const runTick = async (): Promise<void> => {
    if (tickRunning) return; // strictly serial — a still-running job blocks the next claim
    tickRunning = true;
    try {
        const job = claimNextQueuedJob();
        if (!job) return;

        currentJobId = job.id;
        try {
            const handler = HANDLERS[job.jobType];
            const result = await handler(job);
            await completeJob(job.id, result);
        } catch (error) {
            console.error(`jobRunner: job ${job.id} (${job.jobType}) failed:`, (error as Error).message);
            await recordJobFailure(job.id, (error as Error).message);
        } finally {
            currentJobId = null;
        }
    } finally {
        tickRunning = false;
    }
};

// Enqueue a periodic job type/scope if it's not already active and its last successful
// completion is older than `cadenceMs` (design doc §3.5).
const maybeEnqueuePeriodic = async (jobType: AgentJobType, storyId: string | null, cadenceMs: number): Promise<void> => {
    if (hasActiveJob(jobType, storyId, null)) return;

    const lastCompletedAt = await getLastCompletedAt(jobType, storyId);
    const due = !lastCompletedAt || Date.now() - lastCompletedAt.getTime() >= cadenceMs;
    if (!due) return;

    enqueue({ jobType, storyId, entityId: null });
};

const runScheduleTick = async (): Promise<void> => {
    try {
        const storyRows = await db.select({ id: schema.stories.id }).from(schema.stories);
        for (const { id: storyId } of storyRows) await maybeEnqueuePeriodic("reconcile_index", storyId, RECONCILE_INDEX_CADENCE_MS);

        await maybeEnqueuePeriodic("prune_history", null, PRUNE_HISTORY_CADENCE_MS);

        // rag_scan_story is deliberately NOT auto-enqueued here. The design doc's "unattended
        // scan policy: default OFF" (§3.4) has no per-story opt-in setting yet, and adding one
        // is out of scope for Phase A — omitting it from the schedule tick makes "default OFF"
        // true by construction. The only way a scan job is created in Phase A is the manual
        // POST /api/agent/jobs route. See DECISIONS.md addendum for this call.
    } catch (error) {
        console.error("jobRunner: schedule tick failed:", (error as Error).message);
    }
};

// Idempotent — calling start() again while already running is a no-op.
export const start = async (): Promise<void> => {
    if (claimIntervalId || scheduleIntervalId) return;

    const recovery = await recoverCrashedJobs();
    if (recovery.requeued || recovery.failed)
        console.log(`jobRunner: crash recovery — requeued ${recovery.requeued}, permanently failed ${recovery.failed}`);

    claimIntervalId = setInterval(() => void runTick(), TICK_INTERVAL_MS);
    scheduleIntervalId = setInterval(() => void runScheduleTick(), SCHEDULE_INTERVAL_MS);

    console.log("jobRunner: started");
    void runScheduleTick(); // seed immediately rather than waiting a full SCHEDULE_INTERVAL_MS
};

// Clears both timers and waits briefly for any in-flight tick to finish so a job is never
// yanked mid-write. No SIGTERM/SIGINT handling existed anywhere in this codebase before this —
// see server/index.ts wiring.
export const stop = async (): Promise<void> => {
    if (claimIntervalId) clearInterval(claimIntervalId);
    if (scheduleIntervalId) clearInterval(scheduleIntervalId);
    claimIntervalId = null;
    scheduleIntervalId = null;

    const start = Date.now();
    while (tickRunning && Date.now() - start < 10_000) await new Promise(resolve => setTimeout(resolve, 100));
    console.log("jobRunner: stopped");
};
