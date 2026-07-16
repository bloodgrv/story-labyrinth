import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { agentJobsApi } from "@/services/api/client";
import type { AgentJobStatus } from "@/types/agentJob";

type RecentJobsParams = { storyId?: string; limit?: number };

export const agentJobsKeys = {
    all: ["agentJobs"] as const,
    list: (params?: RecentJobsParams) => [...agentJobsKeys.all, "list", params ?? {}] as const
};

const ACTIVE_STATUSES: AgentJobStatus[] = ["queued", "running"];

// First refetchInterval usage in this codebase — scoped to this one query, function-form so it
// self-disables (returns false) once nothing is queued/running, rather than polling forever.
export const useRecentJobsQuery = (params?: RecentJobsParams) =>
    useQuery({
        queryKey: agentJobsKeys.list(params),
        queryFn: () => agentJobsApi.list(params),
        refetchInterval: query => {
            const jobs = query.state.data?.jobs ?? [];
            return jobs.some(job => ACTIVE_STATUSES.includes(job.status)) ? 5000 : false;
        }
    });

export const useRetryJobMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => agentJobsApi.retry(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agentJobsKeys.all });
            toast.success("Job requeued");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to retry job")
    });
};
