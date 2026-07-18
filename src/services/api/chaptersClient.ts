import type { Chapter } from "@/types/story";
import { fetchJSON } from "./apiFactory";

export const chaptersApi = {
    getByStory: (storyId: string) => fetchJSON<Chapter[]>(`/chapters/story/${storyId}`),
    getById: (id: string) => fetchJSON<Chapter>(`/chapters/${id}`),
    create: (data: Omit<Chapter, "createdAt">) =>
        fetchJSON<Chapter>("/chapters", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Chapter>) =>
        fetchJSON<Chapter>(`/chapters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/chapters/${id}`, { method: "DELETE" })
};
