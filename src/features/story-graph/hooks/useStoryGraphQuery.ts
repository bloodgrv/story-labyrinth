import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { storyGraphApi } from "@/services/api/client";

export const storyGraphKeys = {
    all: ["storyGraph"] as const,
    graph: (storyId: string) => [...storyGraphKeys.all, "graph", storyId] as const,
    neighborhood: (storyId: string, entryId: string, depth: 1 | 2) =>
        [...storyGraphKeys.all, "neighborhood", storyId, entryId, depth] as const
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
            data: { fromId: string; toId: string; edgeType: string; label?: string | null; description?: string | null };
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
