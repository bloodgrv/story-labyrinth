import type { FeatureEndpoint, FeatureEndpoints, FeatureKey } from "@/types/aiSettings";
import type { DatabaseExport } from "@/types/story";
import { fetchJSON, uploadFile } from "./apiFactory";

// Split out of client.ts once adding nameGeneratorApi's re-export pushed that file over the
// max-lines limit — same reasoning as ttsClient.ts/humanizerClient.ts before it.

// Per-feature AI endpoint overrides
export const featureEndpointsApi = {
    get: () => fetchJSON<FeatureEndpoints>("/admin/feature-endpoints"),
    setFeature: (feature: FeatureKey, endpoint: FeatureEndpoint) =>
        fetchJSON<FeatureEndpoints>(`/admin/feature-endpoints/${feature}`, {
            method: "PUT",
            body: JSON.stringify(endpoint)
        }),
    removeFeature: (feature: FeatureKey) =>
        fetchJSON<FeatureEndpoints>(`/admin/feature-endpoints/${feature}`, { method: "DELETE" })
};

// Admin/Migration API
export const adminApi = {
    exportDatabase: () => fetchJSON<DatabaseExport>("/admin/export"),
    importDatabase: (file: File) => uploadFile<{ success: boolean }>("/admin/import", file),
    checkDemoExists: () => fetchJSON<{ exists: boolean }>("/admin/demo/exists"),
    importDemoData: () => fetchJSON<{ success: boolean; message: string }>("/admin/demo/import", { method: "POST" }),
    deleteDemoData: () =>
        fetchJSON<{ success: boolean; deleted: { series: number; stories: number; lorebookEntries: number } }>(
            "/admin/demo",
            { method: "DELETE" }
        )
};
