import type { Chapter } from "@/types/story";
import { fetchJSON } from "./apiFactory";

export const chaptersApi = {
    getByStory: (storyId: string) => fetchJSON<Chapter[]>(`/chapters/story/${storyId}`),
    getById: (id: string) => fetchJSON<Chapter>(`/chapters/${id}`),
    create: (data: Omit<Chapter, "createdAt">) =>
        fetchJSON<Chapter>("/chapters", { method: "POST", body: JSON.stringify(data) }),
    // `expectedContentVersion` isn't a real Chapter column — it's the CAS token (B24) the server's
    // chapters.ts PUT route reads off the body and strips before writing. Only meaningful/checked
    // when `data.content` is also present.
    update: (id: string, data: Partial<Chapter> & { expectedContentVersion?: number }) =>
        fetchJSON<Chapter>(`/chapters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/chapters/${id}`, { method: "DELETE" })
};
