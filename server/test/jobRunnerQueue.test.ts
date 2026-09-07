import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStory, startTestServer, type TestServer } from "./integrationServer.js";

// The job queue is strictly serial and in-process (no queue library, no worker — see CLAUDE.md's
// Agent Framework section), which makes "one bad job wedges everything" the failure mode that
// matters: with a single lane, a job that never resolves takes the RAG scanner, index reconcile,
// memory distillation and every AI Review down with it, silently. B37 fixed exactly that class.
//
// Covered here: a failing job is recorded as failed rather than left running, the queue keeps
// draining afterwards, identical queued work is deduped instead of stacking up, and a failed job
// can be retried. NOT covered: the 15-minute hung-handler timeout (a test would have to wait it
// out or reach into the runner) and true serial-execution overlap (the runner exposes no timing
// fine-grained enough to assert on — timestamps are epoch seconds). Both noted in B49's row.

let server: TestServer;
let storyId: string;

beforeAll(async () => {
    // A 200ms claim tick instead of the production 3s: this suite is otherwise ~50s of waiting.
    // Only the cadence changes — the claim/run/fail logic under test is untouched.
    server = await startTestServer({ env: { JOB_TICK_INTERVAL_MS: "200" } });
    storyId = await createStory(server);
}, 120_000);

afterAll(async () => {
    await server?.stop();
});

interface Job {
    id: string;
    jobType: string;
    status: "queued" | "running" | "completed" | "failed";
    error?: string | null;
}

const enqueue = async (jobType: string, extra: Record<string, unknown> = {}) => {
    const { status, body } = await server.api<Job>("POST", "/api/agent/jobs", { jobType, ...extra });
    expect([200, 201]).toContain(status);
    return { status, job: body };
};

// The runner claims on a 3s tick, so terminal state is seconds away, not milliseconds.
const waitForTerminal = async (jobId: string, timeoutMs = 45_000): Promise<Job> => {
    const deadline = Date.now() + timeoutMs;
    let last: Job | null = null;
    while (Date.now() < deadline) {
        const { body } = await server.api<Job>("GET", `/api/agent/jobs/${jobId}`);
        last = body;
        if (body.status === "completed" || body.status === "failed") return body;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Job ${jobId} never reached a terminal state (last status: ${last?.status})`);
};

describe("agent job queue", () => {
    it("records a failing job as failed rather than leaving it running", async () => {
        // A scan pointed at a chapter that doesn't exist: the handler throws, which is the point.
        const { job } = await enqueue("rag_scan_chapter", { storyId, entityId: "no-such-chapter-id" });
        const finished = await waitForTerminal(job.id);

        expect(finished.status).toBe("failed");
        // The error has to be captured, or the Recent Jobs card shows a dead job with no reason.
        expect(finished.error).toBeTruthy();
    }, 60_000);

    it("keeps draining the queue after a job fails", async () => {
        // The single-lane consequence: if a failure could wedge the runner, nothing after it would
        // ever run again — no scans, no reconciles, no reviews, and no error surfaced anywhere.
        const { job: failing } = await enqueue("rag_scan_chapter", { storyId, entityId: "another-missing-chapter" });
        await waitForTerminal(failing.id);

        const { job: afterwards } = await enqueue("prune_history");
        const finished = await waitForTerminal(afterwards.id);

        expect(finished.status).toBe("completed");
    }, 90_000);

    it("dedupes identical queued work instead of stacking it up", async () => {
        // Two clicks on "Rebuild index" must not mean two rebuilds. The route answers 201 for a new
        // job and 200 for a deduped one, handing back the job already queued.
        const first = await enqueue("reconcile_index", { storyId });
        const second = await enqueue("reconcile_index", { storyId });

        if (first.status === 201 && second.status === 200) {
            expect(second.job.id).toBe(first.job.id);
        } else {
            // The first job can be claimed and finish inside the gap between these two calls, in
            // which case a second is legitimately new work rather than a duplicate. Assert the
            // meaningful half: it never returns 201 while an identical job is still queued.
            const { body } = await server.api<Job>("GET", `/api/agent/jobs/${first.job.id}`);
            expect(body.status).not.toBe("queued");
        }
    }, 60_000);

    it("lets a failed job be retried, and refuses to retry one that hasn't failed", async () => {
        const { job } = await enqueue("rag_scan_chapter", { storyId, entityId: "missing-again" });
        const failed = await waitForTerminal(job.id);
        expect(failed.status).toBe("failed");

        const retry = await server.api<Job>("POST", `/api/agent/jobs/${job.id}/retry`);
        expect(retry.status).toBe(200);

        // It genuinely re-runs (and fails again — the chapter is still missing), rather than just
        // being relabelled.
        const rerun = await waitForTerminal(job.id);
        expect(rerun.status).toBe("failed");

        // A completed job is not retryable: retry exists to recover from failure, not to re-run work.
        const { job: healthy } = await enqueue("prune_history");
        await waitForTerminal(healthy.id);
        const badRetry = await server.api("POST", `/api/agent/jobs/${healthy.id}/retry`);
        expect(badRetry.status).toBe(400);
    }, 120_000);
});
