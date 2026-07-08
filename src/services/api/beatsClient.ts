import type { BeatDetectionResult, ConcreteBeat } from "@/types/beats";
import { fetchJSON } from "./apiFactory";

// Concrete Beats API
export const beatsApi = {
    getByChapter: (chapterId: string) => fetchJSON<ConcreteBeat[]>(`/beats/chapter/${chapterId}`),
    create: (data: Omit<ConcreteBeat, "id" | "createdAt">) =>
        fetchJSON<ConcreteBeat>("/beats", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ConcreteBeat>) =>
        fetchJSON<ConcreteBeat>(`/beats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/beats/${id}`, { method: "DELETE" }),
    detect: (chapterId: string, storyId: string) =>
        fetchJSON<BeatDetectionResult>("/beats/detect", { method: "POST", body: JSON.stringify({ chapterId, storyId }) }),
    rejectAll: (chapterId: string) =>
        fetchJSON<{ success: boolean }>(`/beats/chapter/${chapterId}/reject-all`, { method: "POST" })
};
