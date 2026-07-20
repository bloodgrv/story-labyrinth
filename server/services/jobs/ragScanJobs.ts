import type { AgentJob } from "../../../src/types/agentJob.js";
import { updateJobProgress } from "../agentJobsRepository.js";
import { completeScan, createScan, failScan, updateScanProgress } from "../ragScanRepository.js";
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

export const runRagScanChapterJob = async (job: AgentJob): Promise<{ scanId: string; issueCount: number }> => {
    if (!job.entityId) throw new Error("rag_scan_chapter job requires entityId (chapterId)");

    const { scan, issues } = await scanChapter(job.entityId, readIncludeMemory(job));
    return { scanId: scan.id, issueCount: issues.length };
};

// Reimplements scanStory's loop without the fire-and-forget IIFE — the job runner itself is
// what awaits this now, so a process crash mid-loop is tracked via the agentJobs row (and
// requeued by recoverCrashedJobs, attempts permitting) instead of dying silently. This is
// crash-visibility, not resumption: a requeued job restarts the story scan from chapter 0.
export const runRagScanStoryJob = async (
    job: AgentJob
): Promise<{ scanId: string; totalChapters: number; processedChapters: number }> => {
    if (!job.storyId) throw new Error("rag_scan_story job requires storyId");
    const storyId = job.storyId;
    const includeMemory = readIncludeMemory(job);

    const { client, model } = await requireScannerConnection();
    const chapterIds = await listOrderedChapterIds(storyId);
    const scan = await createScan({ storyId, scope: "story", chapterId: null, totalChapters: chapterIds.length });

    try {
        for (const [index, chapterId] of chapterIds.entries()) {
            try {
                await runChapterScan({ scanId: scan.id, storyId, chapterId, client, model, includeMemory });
            } catch (error) {
                console.error(`rag_scan_story job: chapter ${chapterId} failed:`, (error as Error).message);
            }

            const processed = index + 1;
            await updateScanProgress(scan.id, processed); // existing ragScans write
            await updateJobProgress(job.id, {
                processed,
                total: chapterIds.length,
                message: `Scanned ${processed}/${chapterIds.length} chapters`
            }); // new agentJobs write — the "dual write"
        }
        await completeScan(scan.id, { model, processedChapters: chapterIds.length });
        return { scanId: scan.id, totalChapters: chapterIds.length, processedChapters: chapterIds.length };
    } catch (error) {
        await failScan(scan.id, (error as Error).message);
        throw error; // jobRunner's own recordJobFailure/retry bookkeeping takes over from here
    }
};
