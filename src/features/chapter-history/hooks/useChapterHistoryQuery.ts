import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { chapterSnapshotsApi } from "@/services/api/client";
import { useStoryContext } from "@/features/stories/context/StoryContext";

export const chapterHistoryKeys = {
    all: ["chapterSnapshots"] as const,
    forChapter: (chapterId: string) => [...chapterHistoryKeys.all, "chapter", chapterId] as const
};

export const useChapterHistoryQuery = (chapterId: string) =>
    useQuery({
        queryKey: chapterHistoryKeys.forChapter(chapterId),
        queryFn: () => chapterSnapshotsApi.listForChapter(chapterId),
        enabled: !!chapterId
    });

export const useSaveChapterVersionMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (label?: string) => chapterSnapshotsApi.save(chapterId, label),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chapterHistoryKeys.forChapter(chapterId) });
            toast.success("Saved to history");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to save")
    });
};

export const useSetSnapshotLabelMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ snapshotId, label }: { snapshotId: string; label: string | null }) =>
            chapterSnapshotsApi.setLabel(chapterId, snapshotId, label),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: chapterHistoryKeys.forChapter(chapterId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to rename")
    });
};

export const useRestoreSnapshotMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    const { refreshChapterContent } = useStoryContext();
    return useMutation({
        mutationFn: (snapshotId: string) => chapterSnapshotsApi.restore(chapterId, snapshotId),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: chapterHistoryKeys.forChapter(chapterId) });
            // Write the mutation's own (already-fresh) chapter straight into the detail cache
            // instead of just invalidating and hoping a background refetch lands in time. A real
            // race was confirmed live: invalidateQueries alone left a window where
            // refreshChapterContent()'s token bump reset LoadChapterContentPlugin's "loaded" gate
            // before the refetch resolved, so it reloaded the editor from the STILL-STALE cached
            // (pre-restore) content — which then looked "dirty" and got autosaved right back over
            // the restore a second later, silently undoing it. chaptersKeys' own factory isn't
            // exported (same reasoning as useChapterVersionsQuery.ts's compile mutation), so this
            // spells out its "detail" key shape directly; "byStory" list staleness is harmless and
            // left to eventual invalidation below.
            queryClient.setQueryData(["chapters", chapterId], result.chapter);
            queryClient.invalidateQueries({ queryKey: ["chapters"] });
            refreshChapterContent();
            toast.success("Restored");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to restore")
    });
};
