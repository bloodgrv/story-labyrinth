import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { storyMapApi } from "@/services/api/client";

export const storyMapKeys = {
    all: ["storyMap"] as const,
    map: (storyId: string) => [...storyMapKeys.all, "map", storyId] as const,
    layout: (storyId: string) => [...storyMapKeys.all, "layout", storyId] as const
};

export const useStoryMapQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyMapKeys.map(storyId ?? ""),
        queryFn: () => storyMapApi.get(storyId as string),
        enabled: !!storyId
    });

const invalidateAndToast = (queryClient: ReturnType<typeof useQueryClient>, successMsg: string) => ({
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: storyMapKeys.all });
        toast.success(successMsg);
    },
    onError: (error: Error) => toast.error(error.message || "Action failed")
});

export const useCreateMapEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            storyId,
            data
        }: {
            storyId: string;
            data: { fromId: string; toId: string; edgeType: string; label?: string | null; description?: string | null };
        }) => storyMapApi.createEdge(storyId, data),
        ...invalidateAndToast(queryClient, "Edge created")
    });
};

export const useUpdateMapEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { edgeType?: string; label?: string | null; description?: string | null } }) =>
            storyMapApi.updateEdge(id, data),
        ...invalidateAndToast(queryClient, "Edge updated")
    });
};

export const useDeleteMapEdgeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyMapApi.deleteEdge(id),
        ...invalidateAndToast(queryClient, "Edge deleted")
    });
};

export const useMapLayoutQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyMapKeys.layout(storyId ?? ""),
        queryFn: () => storyMapApi.getLayout(storyId as string),
        enabled: !!storyId
    });

// Fires on every node drag-stop — no toast (would be noise), only this story's layout query is
// invalidated (matches useStoryGraphQuery.ts's useSaveLayoutPositionMutation exactly).
export const useSaveMapLayoutPositionMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ nodeId, x, y }: { nodeId: string; x: number; y: number }) => storyMapApi.saveLayoutPosition(storyId, nodeId, x, y),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyMapKeys.layout(storyId) })
    });
};

export const useResetMapLayoutMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => storyMapApi.resetLayout(storyId),
        onSuccess: (_, storyId) => {
            queryClient.invalidateQueries({ queryKey: storyMapKeys.layout(storyId) });
            toast.success("Layout reset");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to reset layout")
    });
};
