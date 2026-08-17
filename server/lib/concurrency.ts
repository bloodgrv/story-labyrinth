// Small helper for running AI batch/job work with bounded parallelism instead of one call at a
// time — see docs/CURRENT_BACKLOG.md's "P1.1 — Soft concurrency for non-overlapping jobs" note
// (this addresses the same underlying problem but scoped to WITHIN a single job's own per-item
// loop, not across different jobs — jobRunner.ts's one-job-at-a-time global scheduling is
// untouched and stays a separate, deliberate architectural decision).
//
// Default of 4 matches LM Studio's own default concurrent-request slot count, so a local-routed
// batch job (RAG Scanner's per-chapter loop, AI Review Deep mode's per-chapter map stage) can
// actually use them instead of serializing through one slot while three sit idle. Cloud providers
// benefit too, just less dramatically (their own rate limits are the real ceiling there).
//
// Processes `items` in fixed-size BATCHES (Promise.all per batch, batches run one after another),
// not a rolling pool — chosen deliberately for callers whose progress/resume tracking assumes
// "the first N items are durably complete" (ragScanner.ts's/ragScanJobs.ts's per-chapter scan
// resume, B4 in DECISIONS.md): progress only ever advances at a batch boundary, once every item
// in that batch has settled, so a crash mid-batch never leaves a non-contiguous set of "done"
// items for the resume slice (`chapterIds.slice(alreadyProcessed)`) to misinterpret.
export const DEFAULT_AI_CONCURRENCY = 4;

export const chunk = <T>(items: T[], size: number): T[][] => {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
    return batches;
};
