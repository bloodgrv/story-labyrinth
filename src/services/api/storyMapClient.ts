import type { StoryMapEdge, StoryMapLayoutPosition, StoryMapResponse } from "@/types/storyMap";
import { fetchJSON } from "./apiFactory";

export const storyMapApi = {
    get: (storyId: string) => fetchJSON<StoryMapResponse>(`/stories/${storyId}/map`),
    createEdge: (storyId: string, data: { fromId: string; toId: string; edgeType: string; label?: string | null; description?: string | null }) =>
        fetchJSON<StoryMapEdge>(`/stories/${storyId}/map/edges`, { method: "POST", body: JSON.stringify(data) }),
    updateEdge: (id: string, data: { edgeType?: string; label?: string | null; description?: string | null }) =>
        fetchJSON<StoryMapEdge>(`/map/edges/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteEdge: (id: string) => fetchJSON<{ success: boolean }>(`/map/edges/${id}`, { method: "DELETE" }),
    getLayout: (storyId: string) => fetchJSON<{ positions: StoryMapLayoutPosition[] }>(`/stories/${storyId}/map/layout`),
    saveLayoutPosition: (storyId: string, nodeId: string, x: number, y: number) =>
        fetchJSON<StoryMapLayoutPosition>(`/stories/${storyId}/map/layout/${nodeId}`, {
            method: "PUT",
            body: JSON.stringify({ x, y })
        }),
    resetLayout: (storyId: string) => fetchJSON<{ success: boolean }>(`/stories/${storyId}/map/layout`, { method: "DELETE" })
};
