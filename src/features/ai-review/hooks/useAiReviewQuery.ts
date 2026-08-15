import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { agentJobsApi, aiReviewApi } from "@/services/api/client";
import type { AgentJobStatus } from "@/types/agentJob";
import type { AiReviewFindingStatus, AiReviewTag } from "@/types/aiReview";

const ACTIVE_JOB_STATUSES: AgentJobStatus[] = ["queued", "running"];

export const aiReviewKeys = {
    all: ["aiReviewFindings"] as const,
    // Prefix (no filters) is what invalidation targets — same "invalidate the whole prefix" shape
    // as ragScanKeys.issuesForStoryPrefix.
    findingsForStoryPrefix: (storyId: string) => [...aiReviewKeys.all, "story", storyId] as const,
    findingsForStory: (storyId: string, filters?: { status?: AiReviewFindingStatus; tag?: AiReviewTag; chapterId?: string }) =>
        [...aiReviewKeys.findingsForStoryPrefix(storyId), filters?.status ?? "all", filters?.tag ?? "all", filters?.chapterId ?? "all"] as const,
    job: (jobId: string) => ["agentJobs", "detail", jobId] as const
};

export const useStoryFindingsQuery = (
    storyId: string,
    filters?: { status?: AiReviewFindingStatus; tag?: AiReviewTag; chapterId?: string }
) =>
    useQuery({
        queryKey: aiReviewKeys.findingsForStory(storyId, filters),
        queryFn: () => aiReviewApi.listFindingsForStory(storyId, filters),
        enabled: !!storyId
    });

// Polls one triggered review job while it's queued/running, self-disabling once it settles —
// same shape as rag-scanner's useScanJobQuery.
export const useReviewJobQuery = (jobId: string | null) =>
    useQuery({
        queryKey: jobId ? aiReviewKeys.job(jobId) : ["agentJobs", "detail", "none"],
        queryFn: () => agentJobsApi.getById(jobId as string),
        enabled: !!jobId,
        refetchInterval: query => (query.state.data && ACTIVE_JOB_STATUSES.includes(query.state.data.status) ? 3000 : false)
    });

// Wraps useReviewJobQuery with a one-shot refresh of the findings list once a triggered job
// settles — the trigger mutation only invalidates at enqueue time, and the aiReviewFindings rows
// are written by the job handler well after that, so without this they wouldn't show up until
// some unrelated refetch happened to occur (mirrors useScanJobWithInvalidation exactly).
export const useReviewJobWithInvalidation = (jobId: string | null, storyId: string) => {
    const queryClient = useQueryClient();
    const jobQuery = useReviewJobQuery(jobId);
    const job = jobQuery.data;
    const lastInvalidatedJobId = useRef<string | null>(null);

    useEffect(() => {
        if (!job || ACTIVE_JOB_STATUSES.includes(job.status)) return;
        if (lastInvalidatedJobId.current === job.id) return;
        lastInvalidatedJobId.current = job.id;
        queryClient.invalidateQueries({ queryKey: aiReviewKeys.findingsForStoryPrefix(storyId) });
    }, [job, queryClient, storyId]);

    return jobQuery;
};

// Triggering a review always goes through the agent job queue (owner-only route, retry/progress
// tracking for free) — never a direct synchronous endpoint. Same posture as RAG Scanner, see
// docs/AI_Review_Design.md's own "Manual trigger only. agentJobs" (lock #3).
export const useTriggerQuickReviewMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterIds }: { storyId: string; chapterIds: string[] }) =>
            agentJobsApi.enqueue({ jobType: "ai_review_quick", storyId, payload: { chapterIds } }),
        onSuccess: (job, { storyId }) => {
            queryClient.invalidateQueries({ queryKey: aiReviewKeys.findingsForStoryPrefix(storyId) });
            toast.success(job.status === "running" ? "A review is already running" : "Review queued");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue review")
    });
};

export const useUpdateFindingStatusMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ findingId, status }: { findingId: string; status: AiReviewFindingStatus }) =>
            aiReviewApi.updateFindingStatus(findingId, status),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: aiReviewKeys.findingsForStoryPrefix(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update finding")
    });
};
