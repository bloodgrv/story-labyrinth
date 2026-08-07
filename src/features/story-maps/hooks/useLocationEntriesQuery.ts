import { useQuery } from "@tanstack/react-query";
import { lorebookApi } from "@/services/api/client";

// Maps v2 — resolves a map's linked location entry for display (MapDetailPanel's badge, MV1/MV2).
export const useLocationEntryQuery = (locationId: string | null) =>
    useQuery({
        queryKey: ["lorebookEntry", locationId ?? ""],
        queryFn: () => lorebookApi.getById(locationId as string),
        enabled: !!locationId
    });

// MV3 — this story's location-category entries, for the "link to a location" picker (
// NewMapDialog.tsx) and for resolving real names in the Maps list (MapsListPanel.tsx) instead of
// a generic "Location-linked" badge.
export const useLocationEntriesQuery = (storyId: string | null) =>
    useQuery({
        queryKey: ["lorebookEntries", "location", storyId ?? ""],
        queryFn: () => lorebookApi.getByCategory(storyId as string, "location"),
        enabled: !!storyId
    });
