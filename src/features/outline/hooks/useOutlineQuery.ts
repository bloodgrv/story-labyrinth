import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { outlineApi } from "@/services/api/client";
import type { OutlineItem, OutlineReorderUpdate } from "@/types/outline";

export const outlineKeys = {
    all: ["outline"] as const,
    byStory: (storyId: string) => [...outlineKeys.all, "story", storyId] as const
};

export const useOutlineQuery = (storyId: string) =>
    useQuery({
        queryKey: outlineKeys.byStory(storyId),
        queryFn: () => outlineApi.getByStory(storyId),
        enabled: !!storyId
    });

export const useCreateOutlineItemMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: Omit<OutlineItem, "id" | "createdAt" | "updatedAt">) => outlineApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
        },
        onError: () => toast.error("Failed to create outline item")
    });
};

export const useUpdateOutlineItemMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<OutlineItem> }) => outlineApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
        },
        onError: () => toast.error("Failed to update outline item")
    });
};

export const useDeleteOutlineItemMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => outlineApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
            toast.success("Outline item deleted");
        },
        onError: () => toast.error("Failed to delete outline item")
    });
};

// Bulk reorder/reparent, sent as one batched request per drag — see OutlineReorderUpdate.
export const useReorderOutlineMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (updates: OutlineReorderUpdate[]) => outlineApi.reorder(updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
        },
        onError: () => toast.error("Failed to reorder outline")
    });
};

export const useGenerateOutlineMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => outlineApi.generate(storyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
        },
        onError: () => toast.error("Failed to generate outline suggestions")
    });
};

export const useRejectAllPendingOutlineMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => outlineApi.rejectAllPending(storyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
            toast.success("All suggestions rejected");
        },
        onError: () => toast.error("Failed to reject suggestions")
    });
};
