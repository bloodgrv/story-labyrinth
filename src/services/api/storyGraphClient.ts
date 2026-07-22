import type {
    StoryGraphEdge,
    StoryGraphLayoutPosition,
    StoryGraphMigrationResult,
    StoryGraphPendingEdge,
    StoryGraphResponse
} from "@/types/storyGraph";
import { fetchJSON } from "./apiFactory";

export const storyGraphApi = {
    get: (storyId: string) => fetchJSON<StoryGraphResponse>(`/stories/${storyId}/graph`),
    getNeighborhood: (storyId: string, entryId: string, depth: 1 | 2 = 1) =>
        fetchJSON<StoryGraphResponse>(`/stories/${storyId}/graph/neighborhood/${entryId}?depth=${depth}`),
    listPending: (storyId: string) => fetchJSON<{ pending: StoryGraphPendingEdge[] }>(`/stories/${storyId}/graph/pending`),
    createEdge: (
        storyId: string,
        data: { fromId: string; toId: string; edgeType: string; label?: string | null; description?: string | null; asPending?: boolean }
    ) => fetchJSON<StoryGraphEdge>(`/stories/${storyId}/graph/edges`, { method: "POST", body: JSON.stringify(data) }),
    updateEdge: (id: string, data: { edgeType?: string; label?: string | null; description?: string | null }) =>
        fetchJSON<StoryGraphEdge>(`/graph/edges/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteEdge: (id: string) => fetchJSON<{ success: boolean }>(`/graph/edges/${id}`, { method: "DELETE" }),
    approveEdge: (id: string) => fetchJSON<StoryGraphEdge>(`/graph/edges/${id}/approve`, { method: "POST" }),
    rejectEdge: (id: string) => fetchJSON<StoryGraphEdge>(`/graph/edges/${id}/reject`, { method: "POST" }),
    migrateFromMetadata: (storyId: string) =>
        fetchJSON<StoryGraphMigrationResult>(`/stories/${storyId}/graph/migrate-from-metadata`, { method: "POST" }),
    getLayout: (storyId: string) => fetchJSON<{ positions: StoryGraphLayoutPosition[] }>(`/stories/${storyId}/graph/layout`),
    saveLayoutPosition: (storyId: string, nodeId: string, x: number, y: number) =>
        fetchJSON<StoryGraphLayoutPosition>(`/stories/${storyId}/graph/layout/${nodeId}`, {
            method: "PUT",
            body: JSON.stringify({ x, y })
        }),
    resetLayout: (storyId: string) => fetchJSON<{ success: boolean }>(`/stories/${storyId}/graph/layout`, { method: "DELETE" })
};
