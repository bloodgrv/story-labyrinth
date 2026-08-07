import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { storyMapsApi } from "@/services/api/client";
import type { StoryMapDocument } from "@/types/storyMaps";

// Maps v2 (MV1, docs/Maps_V2_Sketch_Design.md) — sketch-canvas documents. Deliberately verbose
// "StoryMapDocument(s)" naming throughout this module (not just "StoryMap") to stay unambiguous
// next to features/story-map/hooks/useStoryMapQuery.ts, the L3 spatial-graph module this
// supersedes in the UI — different feature dir, different hook names, easy to tell apart at a
// glance in imports/greps.
export const storyMapDocumentKeys = {
    all: ["storyMapDocuments"] as const,
    list: (storyId: string) => [...storyMapDocumentKeys.all, "list", storyId] as const,
    detail: (id: string) => [...storyMapDocumentKeys.all, "detail", id] as const,
    byLocation: (storyId: string, locationId: string) => [...storyMapDocumentKeys.all, "byLocation", storyId, locationId] as const
};

export const useStoryMapDocumentsQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyMapDocumentKeys.list(storyId ?? ""),
        queryFn: () => storyMapsApi.list(storyId as string),
        enabled: !!storyId
    });

export const useStoryMapDocumentQuery = (id: string | null) =>
    useQuery({
        queryKey: storyMapDocumentKeys.detail(id ?? ""),
        queryFn: () => storyMapsApi.get(id as string),
        enabled: !!id
    });

// MV3 — the "Open map" affordance on a location lore entry (RawEntryFields.tsx's OpenMapButton)
// needs to know whether a map already links to this location before deciding whether to open one
// or offer to create one.
export const useMapForLocationQuery = (storyId: string | null, locationId: string | null) =>
    useQuery({
        queryKey: storyMapDocumentKeys.byLocation(storyId ?? "", locationId ?? ""),
        queryFn: () => storyMapsApi.getByLocation(storyId as string, locationId as string),
        enabled: !!storyId && !!locationId
    });

// MV5 — Accept for a ```map-sketch-proposal fence (ChatInterface.tsx's handleAcceptMapSketch).
// Reuses the exact same "find-or-create by location" logic OpenMapButton.tsx already established
// for MV3, just as a single awaitable mutation instead of a click handler — the caller doesn't
// care whether a map already existed, only that one now does and it knows the id.
export const useResolveOrCreateMapForLocationMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ locationId, title }: { locationId: string; title: string }) => {
            const existing = await storyMapsApi.getByLocation(storyId, locationId);
            return existing ?? storyMapsApi.create(storyId, { title, locationId });
        },
        onSuccess: (map, variables) => {
            queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.list(storyId) });
            queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.byLocation(storyId, variables.locationId) });
            queryClient.setQueryData(storyMapDocumentKeys.detail(map.id), map);
        },
        onError: (error: Error) => toast.error(error.message || "Failed to resolve this location's map")
    });
};

export const useCreateStoryMapDocumentMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { title: string; locationId?: string | null }) => storyMapsApi.create(storyId, data),
        onSuccess: (_created, variables) => {
            queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.list(storyId) });
            if (variables.locationId) queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.byLocation(storyId, variables.locationId) });
            toast.success("Map created");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to create map")
    });
};

export const useUpdateStoryMapDocumentMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { title?: string; locationId?: string | null; sceneJson?: unknown } }) =>
            storyMapsApi.update(id, data),
        onSuccess: (updated, variables) => {
            queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.list(storyId) });
            queryClient.setQueryData(storyMapDocumentKeys.detail(updated.id), updated);
            // Only relevant when a relink actually happened (not every scene autosave tick) —
            // covers both the new and, if changed, the previous location's "Open map" state.
            if (variables.data.locationId !== undefined && updated.locationId)
                queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.byLocation(storyId, updated.locationId) });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to update map")
    });
};

export const useDeleteStoryMapDocumentMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyMapsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyMapDocumentKeys.list(storyId) });
            toast.success("Map deleted");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete map")
    });
};

export type { StoryMapDocument };
