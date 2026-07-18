import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { chapterVersionsApi } from "@/services/api/client";
import type { ChapterVersion } from "@/types/chapterVersion";

export const chapterVersionKeys = {
    all: ["chapterVersions"] as const,
    forChapter: (chapterId: string) => [...chapterVersionKeys.all, "chapter", chapterId] as const
};

export const useChapterVersionsQuery = (chapterId: string) =>
    useQuery({
        queryKey: chapterVersionKeys.forChapter(chapterId),
        queryFn: () => chapterVersionsApi.listForChapter(chapterId),
        enabled: !!chapterId
    });

// Autosave target for a version's own editor (SaveChapterVersionContentPlugin) — silent on
// success/failure, same as useUpdateChapterMutation's own autosave path: no toast spam per
// keystroke pause. Patches the list cache in place (setQueryData, no refetch) rather than
// invalidating — a plain invalidate would either do nothing useful (the active tab already has
// the latest content live in its own editor) or, worse, leave the cache stale until some
// unrelated refetch happened to occur. That staleness is exactly what let Compare mode's second
// VersionEditor mount load outdated content from the cached list on its very first render — this
// keeps the cache itself correct so any *new* editor mount for this version starts from the
// real current content.
export const useUpdateVersionContentMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ versionId, content }: { versionId: string; content: string }) =>
            chapterVersionsApi.updateContent(chapterId, versionId, content),
        onSuccess: updatedVersion => {
            queryClient.setQueryData(
                chapterVersionKeys.forChapter(chapterId),
                (old: { versions: ChapterVersion[] } | undefined) =>
                    old && { versions: old.versions.map(v => (v.id === updatedVersion.id ? updatedVersion : v)) }
            );
        }
    });
};

export const useDuplicateVersionMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (label?: string) => chapterVersionsApi.duplicate(chapterId, label),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chapterVersionKeys.forChapter(chapterId) });
            toast.success("Version created");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to duplicate chapter")
    });
};

export const useGenerateVersionMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (instruction?: string) => chapterVersionsApi.generate(chapterId, instruction),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chapterVersionKeys.forChapter(chapterId) });
            toast.success("AI draft generated");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to generate AI draft")
    });
};

export const useSetVersionLabelMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ versionId, label }: { versionId: string; label: string | null }) =>
            chapterVersionsApi.setLabel(chapterId, versionId, label),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: chapterVersionKeys.forChapter(chapterId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to rename version")
    });
};

export const useCompileVersionMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (versionId: string) => chapterVersionsApi.compile(chapterId, versionId),
        onSuccess: () => {
            // Broad prefix invalidation — chaptersKeys' own factory isn't exported, and
            // both its "detail" and "byStory" keys share this "chapters" prefix.
            queryClient.invalidateQueries({ queryKey: ["chapters"] });
            toast.success("Compiled into the main chapter");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to compile version")
    });
};

export const useDeleteVersionMutation = (chapterId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (versionId: string) => chapterVersionsApi.delete(chapterId, versionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chapterVersionKeys.forChapter(chapterId) });
            toast.success("Version deleted");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete version")
    });
};
