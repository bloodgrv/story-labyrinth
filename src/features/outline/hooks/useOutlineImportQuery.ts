import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { outlineImportApi } from "@/services/api/client";
import { outlineKeys } from "@/features/outline/hooks/useOutlineQuery";
import type { DraftChapter, OutlineImportChecklistStatus, OutlineImportMode } from "@/types/outlineImport";

export const outlineImportKeys = {
    all: ["outlineImport"] as const,
    active: (storyId: string) => [...outlineImportKeys.all, "active", storyId] as const,
    batch: (batchId: string) => [...outlineImportKeys.all, "batch", batchId] as const
};

// The story's most recent still-active (extracting|ready) batch — drives OI8's "refresh / leave
// Outline tool / return -> batch still loadable" criterion. `batch: null` is a normal steady
// state (no import in progress), not an error.
export const useActiveOutlineImportBatchQuery = (storyId: string) =>
    useQuery({
        queryKey: outlineImportKeys.active(storyId),
        queryFn: () => outlineImportApi.getActiveBatch(storyId),
        enabled: !!storyId
    });

export const useUploadOutlineImportMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, chatId }: { file: File; chatId?: string }) => outlineImportApi.upload(storyId, file, chatId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to import structure document")
    });
};

export const useUpdateOutlineImportBatchMutation = (storyId: string, batchId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<{ structureDraft: DraftChapter[]; mode: OutlineImportMode; includeInAiArm: boolean }>) =>
            outlineImportApi.updateBatch(batchId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.batch(batchId) });
        },
        onError: () => toast.error("Failed to update import draft")
    });
};

export const useAcceptOutlineImportBatchMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (batchId: string) => outlineImportApi.accept(batchId),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.batch(result.batch.id) });
            queryClient.invalidateQueries({ queryKey: outlineKeys.byStory(storyId) });
            toast.success("Outline structure imported");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to accept import")
    });
};

export const useDiscardOutlineImportBatchMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ batchId, alsoDismissRich }: { batchId: string; alsoDismissRich?: boolean }) =>
            outlineImportApi.discard(batchId, alsoDismissRich),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
        },
        onError: () => toast.error("Failed to discard import")
    });
};

export const useUpdateOutlineImportChecklistMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: OutlineImportChecklistStatus }) =>
            outlineImportApi.updateChecklistStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
        },
        onError: () => toast.error("Failed to update checklist item")
    });
};
