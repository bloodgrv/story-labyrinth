import type { AgentJob } from "../../../src/types/agentJob.js";
import { updateJobProgress } from "../agentJobsRepository.js";
import { completeReview, createReview, failReview } from "../aiReviewRepository.js";
import { requireAiReviewConnection, runQuickReview } from "../aiReviewService.js";

// Quick mode is a single LLM pass over the whole selection (not a per-chapter loop like
// rag_scan_story), so there's no requeue-resume story here — job.progress.reviewId is recorded
// before the LLM call purely so a crashed attempt's aiReviews row is discoverable/inspectable,
// mirroring ragScanJobs.ts's scanId precedent, not because this job resumes mid-way.
export const runAiReviewQuickJob = async (job: AgentJob): Promise<{ reviewId: string; findingCount: number }> => {
    if (!job.storyId) throw new Error("ai_review_quick job requires storyId");
    const storyId = job.storyId;

    const chapterIds = (job.payload as { chapterIds?: string[] } | null)?.chapterIds ?? [];
    if (chapterIds.length === 0) throw new Error("ai_review_quick job requires payload.chapterIds");

    const { client, model } = await requireAiReviewConnection();
    const review = await createReview({ storyId, mode: "quick", chapterIds });

    await updateJobProgress(job.id, {
        processed: 0,
        total: 1,
        message: `Reviewing ${chapterIds.length} chapter(s)...`,
        reviewId: review.id
    });

    try {
        const findings = await runQuickReview({ reviewId: review.id, storyId, chapterIds, client, model });
        await completeReview(review.id, { model });
        await updateJobProgress(job.id, {
            processed: 1,
            total: 1,
            message: `Found ${findings.length} finding(s)`,
            reviewId: review.id
        });
        return { reviewId: review.id, findingCount: findings.length };
    } catch (error) {
        await failReview(review.id, (error as Error).message);
        throw error; // jobRunner's own recordJobFailure/retry bookkeeping takes over from here
    }
};
