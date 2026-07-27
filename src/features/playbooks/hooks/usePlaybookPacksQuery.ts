import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { playbookPacksApi } from "@/services/api/client";
import type { PlaybookKey, PlaybookPack, PlaybookScope, PlaybookStyle } from "@/types/playbookPack";

export const playbookPackKeys = {
    all: ["playbookPacks"] as const,
    list: (storyId?: string | null) => [...playbookPackKeys.all, "list", storyId ?? null] as const,
    resolve: (storyId: string | null, playbookKey: PlaybookKey, style: PlaybookStyle) =>
        [...playbookPackKeys.all, "resolve", storyId, playbookKey, style] as const
};

// storyId undefined/null -> Settings' global-scope view (shipped+global only). storyId set ->
// in-story Playbooks tool view (shipped+global+story).
export const usePlaybookPacksQuery = (storyId?: string | null) =>
    useQuery({
        queryKey: playbookPackKeys.list(storyId),
        queryFn: () => playbookPacksApi.list(storyId)
    });

// Which pack actually resolves for a given (playbookKey, style) right now — used for the "active"
// badge. Only meaningful once packs are loaded, so callers pass `enabled` themselves if needed.
export const usePlaybookPackResolveQuery = (storyId: string | null, playbookKey: PlaybookKey, style: PlaybookStyle) =>
    useQuery({
        queryKey: playbookPackKeys.resolve(storyId, playbookKey, style),
        queryFn: () => playbookPacksApi.resolve(storyId, playbookKey, style)
    });

const invalidateAndToast = (queryClient: ReturnType<typeof useQueryClient>, successMsg: string) => ({
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: playbookPackKeys.all });
        toast.success(successMsg);
    },
    onError: (error: Error) => toast.error(error.message || "Action failed")
});

export const useCreatePlaybookPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: playbookPacksApi.create, ...invalidateAndToast(queryClient, "Pack created") });
};

export const useCopyPlaybookPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, targetScope, targetStoryId }: { id: string; targetScope: "global" | "story"; targetStoryId: string | null }) =>
            playbookPacksApi.copy(id, targetScope, targetStoryId),
        ...invalidateAndToast(queryClient, "Pack copied for editing")
    });
};

export const useUpdatePlaybookPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { title?: string; body?: string } }) => playbookPacksApi.update(id, data),
        ...invalidateAndToast(queryClient, "Pack updated")
    });
};

export const useDeletePlaybookPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: (id: string) => playbookPacksApi.delete(id), ...invalidateAndToast(queryClient, "Pack removed") });
};

export const useImportPlaybookPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            file,
            fields
        }: {
            file: File;
            fields: { packScope: PlaybookScope; storyId?: string; playbookKey?: string; style?: string; title?: string };
        }) => playbookPacksApi.import(file, fields),
        ...invalidateAndToast(queryClient, "Pack imported")
    });
};

export type { PlaybookPack };
