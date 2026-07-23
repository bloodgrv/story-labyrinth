import type { DocumentImportDraft } from "@/types/codex";
import type { GlobalLorebookExport, LorebookEntry } from "@/types/story";
import { fetchJSON, uploadFile } from "./apiFactory";

// Lorebook API — split out of client.ts (same reasoning as ttsApi/humanizerApi/etc. before it)
// once it grew past the project's line limit adding image upload support.
export const lorebookApi = {
    getByStory: (storyId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}`),
    getByCategory: (storyId: string, category: string) =>
        fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/category/${category}`),
    getByTag: (storyId: string, tag: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/tag/${tag}`),
    getById: (id: string) => fetchJSON<LorebookEntry>(`/lorebook/${id}`),
    create: (data: Omit<LorebookEntry, "createdAt">) =>
        fetchJSON<LorebookEntry>("/lorebook", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<LorebookEntry>) =>
        fetchJSON<LorebookEntry>(`/lorebook/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/lorebook/${id}`, { method: "DELETE" }),
    getGlobal: () => fetchJSON<LorebookEntry[]>("/lorebook/global"),
    getBySeries: (seriesId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/series/${seriesId}`),
    getHierarchical: (storyId: string) => fetchJSON<LorebookEntry[]>(`/lorebook/story/${storyId}/hierarchical`),
    exportGlobal: () => fetchJSON<GlobalLorebookExport>("/lorebook/global/export"),
    importGlobal: (file: File) => uploadFile<{ success: boolean }>("/lorebook/global/import", file),
    // PDF/DOCX/MD/TXT reference document -> AI-extracted draft entry (not persisted; the
    // caller opens the normal entry-creation UI pre-filled with it for review). 2-minute timeout
    // (unlike other uploadFile callers) since this one includes a third-party LLM call that can
    // genuinely hang with no error otherwise — see apiFactory.ts's uploadFile doc comment.
    importDocument: (file: File) => uploadFile<{ draft: DocumentImportDraft }>("/lorebook/import/document", file, 120_000),
    uploadImage: (entryId: string, file: File) => uploadFile<LorebookEntry>(`/lorebook/${entryId}/image`, file),
    removeImage: (entryId: string) => fetchJSON<LorebookEntry>(`/lorebook/${entryId}/image`, { method: "DELETE" }),
    // AI-generates a portrait from the entry's own saved description (see grokImageService.ts).
    // `preset` — "mood" (default, description-driven) or "map" (location-only top-down/ink style,
    // L2 docs/Locations_And_Maps_Design.md).
    generateImage: (entryId: string, preset?: "mood" | "map") =>
        fetchJSON<LorebookEntry>(`/lorebook/${entryId}/generate-image`, { method: "POST", body: JSON.stringify({ preset }) }),
    // Not a fetch helper — this is the literal <img src> value, GET /:id/image is served directly
    // (auth cookie goes along automatically on same-origin <img> requests, see
    // DECISIONS.md's Lorebook Image Support entry for why this isn't a public static mount).
    imageUrl: (entryId: string) => `/api/lorebook/${entryId}/image`
};
