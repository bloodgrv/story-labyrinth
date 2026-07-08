import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { outlineCharactersApi } from "@/services/api/client";
import type { OutlineItemCharacterLink } from "@/types/outline";
import { characterArcKeys } from "./useCharacterArcQuery";

export const outlineCharacterLinkKeys = {
    all: ["outlineCharacterLinks"] as const,
    byItem: (outlineItemId: string) => [...outlineCharacterLinkKeys.all, "item", outlineItemId] as const
};

export const useOutlineItemCharacterLinksQuery = (outlineItemId: string) =>
    useQuery({
        queryKey: outlineCharacterLinkKeys.byItem(outlineItemId),
        queryFn: () => outlineCharactersApi.getByOutlineItem(outlineItemId),
        enabled: !!outlineItemId
    });

export const useLinkCharacterMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: Omit<OutlineItemCharacterLink, "id" | "createdAt">) => outlineCharactersApi.create(data),
        onSuccess: created => {
            queryClient.invalidateQueries({ queryKey: outlineCharacterLinkKeys.byItem(created.outlineItemId) });
            queryClient.invalidateQueries({ queryKey: characterArcKeys.all });
        },
        onError: () => toast.error("Failed to link character")
    });
};

export const useUpdateCharacterLinkMutation = (outlineItemId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<OutlineItemCharacterLink> }) =>
            outlineCharactersApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineCharacterLinkKeys.byItem(outlineItemId) });
            queryClient.invalidateQueries({ queryKey: characterArcKeys.all });
        },
        onError: () => toast.error("Failed to update arc note")
    });
};

export const useUnlinkCharacterMutation = (outlineItemId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => outlineCharactersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineCharacterLinkKeys.byItem(outlineItemId) });
            queryClient.invalidateQueries({ queryKey: characterArcKeys.all });
        },
        onError: () => toast.error("Failed to unlink character")
    });
};
