import type { ChapterSnapshot } from "@/types/chapterSnapshot";
import type { Chapter } from "@/types/story";
import { fetchJSON } from "./apiFactory";

export const chapterSnapshotsApi = {
    listForChapter: (chapterId: string) =>
        fetchJSON<{ snapshots: ChapterSnapshot[] }>(`/chapters/${chapterId}/snapshots`),

    // Manual named save — snapshots the chapter's current (already-autosaved) content.
    save: (chapterId: string, label?: string) =>
        fetchJSON<ChapterSnapshot>(`/chapters/${chapterId}/snapshots`, {
            method: "POST",
            body: JSON.stringify({ label: label ?? null })
        }),

    setLabel: (chapterId: string, snapshotId: string, label: string | null) =>
        fetchJSON<ChapterSnapshot>(`/chapters/${chapterId}/snapshots/${snapshotId}`, {
            method: "PATCH",
            body: JSON.stringify({ label })
        }),

    restore: (chapterId: string, snapshotId: string) =>
        fetchJSON<{ chapter: Chapter; snapshot: ChapterSnapshot }>(
            `/chapters/${chapterId}/snapshots/${snapshotId}/restore`,
            { method: "POST" }
        )
};
