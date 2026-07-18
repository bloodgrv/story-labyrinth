import type { RagIssueStatus, RagScan, RagScanIssue } from "@/types/ragScan";
import { fetchJSON } from "./apiFactory";

// RAG indexing + scanner API (backed by /api/rag).
export const ragApi = {
    // The Editor chat rail needs chapter content actually in the index to ground itself in the
    // manuscript; lorebook entries index automatically elsewhere, but chapters don't yet, so
    // this gets called from the chapter autosave path (SaveChapterContent plugin) on a long
    // debounce.
    indexChapter: (chapterId: string) =>
        fetchJSON<{ indexed: boolean; chunks: number }>(`/rag/index/chapter/${chapterId}`, { method: "POST" }),

    // Scanner reads/triage only — triggering a scan goes through agentJobsApi.enqueue
    // (rag_scan_chapter/rag_scan_story), not a method here; these just read or update the
    // ragScans/ragScanIssues rows those jobs write.
    getScan: (scanId: string) => fetchJSON<{ scan: RagScan; issues: RagScanIssue[] }>(`/rag/scan/${scanId}`),
    listScansForStory: (storyId: string) => fetchJSON<{ scans: RagScan[] }>(`/rag/scans/story/${storyId}`),
    listIssuesForStory: (storyId: string, status?: RagIssueStatus) => {
        const qs = status ? `?${new URLSearchParams({ status })}` : "";
        return fetchJSON<{ issues: RagScanIssue[] }>(`/rag/issues/story/${storyId}${qs}`);
    },
    updateIssueStatus: (issueId: string, status: RagIssueStatus) =>
        fetchJSON<RagScanIssue>(`/rag/issues/${issueId}`, { method: "PATCH", body: JSON.stringify({ status }) })
};
