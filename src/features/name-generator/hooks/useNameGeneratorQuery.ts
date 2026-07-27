import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { nameGeneratorApi } from "@/services/api/client";
import type {
    AddFavoriteRequest,
    CsvImportMeta,
    GenerateNamesRequest,
    ImportLevel,
    InstallPackRequest,
    InstallPackResult,
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
    defaults: (storyId: string) => [...nameGeneratorKeys.all, "defaults", storyId] as const,
    packs: (storyId?: string) => [...nameGeneratorKeys.all, "packs", storyId ?? null] as const
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

// ── Region packs (NP0-NP5) ───────────────────────────────────────────────────────────

export const usePacksQuery = (storyId?: string) =>
    useQuery({
        queryKey: nameGeneratorKeys.packs(storyId),
        queryFn: () => nameGeneratorApi.listPacks(storyId)
    });

export const useInstallPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ packId, data }: { packId: string; data: InstallPackRequest }) => nameGeneratorApi.installPack(packId, data),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.all });
            const dupeNote = result.duplicatesSkipped > 0 ? ` (${result.duplicatesSkipped} duplicate name(s) skipped)` : "";
            toast.success(
                result.pools.length > 0
                    ? `Installed ${result.pools.length} pool(s), ${result.namesImported} name(s)${dupeNote}`
                    : "Already installed — no new pools to add"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to install pack")
    });
};

// NP3 — bulk install a preset (curated group of packIds, e.g. "European"). Reuses the same
// idempotent single-pack install endpoint per pack (Promise.allSettled, not Promise.all, so one
// pack failing doesn't lose the results of the others) rather than a new bulk server route —
// installing N packs is just N calls to a primitive that already exists and already handles
// idempotency/replace itself. One aggregate toast instead of N individual ones.
export const useInstallPresetMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ packIds, data }: { packIds: string[]; data: InstallPackRequest }) => {
            const settled = await Promise.allSettled(packIds.map(packId => nameGeneratorApi.installPack(packId, data)));
            const succeeded = settled
                .filter((r): r is PromiseFulfilledResult<InstallPackResult> => r.status === "fulfilled")
                .map(r => r.value);
            const failedCount = settled.length - succeeded.length;
            return { succeeded, failedCount };
        },
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.all });
            const newPools = result.succeeded.reduce((sum, r) => sum + r.pools.length, 0);
            const namesImported = result.succeeded.reduce((sum, r) => sum + r.namesImported, 0);
            const alreadyInstalled = result.succeeded.filter(r => r.pools.length === 0).length;
            const parts: string[] = [];
            if (newPools > 0) parts.push(`${newPools} new pool(s), ${namesImported} name(s)`);
            if (alreadyInstalled > 0) parts.push(`${alreadyInstalled} pack(s) already installed`);
            if (result.failedCount > 0) parts.push(`${result.failedCount} pack(s) failed`);
            const message = parts.join(" · ") || "Nothing to install";
            if (result.failedCount > 0) toast.warning(message);
            else toast.success(message);
        },
        onError: (error: Error) => toast.error(error.message || "Failed to install preset")
    });
};

export const useUninstallPackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ packId, data }: { packId: string; data: { level: ImportLevel; storyId?: string } }) =>
            nameGeneratorApi.uninstallPack(packId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: nameGeneratorKeys.all });
            toast.success("Pack uninstalled");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to uninstall pack")
    });
};
