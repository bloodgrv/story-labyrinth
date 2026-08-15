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
import { runAiReviewQuickJob } from "./jobs/aiReviewJobs.js";
import { runSuggestCodexUpdatesJob } from "./jobs/codexCompileJob.js";
import { runDistillMemoryJob } from "./jobs/distillMemoryJob.js";
import { runGraphSuggestEdgesJob } from "./jobs/graphSuggestEdgesJob.js";
import { runReconcileIndexJob } from "./jobs/reconcileIndexJob.js";
import { runPruneHistoryJob } from "./jobs/pruneHistoryJob.js";
import { runRagScanChapterJob, runRagScanStoryJob } from "./jobs/ragScanJobs.js";
import { runTimelineSuggestPinsJob } from "./jobs/timelineSuggestPinsJob.js";

// In-process job runner — no queue library, no worker_threads, no second process (single Docker
// container, single SQLite file; see docs/Agent_Framework_And_Project_Memory_Design.md §3.2/3.3).
// Strictly serial: at most one job runs at a time, enforced by the `tickRunning` re-entrancy
// guard below, so a slow job can't let a second tick claim + run concurrently (SQLite
// write-contention rationale, design doc §3.3).

const TICK_INTERVAL_MS = 3000; // claim + run
const SCHEDULE_INTERVAL_MS = 60_000; // enqueue due periodic jobs

const RECONCILE_INDEX_CADENCE_MS = 15 * 60_000; // per story, design doc §3.5 cadence table
const PRUNE_HISTORY_CADENCE_MS = 24 * 60 * 60_000; // global
// C4 (docs/CURRENT_BACKLOG.md P0.3) — fixed daily cadence for stories that have explicitly
// opted in via stories.unattendedScanEnabled (default false). No per-story interval setting —
// see that column's own schema.ts comment for why a single fixed cadence was chosen.
const UNATTENDED_SCAN_CADENCE_MS = 24 * 60 * 60_000;

type JobHandler = (job: AgentJob) => Promise<unknown>;

const HANDLERS: Record<AgentJobType, JobHandler> = {
    reconcile_index: runReconcileIndexJob,
    rag_scan_chapter: runRagScanChapterJob,
    rag_scan_story: runRagScanStoryJob,
    prune_history: runPruneHistoryJob,
    distill_memory: runDistillMemoryJob,
    suggest_codex_updates: runSuggestCodexUpdatesJob,
    graph_suggest_edges: runGraphSuggestEdgesJob,
    timeline_suggest_pins: runTimelineSuggestPinsJob,
    ai_review_quick: runAiReviewQuickJob
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
        const storyRows = await db
            .select({ id: schema.stories.id, unattendedScanEnabled: schema.stories.unattendedScanEnabled })
            .from(schema.stories);
        for (const { id: storyId } of storyRows) await maybeEnqueuePeriodic("reconcile_index", storyId, RECONCILE_INDEX_CADENCE_MS);

        await maybeEnqueuePeriodic("prune_history", null, PRUNE_HISTORY_CADENCE_MS);

        // C4 (docs/CURRENT_BACKLOG.md P0.3) — rag_scan_story is now auto-enqueued, but ONLY for
        // stories that explicitly opted in via unattendedScanEnabled (default false everywhere
        // else), keeping "unattended scan policy: default OFF" (design doc §3.4) true for every
        // story unless the user turns it on themselves. Opted-in stories get the same
        // maybeEnqueuePeriodic dedup/cadence treatment as reconcile_index above — enqueued with
        // no payload, i.e. includeMemory defaults false (C3 stays a manual per-scan opt-in, not
        // folded into this unattended path).
        for (const { id: storyId, unattendedScanEnabled } of storyRows)
            if (unattendedScanEnabled) await maybeEnqueuePeriodic("rag_scan_story", storyId, UNATTENDED_SCAN_CADENCE_MS);

        // distill_memory (Phase B) is excluded from the schedule tick — never auto-chained after
        // a scan completes either (see distillMemoryJob.ts's own comment). Manual
        // POST /api/agent/jobs only.
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
