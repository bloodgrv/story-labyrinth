import type { StoryMapDocument } from "@/types/storyMaps";
import { fetchJSON, uploadFile } from "./apiFactory";

// Maps v2 (MV0, docs/Maps_V2_Sketch_Design.md) — sketch-canvas documents, distinct from
// storyMapClient.ts's L3 spatial relationship graph. Mirrors that file's style/naming.
export const storyMapsApi = {
    list: (storyId: string) => fetchJSON<StoryMapDocument[]>(`/stories/${storyId}/maps`),
    getByLocation: (storyId: string, locationId: string) => fetchJSON<StoryMapDocument | null>(`/stories/${storyId}/maps/by-location/${locationId}`),
    get: (id: string) => fetchJSON<StoryMapDocument>(`/maps/${id}`),
    create: (storyId: string, data: { title: string; locationId?: string | null; sceneJson?: unknown }) =>
        fetchJSON<StoryMapDocument>(`/stories/${storyId}/maps`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { title?: string; locationId?: string | null; sceneJson?: unknown }) =>
        fetchJSON<StoryMapDocument>(`/maps/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/maps/${id}`, { method: "DELETE" }),
    uploadThumbnail: (id: string, file: File) => uploadFile<StoryMapDocument>(`/maps/${id}/thumbnail`, file),
    // Not a fetch helper — this is the literal <img src> value, GET /maps/:id/thumbnail is served
    // directly, same pattern as lorebookClient.ts's imageUrl.
    thumbnailUrl: (id: string) => `/api/maps/${id}/thumbnail`
};
