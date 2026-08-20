import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { agentJobsApi, agentMemoriesApi } from "@/services/api/client";
import type { AgentMemoryCategory, AgentMemoryStatus } from "@/types/agentMemory";

type ProjectMemoryListParams = { storyId?: string; status?: AgentMemoryStatus; global?: boolean };

export const projectMemoryKeys = {
    all: ["agentMemories"] as const,
    list: (params?: ProjectMemoryListParams) => [...projectMemoryKeys.all, "list", params ?? {}] as const
};

// No refetchInterval — unlike agentJobs' queued/running states, memory rows never self-transition
// without an explicit user action, so there's nothing to poll for.
export const useProjectMemoriesQuery = (params?: ProjectMemoryListParams) =>
    useQuery({
        queryKey: projectMemoryKeys.list(params),
        queryFn: () => agentMemoriesApi.list(params)
    });

const invalidateAndToast = (queryClient: ReturnType<typeof useQueryClient>, successMsg: string) => ({
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: projectMemoryKeys.all });
        toast.success(successMsg);
    },
    onError: (error: Error) => toast.error(error.message || "Action failed")
});

export const useCreateMemoryNoteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: agentMemoriesApi.createNote, ...invalidateAndToast(queryClient, "Note added") });
};

export const useApproveMemoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => agentMemoriesApi.approve(id),
        ...invalidateAndToast(queryClient, "Memory approved")
    });
};

export const useRejectMemoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => agentMemoriesApi.reject(id),
        ...invalidateAndToast(queryClient, "Memory rejected")
    });
};

export const useReviseMemoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { title?: string; body?: string; category?: AgentMemoryCategory } }) =>
            agentMemoriesApi.revise(id, data),
        ...invalidateAndToast(queryClient, "Memory updated")
    });
};

export const useDeleteMemoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => agentMemoriesApi.delete(id),
        ...invalidateAndToast(queryClient, "Memory deleted")
    });
};

export const useSetMemoryPinnedMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => agentMemoriesApi.revise(id, { pinned }),
        ...invalidateAndToast(queryClient, "Pin updated")
    });
};

// Manually enqueues distill_writer_prefs (always global — no storyId). Mirrors
// useSuggestGraphEdgesMutation in useStoryGraphQuery.ts: fire-and-forget enqueue, no job polling —
// the Pending tab's own query is what the user checks afterward.
export const useSuggestWriterPrefsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => agentJobsApi.enqueue({ jobType: "distill_writer_prefs" }),
        onSuccess: job => {
            queryClient.invalidateQueries({ queryKey: projectMemoryKeys.all });
            queryClient.invalidateQueries({ queryKey: ["agentJobs"] });
            toast.success(
                job.status === "running" || job.status === "queued"
                    ? "Checking recent chat activity for writer preferences…"
                    : "A writer-preferences check already ran recently"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue writer-preferences check")
    });
};
