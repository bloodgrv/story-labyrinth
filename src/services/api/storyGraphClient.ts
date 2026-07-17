import type { StoryGraphEdge, StoryGraphMigrationResult, StoryGraphResponse } from "@/types/storyGraph";
import { fetchJSON } from "./apiFactory";

export const storyGraphApi = {
    get: (storyId: string) => fetchJSON<StoryGraphResponse>(`/stories/${storyId}/graph`),
    getNeighborhood: (storyId: string, entryId: string, depth: 1 | 2 = 1) =>
        fetchJSON<StoryGraphResponse>(`/stories/${storyId}/graph/neighborhood/${entryId}?depth=${depth}`),
    createEdge: (
        storyId: string,
        data: { fromId: string; toId: string; edgeType: string; label?: string | null; description?: string | null }
    ) => fetchJSON<StoryGraphEdge>(`/stories/${storyId}/graph/edges`, { method: "POST", body: JSON.stringify(data) }),
    updateEdge: (id: string, data: { edgeType?: string; label?: string | null; description?: string | null }) =>
        fetchJSON<StoryGraphEdge>(`/graph/edges/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteEdge: (id: string) => fetchJSON<{ success: boolean }>(`/graph/edges/${id}`, { method: "DELETE" }),
    migrateFromMetadata: (storyId: string) =>
        fetchJSON<StoryGraphMigrationResult>(`/stories/${storyId}/graph/migrate-from-metadata`, { method: "POST" })
};
