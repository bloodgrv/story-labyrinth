import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema, sqlite } from "../db/client.js";
import type { AgentJob, AgentJobProgress, AgentJobStatus, AgentJobType } from "../../src/types/agentJob.js";

// This repository is a hybrid, same reasoning as ragRepository.ts's split from
// ragScanRepository.ts: most operations are plain Drizzle (async, matches every other
// repository in this codebase), but the two operations that need true atomicity — enqueue's
// dedup-check-then-insert, and claimNextQueuedJob's claim — go through raw synchronous
// better-sqlite3 so nothing else in this single-threaded process can interleave between the
// check and the write. All exports stay domain-typed (AgentJob, real Dates, parsed JSON)
// regardless of which access path produced the row — row->domain mapping stays private here.

// ── Row -> domain mapping ────────────────────────────────────────────────────────

// For rows returned by Drizzle (db.select/insert/update...returning): timestamp/json columns
// are already converted to real Date objects / parsed JSON by the driver, same as
// ragScanRepository.ts's rowToScan/rowToIssue — only casts are needed here.
const rowToJob = (row: typeof schema.agentJobs.$inferSelect): AgentJob => ({
    id: row.id,
    jobType: row.jobType as AgentJobType,
    status: row.status as AgentJobStatus,
    storyId: row.storyId ?? null,
    entityId: row.entityId ?? null,
    payload: row.payload ?? null,
    result: row.result ?? null,
    progress: (row.progress as AgentJobProgress | null) ?? null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    error: row.error ?? null,
    createdAt: row.createdAt as unknown as Date,
    queuedAt: row.queuedAt as unknown as Date,
    startedAt: (row.startedAt as unknown as Date | null) ?? null,
    completedAt: (row.completedAt as unknown as Date | null) ?? null,
    lastAttemptAt: (row.lastAttemptAt as unknown as Date | null) ?? null
});

// For rows returned by raw better-sqlite3 (RETURNING * / SELECT *): columns are the raw SQLite
// types (epoch-ms integers, JSON text) since nothing here goes through Drizzle's mode
// conversions — this mapper does that conversion by hand.
type RawJobRow = {
    id: string;
    jobType: string;
    status: string;
    storyId: string | null;
    entityId: string | null;
    payload: string | null;
    result: string | null;
    progress: string | null;
    attempts: number;
    maxAttempts: number;
    error: string | null;
    createdAt: number;
    queuedAt: number;
    startedAt: number | null;
    completedAt: number | null;
    lastAttemptAt: number | null;
};

const parseJsonColumn = (value: string | null): unknown => (value === null ? null : JSON.parse(value));

// Drizzle's `mode: "timestamp"` columns store epoch SECONDS, not milliseconds
// (mapToDriverValue does `Math.floor(date.getTime() / 1000)`, mapFromDriverValue does
// `new Date(value * 1000)` — confirmed in drizzle-orm/sqlite-core/columns/integer). Raw SQL
// bypasses that conversion entirely, so every raw write/read here must do it by hand or a
// raw-written row silently reads back as a wildly wrong date via any Drizzle-based query.
const toEpochSeconds = (): number => Math.floor(Date.now() / 1000);
const fromEpochSeconds = (value: number): Date => new Date(value * 1000);

const rawRowToJob = (row: RawJobRow): AgentJob => ({
    id: row.id,
    jobType: row.jobType as AgentJobType,
    status: row.status as AgentJobStatus,
    storyId: row.storyId,
    entityId: row.entityId,
    payload: parseJsonColumn(row.payload),
    result: parseJsonColumn(row.result),
    progress: parseJsonColumn(row.progress) as AgentJobProgress | null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    error: row.error,
    createdAt: fromEpochSeconds(row.createdAt),
    queuedAt: fromEpochSeconds(row.queuedAt),
    startedAt: row.startedAt === null ? null : fromEpochSeconds(row.startedAt),
    completedAt: row.completedAt === null ? null : fromEpochSeconds(row.completedAt),
    lastAttemptAt: row.lastAttemptAt === null ? null : fromEpochSeconds(row.lastAttemptAt)
});

// Nulls compare as a single sentinel so dedup/active-lookup treats "no story"/"no entity" as
// one consistent key, without denormalizing the actually-stored (real NULL) columns.
const NONE_SENTINEL = "__none__";

// ── Raw-SQL (atomic) operations ──────────────────────────────────────────────────

// True if an active (queued|running) job already exists for this (jobType, storyId, entityId)
// key. Shared by enqueue's dedup check and jobRunner's schedule tick ("no active row for that
// key" — design doc §3.5).
export const hasActiveJob = (jobType: AgentJobType, storyId: string | null, entityId: string | null): boolean => {
    const row = sqlite
        .prepare(
            `SELECT 1 FROM agentJobs
             WHERE jobType = ?
               AND status IN ('queued', 'running')
               AND COALESCE(storyId, ?) = COALESCE(?, ?)
               AND COALESCE(entityId, ?) = COALESCE(?, ?)
             LIMIT 1`
        )
        .get(jobType, NONE_SENTINEL, storyId, NONE_SENTINEL, NONE_SENTINEL, entityId, NONE_SENTINEL);
    return row !== undefined;
};

export type EnqueueParams = {
    jobType: AgentJobType;
    storyId?: string | null;
    entityId?: string | null;
    payload?: unknown;
    maxAttempts?: number;
};

// Enqueue a new job, or no-op (return the existing active row) if one already exists for the
// same (jobType, storyId, entityId) key — design doc §3.3. The existence check + insert happen
// inside one sqlite.transaction() so it's atomic even when called from several sites (event
// hooks, the schedule tick, the manual POST route) in quick succession.
export const enqueue = (params: EnqueueParams): { job: AgentJob; deduped: boolean } => {
    const storyId = params.storyId ?? null;
    const entityId = params.entityId ?? null;

    const findActive = sqlite.prepare(
        `SELECT * FROM agentJobs
         WHERE jobType = ?
           AND status IN ('queued', 'running')
           AND COALESCE(storyId, ?) = COALESCE(?, ?)
           AND COALESCE(entityId, ?) = COALESCE(?, ?)
         LIMIT 1`
    );

    const insert = sqlite.prepare(
        `INSERT INTO agentJobs
            (id, jobType, status, storyId, entityId, payload, result, progress, attempts, maxAttempts, error, createdAt, queuedAt, startedAt, completedAt, lastAttemptAt)
         VALUES
            (@id, @jobType, 'queued', @storyId, @entityId, @payload, NULL, NULL, 0, @maxAttempts, NULL, @now, @now, NULL, NULL, NULL)
         RETURNING *`
    );

    const tx = sqlite.transaction((): { job: RawJobRow; deduped: boolean } => {
        const existing = findActive.get(params.jobType, NONE_SENTINEL, storyId, NONE_SENTINEL, NONE_SENTINEL, entityId, NONE_SENTINEL) as
            | RawJobRow
            | undefined;
        if (existing) return { job: existing, deduped: true };

        const created = insert.get({
            id: randomUUID(),
            jobType: params.jobType,
            storyId,
            entityId,
            payload: params.payload === undefined ? null : JSON.stringify(params.payload),
            maxAttempts: params.maxAttempts ?? 3,
            now: toEpochSeconds()
        }) as RawJobRow;
        return { job: created, deduped: false };
    });

    const { job, deduped } = tx();
    return { job: rawRowToJob(job), deduped };
};

// Atomically claim the oldest queued job (of a type not already running, per `excludeJobTypes`)
// and flip it to 'running', incrementing attempts — one synchronous SQLite statement (subquery
// selects the row, outer UPDATE claims it), so no other JS in this process can observe or mutate
// the row in between (design doc §3.2). Returns null if no eligible queued job exists.
//
// P1.1 (docs/CURRENT_BACKLOG.md) — `excludeJobTypes` is jobRunner.ts's soft-concurrency guard:
// a second job may now claim and run while another is still in flight, as long as it's a
// different jobType. Same-jobType jobs still never overlap (the exclusion list always includes
// every currently-running type), so the SQLite write-contention rationale for staying serial
// within one job type (design doc §3.3) still holds — this only relaxes the "one job, period"
// rule across unrelated job types.
export const claimNextQueuedJob = (excludeJobTypes: AgentJobType[] = []): AgentJob | null => {
    const exclusionClause = excludeJobTypes.length > 0 ? `AND jobType NOT IN (${excludeJobTypes.map(() => "?").join(", ")})` : "";
    const now = toEpochSeconds();
    const row = sqlite
        .prepare(
            `UPDATE agentJobs
             SET status = 'running', attempts = attempts + 1, startedAt = ?, lastAttemptAt = ?
             WHERE id = (
                 SELECT id FROM agentJobs
                 WHERE status = 'queued' ${exclusionClause}
                 ORDER BY queuedAt ASC LIMIT 1
             )
             RETURNING *`
        )
        .get(now, now, ...excludeJobTypes) as RawJobRow | undefined;
    return row ? rawRowToJob(row) : null;
};

// ── Drizzle operations ────────────────────────────────────────────────────────────

export const completeJob = async (jobId: string, result?: unknown): Promise<AgentJob> => {
    const [row] = await db
        .update(schema.agentJobs)
        .set({ status: "completed", result: result ?? null, completedAt: new Date(), error: null })
        .where(eq(schema.agentJobs.id, jobId))
        .returning();
    return rowToJob(row);
};

// Records a handler failure for a job already claimed (attempts already incremented by
// claimNextQueuedJob). If attempts remain, requeues for the next tick; otherwise the job is
// permanently failed. Same maxAttempts logic recoverCrashedJobs uses, so the in-process-failure
// and crash-recovery paths agree on when a job is truly done retrying.
export const recordJobFailure = async (jobId: string, errorMessage: string): Promise<AgentJob> => {
    const [existing] = await db.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, jobId));
    const exhausted = existing.attempts >= existing.maxAttempts;

    const [row] = await db
        .update(schema.agentJobs)
        .set({
            status: exhausted ? "failed" : "queued",
            error: errorMessage,
            completedAt: exhausted ? new Date() : null
        })
        .where(eq(schema.agentJobs.id, jobId))
        .returning();
    return rowToJob(row);
};

export const updateJobProgress = async (jobId: string, progress: AgentJobProgress): Promise<void> => {
    await db.update(schema.agentJobs).set({ progress }).where(eq(schema.agentJobs.id, jobId));
};

export const getJob = async (jobId: string): Promise<AgentJob | null> => {
    const [row] = await db.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, jobId));
    return row ? rowToJob(row) : null;
};

export type ListJobsParams = {
    storyId?: string;
    status?: AgentJobStatus;
    jobType?: AgentJobType;
    limit?: number;
};

export const listJobs = async (params: ListJobsParams): Promise<AgentJob[]> => {
    const conditions = [];
    if (params.storyId) conditions.push(eq(schema.agentJobs.storyId, params.storyId));
    if (params.status) conditions.push(eq(schema.agentJobs.status, params.status));
    if (params.jobType) conditions.push(eq(schema.agentJobs.jobType, params.jobType));

    const rows = await db
        .select()
        .from(schema.agentJobs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.agentJobs.createdAt))
        .limit(Math.min(params.limit ?? 50, 200));

    return rows.map(rowToJob);
};

// User retry API (design doc §3.2): only valid from 'failed'. Resets attempts so it gets a full
// new set of retries, clears the error, and re-enters the queue/dedup surface cleanly. Returns
// null if the job doesn't exist or isn't currently 'failed' (route maps that to 400/404).
export const retryJob = async (jobId: string): Promise<AgentJob | null> => {
    const [existing] = await db.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, jobId));
    if (!existing || existing.status !== "failed") return null;

    const [row] = await db
        .update(schema.agentJobs)
        .set({ status: "queued", attempts: 0, error: null, queuedAt: new Date(), completedAt: null })
        .where(eq(schema.agentJobs.id, jobId))
        .returning();
    return rowToJob(row);
};

// Crash recovery — call once at boot, before the runner starts ticking (design doc §3.2). Any
// row left 'running' means the process died mid-job (the old fire-and-forget scanStory IIFE
// this table replaces had no way to recover from this at all). Requeue if attempts remain,
// otherwise mark failed with a distinct error so it reads differently from a normal handler
// failure in the UI/logs.
export const recoverCrashedJobs = async (): Promise<{ requeued: number; failed: number }> => {
    const stuck = await db.select().from(schema.agentJobs).where(eq(schema.agentJobs.status, "running"));
    if (stuck.length === 0) return { requeued: 0, failed: 0 };

    const requeueIds = stuck.filter(row => row.attempts < row.maxAttempts).map(row => row.id);
    const failIds = stuck.filter(row => row.attempts >= row.maxAttempts).map(row => row.id);

    if (requeueIds.length)
        await db
            .update(schema.agentJobs)
            .set({ status: "queued", error: "Interrupted by server restart; requeued." })
            .where(inArray(schema.agentJobs.id, requeueIds));

    if (failIds.length)
        await db
            .update(schema.agentJobs)
            .set({
                status: "failed",
                error: "Exceeded maxAttempts after crash/restart",
                completedAt: new Date()
            })
            .where(inArray(schema.agentJobs.id, failIds));

    return { requeued: requeueIds.length, failed: failIds.length };
};

// Drives the schedule tick's cadence check (design doc §3.5): "last successful completion older
// than cadence AND no active row for that key -> enqueue". storyId can genuinely be NULL
// (global jobs) — Drizzle's eq() with a JS null generates `= NULL`, which never matches in SQL,
// so that case uses isNull() instead.
export const getLastCompletedAt = async (jobType: AgentJobType, storyId: string | null): Promise<Date | null> => {
    const [row] = await db
        .select({ completedAt: schema.agentJobs.completedAt })
        .from(schema.agentJobs)
        .where(
            and(
                eq(schema.agentJobs.jobType, jobType),
                eq(schema.agentJobs.status, "completed"),
                storyId === null ? isNull(schema.agentJobs.storyId) : eq(schema.agentJobs.storyId, storyId)
            )
        )
        .orderBy(desc(schema.agentJobs.completedAt))
        .limit(1);

    return row?.completedAt ?? null;
};

export type { AgentJob, AgentJobProgress, AgentJobStatus, AgentJobType };
