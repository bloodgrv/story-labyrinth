import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { agentJobsApi, ragApi } from "@/services/api/client";
import type { AgentJobStatus } from "@/types/agentJob";
import type { RagIssueStatus } from "@/types/ragScan";

const ACTIVE_JOB_STATUSES: AgentJobStatus[] = ["queued", "running"];

export const ragScanKeys = {
    all: ["ragScans"] as const,
    scansForStory: (storyId: string) => [...ragScanKeys.all, "story", storyId] as const,
    issuesAll: ["ragScanIssues"] as const,
    // Prefix (no status) is what invalidation targets — React Query invalidates by array
    // prefix match, so invalidating this 3-element key also catches every status-suffixed
    // query key below it (open/dismissed/resolved/all) in one call.
    issuesForStoryPrefix: (storyId: string) => [...ragScanKeys.issuesAll, "story", storyId] as const,
    issuesForStory: (storyId: string, status?: RagIssueStatus) =>
        [...ragScanKeys.issuesForStoryPrefix(storyId), status ?? "all"] as const,
    job: (jobId: string) => ["agentJobs", "detail", jobId] as const
};

export const useStoryScansQuery = (storyId: string) =>
    useQuery({
        queryKey: ragScanKeys.scansForStory(storyId),
        queryFn: () => ragApi.listScansForStory(storyId),
        enabled: !!storyId
    });

export const useStoryIssuesQuery = (storyId: string, status?: RagIssueStatus) =>
    useQuery({
        queryKey: ragScanKeys.issuesForStory(storyId, status),
        queryFn: () => ragApi.listIssuesForStory(storyId, status),
        enabled: !!storyId
    });

// Polls one triggered scan job while it's queued/running, self-disabling once it settles —
// same refetchInterval pattern as useRecentJobsQuery (useAgentJobsQuery.ts), scoped to a single
// job id instead of a list.
export const useScanJobQuery = (jobId: string | null) =>
    useQuery({
        queryKey: jobId ? ragScanKeys.job(jobId) : ["agentJobs", "detail", "none"],
        queryFn: () => agentJobsApi.getById(jobId as string),
        enabled: !!jobId,
        refetchInterval: query => (query.state.data && ACTIVE_JOB_STATUSES.includes(query.state.data.status) ? 3000 : false)
    });

const invalidateStoryScanData = (queryClient: ReturnType<typeof useQueryClient>, storyId: string) => {
    queryClient.invalidateQueries({ queryKey: ragScanKeys.scansForStory(storyId) });
    queryClient.invalidateQueries({ queryKey: ragScanKeys.issuesForStoryPrefix(storyId) });
};

// Wraps useScanJobQuery with a one-shot refresh of scan history + issues once a triggered job
// settles (completed/failed) — the trigger mutations only invalidate at enqueue time, so
// without this the new ragScans row (written by the job handler well after the mutation
// resolves) wouldn't show up until some unrelated refetch happened to occur.
export const useScanJobWithInvalidation = (jobId: string | null, storyId: string) => {
    const queryClient = useQueryClient();
    const jobQuery = useScanJobQuery(jobId);
    const job = jobQuery.data;
    const lastInvalidatedJobId = useRef<string | null>(null);

    useEffect(() => {
        if (!job || ACTIVE_JOB_STATUSES.includes(job.status)) return;
        if (lastInvalidatedJobId.current === job.id) return;
        lastInvalidatedJobId.current = job.id;
        invalidateStoryScanData(queryClient, storyId);
    }, [job, queryClient, storyId]);

    return jobQuery;
};

// Triggering a scan always goes through the agent job queue (owner-only route, retry/progress
// tracking for free) — never the direct synchronous /api/rag/scan/* endpoints. See
// DECISIONS.md "RAG Scanner Frontend".
export const useTriggerChapterScanMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterId }: { storyId: string; chapterId: string }) =>
            agentJobsApi.enqueue({ jobType: "rag_scan_chapter", storyId, entityId: chapterId }),
        onSuccess: (job, { storyId }) => {
            invalidateStoryScanData(queryClient, storyId);
            toast.success(job.status === "running" ? "A scan for this chapter is already running" : "Chapter scan queued");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue chapter scan")
    });
};

export const useTriggerStoryScanMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => agentJobsApi.enqueue({ jobType: "rag_scan_story", storyId }),
        onSuccess: (job, storyId) => {
            invalidateStoryScanData(queryClient, storyId);
            toast.success(job.status === "running" ? "A story scan is already running" : "Story scan queued");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue story scan")
    });
};

export const useUpdateIssueStatusMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ issueId, status }: { issueId: string; status: RagIssueStatus }) => ragApi.updateIssueStatus(issueId, status),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ragScanKeys.issuesForStoryPrefix(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update issue")
    });
};
