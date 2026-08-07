import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { storyTimelineApi } from "@/services/api/client";
import type { PinLinkType, StoryTimeline, TimelinePin } from "@/types/storyTimeline";

// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — mirrors
// story-maps/hooks/useStoryMapsQuery.ts's key-factory/invalidate pattern.
export const storyTimelineKeys = {
    all: ["storyTimelines"] as const,
    timelines: (storyId: string) => [...storyTimelineKeys.all, "timelines", storyId] as const,
    pins: (storyId: string) => [...storyTimelineKeys.all, "pins", storyId] as const,
    pinForLink: (storyId: string, linkType: PinLinkType, linkId: string) =>
        [...storyTimelineKeys.all, "pinForLink", storyId, linkType, linkId] as const
};

export const useTimelinesQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyTimelineKeys.timelines(storyId ?? ""),
        queryFn: () => storyTimelineApi.listTimelines(storyId as string),
        enabled: !!storyId
    });

export const useTimelinePinsQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyTimelineKeys.pins(storyId ?? ""),
        queryFn: () => storyTimelineApi.listPins(storyId as string),
        enabled: !!storyId
    });

// "Place on timeline" (TL3) — lets the button decide "Place on timeline" vs "Edit placement"
// before the writer even opens the dialog.
export const usePinForLinkQuery = (storyId: string | null, linkType: PinLinkType | null, linkId: string | null) =>
    useQuery({
        queryKey: storyTimelineKeys.pinForLink(storyId ?? "", linkType ?? "chapter", linkId ?? ""),
        queryFn: () => storyTimelineApi.getPinForLink(storyId as string, linkType as PinLinkType, linkId as string),
        enabled: !!storyId && !!linkType && !!linkId
    });

export const useUpdateTimelineMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof storyTimelineApi.updateTimeline>[1] }) =>
            storyTimelineApi.updateTimeline(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyTimelineKeys.timelines(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline")
    });
};

export const useCreatePinMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Parameters<typeof storyTimelineApi.createPin>[1]) => storyTimelineApi.createPin(storyId, data),
        onSuccess: (created, variables) => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) });
            if (variables.linkType && variables.linkId)
                queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pinForLink(storyId, variables.linkType, variables.linkId) });
            toast.success("Placed on timeline");
            return created;
        },
        onError: (error: Error) => toast.error(error.message || "Failed to place on timeline")
    });
};

export const useUpdatePinMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof storyTimelineApi.updatePin>[1] }) =>
            storyTimelineApi.updatePin(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) });
            toast.success("Timeline pin updated");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline pin")
    });
};

export const useDeletePinMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyTimelineApi.deletePin(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) });
            toast.success("Timeline pin removed");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to remove timeline pin")
    });
};

export type { StoryTimeline, TimelinePin };
