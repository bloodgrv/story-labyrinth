import type { ChapterVersion } from "@/types/chapterVersion";
import type { Chapter } from "@/types/story";
import { fetchJSON } from "./apiFactory";

export const chapterVersionsApi = {
    listForChapter: (chapterId: string) => fetchJSON<{ versions: ChapterVersion[] }>(`/chapters/${chapterId}/versions`),

    // Manual duplicate — snapshots the chapter's current content into a new version.
    duplicate: (chapterId: string, label?: string) =>
        fetchJSON<ChapterVersion>(`/chapters/${chapterId}/versions`, {
            method: "POST",
            body: JSON.stringify({ label: label ?? null })
        }),

    generate: (chapterId: string, instruction?: string) =>
        fetchJSON<ChapterVersion>(`/chapters/${chapterId}/versions/generate`, {
            method: "POST",
            body: JSON.stringify({ instruction })
        }),

    updateContent: (chapterId: string, versionId: string, content: string) =>
        fetchJSON<ChapterVersion>(`/chapters/${chapterId}/versions/${versionId}`, {
            method: "PUT",
            body: JSON.stringify({ content })
        }),

    setLabel: (chapterId: string, versionId: string, label: string | null) =>
        fetchJSON<ChapterVersion>(`/chapters/${chapterId}/versions/${versionId}`, {
            method: "PATCH",
            body: JSON.stringify({ label })
        }),

    compile: (chapterId: string, versionId: string) =>
        fetchJSON<{ chapter: Chapter; version: ChapterVersion }>(`/chapters/${chapterId}/versions/${versionId}/compile`, {
            method: "POST"
        }),

    delete: (chapterId: string, versionId: string) =>
        fetchJSON<{ success: boolean }>(`/chapters/${chapterId}/versions/${versionId}`, { method: "DELETE" })
};
