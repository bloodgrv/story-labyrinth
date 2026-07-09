import { fetchJSON } from "./apiFactory";

// RAG indexing API (backed by /api/rag) — the Editor chat rail needs chapter content actually
// in the index to ground itself in the manuscript; lorebook entries index automatically
// elsewhere, but chapters don't yet, so this gets called from the chapter autosave path
// (SaveChapterContent plugin) on a long debounce.
export const ragApi = {
    indexChapter: (chapterId: string) =>
        fetchJSON<{ indexed: boolean; chunks: number }>(`/rag/index/chapter/${chapterId}`, { method: "POST" })
};
