import type {
    AddFavoriteRequest,
    CsvImportMeta,
    GenerateNamesRequest,
    GenerateNamesResponse,
    ImportLevel,
    ImportPoolsResponse,
    InstallPackRequest,
    InstallPackResult,
    MarkNameUsedRequest,
    NameFavorite,
    NamePackManifestEntry,
    NamePoolGender,
    NamePoolKind,
    NamePoolSummary,
    SaveStoryNameDefaultsRequest,
    StoryNameDefaults,
    UninstallPackRequest,
    UsedName
} from "@/types/nameGenerator";
import { fetchJSON, uploadFile } from "./apiFactory";

export const nameGeneratorApi = {
    listPools: (params?: { storyId?: string; kind?: NamePoolKind; gender?: NamePoolGender; region?: string }) => {
        const q = new URLSearchParams();
        if (params?.storyId) q.set("storyId", params.storyId);
        if (params?.kind) q.set("kind", params.kind);
        if (params?.gender) q.set("gender", params.gender);
        if (params?.region) q.set("region", params.region);
        const qs = q.toString();
        return fetchJSON<{ pools: NamePoolSummary[] }>(`/name-generator/pools${qs ? `?${qs}` : ""}`);
    },
    generate: (data: GenerateNamesRequest) =>
        fetchJSON<GenerateNamesResponse>("/name-generator/generate", { method: "POST", body: JSON.stringify(data) }),
    markUsed: (data: MarkNameUsedRequest) =>
        fetchJSON<{ usedName: UsedName }>("/name-generator/use", { method: "POST", body: JSON.stringify(data) }),
    listUsed: (storyId: string) => fetchJSON<{ usedNames: UsedName[] }>(`/name-generator/used?storyId=${encodeURIComponent(storyId)}`),
    // JSON pack — one or more complete pool definitions, no extra fields needed beyond scope.
    importJson: (file: File, scope: { level: ImportLevel; storyId?: string }) =>
        uploadFile<ImportPoolsResponse>("/name-generator/import", file, undefined, {
            format: "json",
            level: scope.level,
            ...(scope.storyId ? { storyId: scope.storyId } : {})
        }),
    // CSV — names/tier list only, pool metadata supplied separately since the file doesn't carry it.
    importCsv: (file: File, scope: { level: ImportLevel; storyId?: string }, meta: CsvImportMeta) =>
        uploadFile<ImportPoolsResponse>("/name-generator/import", file, undefined, {
            format: "csv",
            level: scope.level,
            ...(scope.storyId ? { storyId: scope.storyId } : {}),
            poolName: meta.poolName,
            kind: meta.kind,
            region: meta.region,
            ...(meta.gender ? { gender: meta.gender } : {}),
            ...(meta.eraStart !== undefined ? { eraStart: String(meta.eraStart) } : {}),
            ...(meta.eraEnd !== undefined ? { eraEnd: String(meta.eraEnd) } : {})
        }),
    // NG7 — favorites + per-story sticky filter defaults.
    listFavorites: (storyId: string) => fetchJSON<{ favorites: NameFavorite[] }>(`/name-generator/favorites?storyId=${encodeURIComponent(storyId)}`),
    addFavorite: (data: AddFavoriteRequest) =>
        fetchJSON<{ favorite: NameFavorite }>("/name-generator/favorites", { method: "POST", body: JSON.stringify(data) }),
    removeFavorite: (storyId: string, id: string) =>
        fetchJSON<{ success: boolean }>(`/name-generator/favorites/${id}?storyId=${encodeURIComponent(storyId)}`, { method: "DELETE" }),
    getDefaults: (storyId: string) =>
        fetchJSON<{ defaults: StoryNameDefaults | null }>(`/name-generator/defaults?storyId=${encodeURIComponent(storyId)}`),
    saveDefaults: (data: SaveStoryNameDefaultsRequest) =>
        fetchJSON<{ defaults: StoryNameDefaults }>("/name-generator/defaults", { method: "PUT", body: JSON.stringify(data) }),
    // Region packs (NP0-NP5) — vendored catalog, browse/install/uninstall in-app.
    listPacks: (storyId?: string) =>
        fetchJSON<{ packs: NamePackManifestEntry[] }>(`/name-generator/packs${storyId ? `?storyId=${encodeURIComponent(storyId)}` : ""}`),
    installPack: (packId: string, data: InstallPackRequest) =>
        fetchJSON<InstallPackResult>(`/name-generator/packs/${encodeURIComponent(packId)}/install`, { method: "POST", body: JSON.stringify(data) }),
    uninstallPack: (packId: string, data: UninstallPackRequest) =>
        fetchJSON<{ poolsRemoved: number }>(`/name-generator/packs/${encodeURIComponent(packId)}/uninstall`, {
            method: "POST",
            body: JSON.stringify(data)
        })
};
