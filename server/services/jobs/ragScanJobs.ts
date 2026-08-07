import type { AgentJob } from "../../../src/types/agentJob.js";
import { updateJobProgress } from "../agentJobsRepository.js";
import { completeScan, createScan, failScan, getScan, updateScanProgress } from "../ragScanRepository.js";
import { listOrderedChapterIds, requireScannerConnection, runChapterScan, scanChapter } from "../ragScanner.js";

// Dual-write adapter (design doc §3.1's recommended short-term migration path): ragScans/
// ragScanIssues stay the single source of truth for scan progress/issues (zero change to
// ragScanRepository.ts, zero risk to the existing GET /api/rag/scan/:scanId polling contract).
// agentJobs becomes a second, thinner wrapper row for scans launched through the runner, whose
// result references the underlying ragScans.id.

// C3 (docs/CURRENT_BACKLOG.md P0.3) — per-scan opt-in, read from the job's own payload rather
// than a story-wide setting, so arming it for one scan never silently changes another.
const readIncludeMemory = (job: AgentJob): boolean =>
    (job.payload as { includeMemory?: boolean } | null)?.includeMemory === true;

// TL11A — same per-scan opt-in shape as includeMemory.
const readIncludeTimeline = (job: AgentJob): boolean =>
    (job.payload as { includeTimeline?: boolean } | null)?.includeTimeline === true;

export const runRagScanChapterJob = async (job: AgentJob): Promise<{ scanId: string; issueCount: number }> => {
    if (!job.entityId) throw new Error("rag_scan_chapter job requires entityId (chapterId)");

    const { scan, issues } = await scanChapter(job.entityId, readIncludeMemory(job), readIncludeTimeline(job));
    return { scanId: scan.id, issueCount: issues.length };
};

// Reimplements scanStory's loop without the fire-and-forget IIFE — the job runner itself is
// what awaits this now, so a process crash mid-loop is tracked via the agentJobs row (and
// requeued by recoverCrashedJobs, attempts permitting) instead of dying silently.
//
// B4 (docs/CURRENT_BACKLOG.md P2) — a requeued attempt resumes rather than restarting from
// chapter 0: job.progress.scanId (recorded before the loop even starts, not just after each
// chapter — see below) points at the same ragScans row the crashed attempt was writing to, and
// job.progress.processed says how many of listOrderedChapterIds it already got through. Falls
// back to a fresh scan if that scanId is missing or its row isn't still "running" (corrupt/stale
// progress, or a genuinely first attempt), so this can't wedge the job.
export const runRagScanStoryJob = async (
    job: AgentJob
): Promise<{ scanId: string; totalChapters: number; processedChapters: number }> => {
    if (!job.storyId) throw new Error("rag_scan_story job requires storyId");
    const storyId = job.storyId;
    const includeMemory = readIncludeMemory(job);
    const includeTimeline = readIncludeTimeline(job);

    const { client, model } = await requireScannerConnection();
    const chapterIds = await listOrderedChapterIds(storyId);

    const priorProgress = job.progress;
    const resumeScan = priorProgress?.scanId ? await getScan(priorProgress.scanId) : null;
    const resuming = resumeScan !== null && resumeScan.status === "running";

    const scan = resuming
        ? resumeScan
        : await createScan({ storyId, scope: "story", chapterId: null, totalChapters: chapterIds.length });
    const alreadyProcessed = resuming && priorProgress ? Math.min(priorProgress.processed, chapterIds.length) : 0;
    const remainingChapterIds = chapterIds.slice(alreadyProcessed);

    // Written before the loop starts so a crash on the very first (resumed or fresh) chapter
    // still leaves job.progress.scanId pointing at this scan — the next requeue resumes into the
    // same row instead of creating yet another one.
    await updateJobProgress(job.id, {
        processed: alreadyProcessed,
        total: chapterIds.length,
        message: `Scanned ${alreadyProcessed}/${chapterIds.length} chapters`,
        scanId: scan.id
    });

    try {
        for (const [offset, chapterId] of remainingChapterIds.entries()) {
            try {
                await runChapterScan({ scanId: scan.id, storyId, chapterId, client, model, includeMemory, includeTimeline });
            } catch (error) {
                console.error(`rag_scan_story job: chapter ${chapterId} failed:`, (error as Error).message);
            }

            const processed = alreadyProcessed + offset + 1;
            await updateScanProgress(scan.id, processed); // existing ragScans write
            await updateJobProgress(job.id, {
                processed,
                total: chapterIds.length,
                message: `Scanned ${processed}/${chapterIds.length} chapters`,
                scanId: scan.id
            }); // new agentJobs write — the "dual write"
        }
        await completeScan(scan.id, { model, processedChapters: chapterIds.length });
        return { scanId: scan.id, totalChapters: chapterIds.length, processedChapters: chapterIds.length };
    } catch (error) {
        await failScan(scan.id, (error as Error).message);
        throw error; // jobRunner's own recordJobFailure/retry bookkeeping takes over from here
    }
};
