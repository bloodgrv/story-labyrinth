import type {
    DraftChapter,
    OutlineImportAcceptResult,
    OutlineImportBatch,
    OutlineImportChecklistItem,
    OutlineImportChecklistStatus,
    OutlineImportMode
} from "@/types/outlineImport";
import { fetchJSON, uploadFile } from "./apiFactory";

type BatchWithChecklist = { batch: OutlineImportBatch | null; checklist: OutlineImportChecklistItem[] };

// Outline Import (docs/Outline_Import_Design.md) — split out same as brainstormClient.ts, its own
// small resource distinct from the plain outlineItems CRUD in client.ts.
export const outlineImportApi = {
    // 2-minute timeout, same reasoning as lorebookApi.importDocument — the LLM-normalize fallback
    // path is a third-party call that can genuinely hang.
    upload: (storyId: string, file: File, chatId?: string) =>
        uploadFile<{ batch: OutlineImportBatch; checklist: OutlineImportChecklistItem[] }>(
            "/outline-import",
            file,
            120_000,
            chatId ? { storyId, chatId } : { storyId }
        ),
    getActiveBatch: (storyId: string) =>
        fetchJSON<BatchWithChecklist>(`/outline-import?${new URLSearchParams({ storyId })}`),
    getBatch: (batchId: string) => fetchJSON<BatchWithChecklist>(`/outline-import/${batchId}`),
    updateBatch: (
        batchId: string,
        data: Partial<{ structureDraft: DraftChapter[]; mode: OutlineImportMode; includeInAiArm: boolean }>
    ) => fetchJSON<OutlineImportBatch>(`/outline-import/${batchId}`, { method: "PATCH", body: JSON.stringify(data) }),
    accept: (batchId: string) =>
        fetchJSON<OutlineImportAcceptResult>(`/outline-import/${batchId}/accept`, { method: "POST" }),
    discard: (batchId: string, alsoDismissRich = false) =>
        fetchJSON<{ success: boolean }>(`/outline-import/${batchId}/discard`, {
            method: "POST",
            body: JSON.stringify({ alsoDismissRich })
        }),
    updateChecklistStatus: (id: string, status: OutlineImportChecklistStatus) =>
        fetchJSON<OutlineImportChecklistItem>(`/outline-import/checklist/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        })
};
