import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { agentJobsApi, storyGraphApi } from "@/services/api/client";

export const storyGraphKeys = {
    all: ["storyGraph"] as const,
    graph: (storyId: string) => [...storyGraphKeys.all, "graph", storyId] as const,
    neighborhood: (storyId: string, entryId: string, depth: 1 | 2) =>
        [...storyGraphKeys.all, "neighborhood", storyId, entryId, depth] as const,
    pending: (storyId: string) => [...storyGraphKeys.all, "pending", storyId] as const,
    layout: (storyId: string) => [...storyGraphKeys.all, "layout", storyId] as const
};

export const useStoryGraphQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyGraphKeys.graph(storyId ?? ""),
        queryFn: () => storyGraphApi.get(storyId as string),
        enabled: !!storyId
    });

export const useNeighborhoodQuery = (storyId: string | null, entryId: string | null, depth: 1 | 2) =>
    useQuery({
        queryKey: storyGraphKeys.neighborhood(storyId ?? "", entryId ?? "", depth),
        queryFn: () => storyGraphApi.getNeighborhood(storyId as string, entryId as string, depth),
        enabled: !!storyId && !!entryId
    });

export const usePendingEdgesQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyGraphKeys.pending(storyId ?? ""),
        queryFn: () => storyGraphApi.listPending(storyId as string),
        enabled: !!storyId
    });

// Broad invalidation (storyGraphKeys.all) rather than a targeted key — small dataset, and a
// mutation on one edge can affect an open neighborhood query centered on either endpoint.
const invalidateAndToast = (queryClient: ReturnType<typeof useQueryClient>, successMsg: string) => ({
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: storyGraphKeys.all });
        toast.success(successMsg);
    },
    onError: (error: Error) => toast.error(error.message || "Action failed")
});

export const useCreateEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            storyId,
            data
        }: {
            storyId: string;
            data: {
                fromId: string;
                toId: string;
                edgeType: string;
                label?: string | null;
                description?: string | null;
                asPending?: boolean;
            };
        }) => storyGraphApi.createEdge(storyId, data),
        ...invalidateAndToast(queryClient, "Edge created")
    });
};

export const useUpdateEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            data
        }: {
            id: string;
            data: { edgeType?: string; label?: string | null; description?: string | null };
        }) => storyGraphApi.updateEdge(id, data),
        ...invalidateAndToast(queryClient, "Edge updated")
    });
};

export const useDeleteEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyGraphApi.deleteEdge(id),
        ...invalidateAndToast(queryClient, "Edge deleted")
    });
};

export const useApproveEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyGraphApi.approveEdge(id),
        ...invalidateAndToast(queryClient, "Edge approved")
    });
};

export const useRejectEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyGraphApi.rejectEdge(id),
        ...invalidateAndToast(queryClient, "Edge rejected")
    });
};

// P1.2 G1.5+ — manually enqueues graph_suggest_edges for the whole story. Mirrors
// useCodexHistoryQuery.ts's useSuggestCodexUpdatesMutation: fire-and-forget enqueue, no job
// polling — the Pending tab's own query is what the user checks afterward.
export const useSuggestGraphEdgesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => agentJobsApi.enqueue({ jobType: "graph_suggest_edges", storyId }),
        onSuccess: job => {
            queryClient.invalidateQueries({ queryKey: storyGraphKeys.all });
            queryClient.invalidateQueries({ queryKey: ["agentJobs"] });
            toast.success(
                job.status === "running" || job.status === "queued"
                    ? "Suggesting relationships from this story's lorebook…"
                    : "A relationship-suggestion job for this story already ran"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue relationship suggestions")
    });
};

// P1.2 G1.5+ — persisted Full-graph node positions. See layout.ts/StoryGraphCanvas.tsx: ego view
// never reads/writes this (its BFS-ring layout is relative to whichever entry is centered, not a
// stable absolute position across different centers).
export const useGraphLayoutQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyGraphKeys.layout(storyId ?? ""),
        queryFn: () => storyGraphApi.getLayout(storyId as string),
        enabled: !!storyId
    });

// Fires on every node drag-stop — deliberately no toast (would be noise) and no broad
// storyGraph.all invalidation (would refetch/re-layout the graph query too, fighting the user's
// own drag). Only this story's layout query is invalidated.
export const useSaveLayoutPositionMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ nodeId, x, y }: { nodeId: string; x: number; y: number }) => storyGraphApi.saveLayoutPosition(storyId, nodeId, x, y),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyGraphKeys.layout(storyId) })
    });
};

export const useResetLayoutMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => storyGraphApi.resetLayout(storyId),
        onSuccess: (_, storyId) => {
            queryClient.invalidateQueries({ queryKey: storyGraphKeys.layout(storyId) });
            toast.success("Layout reset");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to reset layout")
    });
};

export const useMigrateFromMetadataMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => storyGraphApi.migrateFromMetadata(storyId),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: storyGraphKeys.all });
            toast.success(`Migrated ${result.migrated} relationship${result.migrated === 1 ? "" : "s"}`);
        },
        onError: (error: Error) => toast.error(error.message || "Migration failed")
    });
};
