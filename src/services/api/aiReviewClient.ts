import type { AiReviewFinding, AiReviewFindingStatus, AiReviewTag } from "@/types/aiReview";
import { fetchJSON } from "./apiFactory";

// AI Review reads/triage only — triggering a review goes through agentJobsApi.enqueue
// (jobType: "ai_review_quick"), not a method here; this just reads or updates the
// aiReviewFindings rows that job writes. Mirrors ragClient.ts's own split.
export const aiReviewApi = {
    listFindingsForStory: (storyId: string, filters?: { status?: AiReviewFindingStatus; tag?: AiReviewTag; chapterId?: string }) => {
        const params = new URLSearchParams();
        if (filters?.status) params.set("status", filters.status);
        if (filters?.tag) params.set("tag", filters.tag);
        if (filters?.chapterId) params.set("chapterId", filters.chapterId);
        const qs = params.toString() ? `?${params}` : "";
        return fetchJSON<{ findings: AiReviewFinding[] }>(`/ai-review/findings/story/${storyId}${qs}`);
    },
    updateFindingStatus: (findingId: string, status: AiReviewFindingStatus) =>
        fetchJSON<AiReviewFinding>(`/ai-review/findings/${findingId}`, { method: "PATCH", body: JSON.stringify({ status }) })
};
