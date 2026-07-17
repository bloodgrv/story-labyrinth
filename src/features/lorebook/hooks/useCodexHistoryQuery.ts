import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { codexApi } from "@/services/api/client";
import { lorebookKeys } from "./useLorebookQuery";

// Project Saves Phase 1 — Codex snapshot history/timeline.

export const codexHistoryKeys = {
    all: ["codexHistory"] as const,
    list: (entryId: string) => [...codexHistoryKeys.all, entryId] as const
};

// No refetchInterval — snapshots don't self-transition without a user action.
export const useCodexSnapshotsQuery = (entryId: string | undefined) =>
    useQuery({
        queryKey: codexHistoryKeys.list(entryId ?? ""),
        queryFn: () => codexApi.getSnapshots(entryId ?? ""),
        enabled: !!entryId
    });

// storyId is needed (not just entryId) so the restore can invalidate the lorebook queries that
// drive LorebookEntryTab's own `${activeEntry.id}-${activeEntry.updatedAt}` remount key — that's
// what makes the open entry's form actually refresh to the restored values.
export const useRestoreSnapshotMutation = (entryId: string, storyId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (snapshotId: string) => codexApi.restoreSnapshot(entryId, snapshotId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: codexHistoryKeys.list(entryId) });
            if (storyId) {
                queryClient.invalidateQueries({ queryKey: lorebookKeys.story(storyId) });
                queryClient.invalidateQueries({ queryKey: lorebookKeys.hierarchical(storyId) });
            }
            toast.success("Restored");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to restore")
    });
};

export const useLabelSnapshotMutation = (entryId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ snapshotId, label }: { snapshotId: string; label: string | null }) =>
            codexApi.labelSnapshot(entryId, snapshotId, label),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: codexHistoryKeys.list(entryId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to save label")
    });
};
