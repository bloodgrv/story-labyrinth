import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { agentJobsApi, codexApi } from "@/services/api/client";
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

// C5 (docs/CURRENT_BACKLOG.md P0.3) — entry-scoped pending Codex changes, source-agnostic (chat
// proposals AND suggest_codex_updates job proposals both show up here; the chat proposal tray
// only ever shows the chat-scoped subset). See codexClient.ts's getPending.
export const codexPendingKeys = {
    all: ["codexPending"] as const,
    list: (entryId: string) => [...codexPendingKeys.all, entryId] as const
};

export const useCodexPendingQuery = (entryId: string | undefined) =>
    useQuery({
        queryKey: codexPendingKeys.list(entryId ?? ""),
        queryFn: () => codexApi.getPending(entryId ?? ""),
        enabled: !!entryId
    });

const invalidateAfterResolve = (
    queryClient: ReturnType<typeof useQueryClient>,
    entryId: string,
    storyId: string | undefined
) => {
    queryClient.invalidateQueries({ queryKey: codexPendingKeys.list(entryId) });
    queryClient.invalidateQueries({ queryKey: codexHistoryKeys.list(entryId) });
    if (storyId) {
        queryClient.invalidateQueries({ queryKey: lorebookKeys.story(storyId) });
        queryClient.invalidateQueries({ queryKey: lorebookKeys.hierarchical(storyId) });
    }
};

export const useApprovePendingChangeMutation = (entryId: string, storyId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (pendingChangeId: string) => codexApi.approve(pendingChangeId),
        onSuccess: () => {
            invalidateAfterResolve(queryClient, entryId, storyId);
            toast.success("Codex entry updated");
        },
        onError: (error: Error) => toast.error(`Failed to approve proposal: ${error.message}`)
    });
};

export const useRejectPendingChangeMutation = (entryId: string, storyId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (pendingChangeId: string) => codexApi.reject(pendingChangeId),
        onSuccess: () => {
            invalidateAfterResolve(queryClient, entryId, storyId);
        },
        onError: (error: Error) => toast.error(`Failed to reject proposal: ${error.message}`)
    });
};

// C5 (docs/CURRENT_BACKLOG.md P0.3) — manually enqueues suggest_codex_updates for one chapter.
// Thin wrapper over the generic agentJobsApi.enqueue, same posture as
// rag-scanner/hooks/useRagScanQuery.ts's useSuggestMemoriesMutation. Which entries end up with a
// new pending change isn't known until the job runs, so this invalidates the whole codexPending
// prefix (every open entry editor's pending panel) rather than one entryId's list.
export const useSuggestCodexUpdatesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterId }: { storyId: string; chapterId: string }) =>
            agentJobsApi.enqueue({ jobType: "suggest_codex_updates", storyId, entityId: chapterId }),
        onSuccess: job => {
            queryClient.invalidateQueries({ queryKey: codexPendingKeys.all });
            queryClient.invalidateQueries({ queryKey: ["agentJobs"] });
            toast.success(
                job.status === "running" || job.status === "queued"
                    ? "Suggesting Codex updates from this chapter…"
                    : "A Codex-update suggestion job for this chapter already ran"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue Codex update suggestions")
    });
};
