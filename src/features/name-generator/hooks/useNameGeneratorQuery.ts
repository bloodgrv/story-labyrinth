import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { nameGeneratorApi } from "@/services/api/client";
import type {
    AddFavoriteRequest,
    CsvImportMeta,
    GenerateNamesRequest,
    ImportLevel,
    MarkNameUsedRequest,
    NamePoolGender,
    NamePoolKind,
    SaveStoryNameDefaultsRequest
} from "@/types/nameGenerator";

// NG2 — react-query layer over nameGeneratorApi, same shape as useProjectMemoryQuery.ts.

export const nameGeneratorKeys = {
    all: ["nameGenerator"] as const,
    pools: (params?: { storyId?: string; kind?: NamePoolKind; gender?: NamePoolGender; region?: string }) =>
        [...nameGeneratorKeys.all, "pools", params ?? {}] as const,
    used: (storyId: string) => [...nameGeneratorKeys.all, "used", storyId] as const,
    favorites: (storyId: string) => [...nameGeneratorKeys.all, "favorites", storyId] as const,
    defaults: (storyId: string) => [...nameGeneratorKeys.all, "defaults", storyId] as const
};

export const usePoolsQuery = (params: { storyId: string; kind?: NamePoolKind; gender?: NamePoolGender; region?: string }) =>
    useQuery({
        queryKey: nameGeneratorKeys.pools(params),
        queryFn: () => nameGeneratorApi.listPools(params),
        enabled: Boolean(params.storyId)
    });

// Used-names ledger is read here purely for display (the "already used in this story" list) —
// /generate itself already excludes these server-side, so no client-side filtering depends on it.
export const useUsedNamesQuery = (storyId: string) =>
    useQuery({
        queryKey: nameGeneratorKeys.used(storyId),
        queryFn: () => nameGeneratorApi.listUsed(storyId),
        enabled: Boolean(storyId)
    });

// No query invalidation on success — generate is read-only (never writes usedNames, see
// nameGeneratorService.ts's generateNames doc comment), so there's nothing stale to refetch.
export const useGenerateNamesMutation = () =>
    useMutation({
        mutationFn: (data: GenerateNamesRequest) => nameGeneratorApi.generate(data),
        onError: (error: Error) => toast.error(error.message || "Failed to generate names")
    });

export const useMarkNameUsedMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: MarkNameUsedRequest) => nameGeneratorApi.markUsed(data),
        onSuccess: (_result, variables) => {
            queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.used(variables.storyId) });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to mark name as used")
    });
};

const importSuccessToast = (queryClient: ReturnType<typeof useQueryClient>) => ({
    onSuccess: (result: { pools: unknown[]; namesImported: number; duplicatesSkipped: number }) => {
        queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.all });
        const dupeNote = result.duplicatesSkipped > 0 ? ` (${result.duplicatesSkipped} duplicate name(s) skipped)` : "";
        toast.success(`Imported ${result.pools.length} pool(s), ${result.namesImported} name(s)${dupeNote}`);
    },
    onError: (error: Error) => toast.error(error.message || "Import failed")
});

export const useImportJsonMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, scope }: { file: File; scope: { level: ImportLevel; storyId?: string } }) =>
            nameGeneratorApi.importJson(file, scope),
        ...importSuccessToast(queryClient)
    });
};

export const useImportCsvMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, scope, meta }: { file: File; scope: { level: ImportLevel; storyId?: string }; meta: CsvImportMeta }) =>
            nameGeneratorApi.importCsv(file, scope, meta),
        ...importSuccessToast(queryClient)
    });
};

// ── Favorites (NG7) ─────────────────────────────────────────────────────────────────

export const useFavoritesQuery = (storyId: string) =>
    useQuery({
        queryKey: nameGeneratorKeys.favorites(storyId),
        queryFn: () => nameGeneratorApi.listFavorites(storyId),
        enabled: Boolean(storyId)
    });

export const useAddFavoriteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: AddFavoriteRequest) => nameGeneratorApi.addFavorite(data),
        onSuccess: (_result, variables) => queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.favorites(variables.storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to add favorite")
    });
};

export const useRemoveFavoriteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, id }: { storyId: string; id: string }) => nameGeneratorApi.removeFavorite(storyId, id),
        onSuccess: (_result, variables) => queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.favorites(variables.storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to remove favorite")
    });
};

// ── Story name defaults (NG7) ────────────────────────────────────────────────────────

export const useStoryDefaultsQuery = (storyId: string) =>
    useQuery({
        queryKey: nameGeneratorKeys.defaults(storyId),
        queryFn: () => nameGeneratorApi.getDefaults(storyId),
        enabled: Boolean(storyId)
    });

// No toast/invalidation — this fires silently after every generate (see NameGeneratorPanel), a
// visible "saved!" toast for a background sticky-preference write would just be noise.
export const useSaveStoryDefaultsMutation = () => useMutation({ mutationFn: (data: SaveStoryNameDefaultsRequest) => nameGeneratorApi.saveDefaults(data) });
