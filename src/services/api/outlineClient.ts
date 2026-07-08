import type {
    CharacterArcEntry,
    OutlineGenerationResult,
    OutlineItem,
    OutlineItemCharacterLink,
    OutlineReorderUpdate
} from "@/types/outline";
import { fetchJSON } from "./apiFactory";

export const outlineApi = {
    getByStory: (storyId: string) => fetchJSON<OutlineItem[]>(`/outline/story/${storyId}`),
    create: (data: Omit<OutlineItem, "id" | "createdAt" | "updatedAt">) =>
        fetchJSON<OutlineItem>("/outline", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<OutlineItem>) =>
        fetchJSON<OutlineItem>(`/outline/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/outline/${id}`, { method: "DELETE" }),
    reorder: (updates: OutlineReorderUpdate[]) =>
        fetchJSON<{ success: boolean }>("/outline/reorder", { method: "PATCH", body: JSON.stringify({ updates }) }),
    generate: (storyId: string) =>
        fetchJSON<OutlineGenerationResult>("/outline/generate", { method: "POST", body: JSON.stringify({ storyId }) }),
    rejectAllPending: (storyId: string) =>
        fetchJSON<{ success: boolean }>(`/outline/story/${storyId}/reject-all-pending`, { method: "POST" }),
    getArc: (storyId: string, characterId: string) =>
        fetchJSON<CharacterArcEntry[]>(`/outline/story/${storyId}/arc/${characterId}`)
};

export const outlineCharactersApi = {
    getByOutlineItem: (outlineItemId: string) =>
        fetchJSON<OutlineItemCharacterLink[]>(`/outline-characters/outlineItem/${outlineItemId}`),
    create: (data: Omit<OutlineItemCharacterLink, "id" | "createdAt">) =>
        fetchJSON<OutlineItemCharacterLink>("/outline-characters", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<OutlineItemCharacterLink>) =>
        fetchJSON<OutlineItemCharacterLink>(`/outline-characters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/outline-characters/${id}`, { method: "DELETE" })
};
