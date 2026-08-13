import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { agentJobsApi, storyTimelineApi } from "@/services/api/client";
import type { PinLinkType, StoryTimeline, TimelineMembership, TimelinePin } from "@/types/storyTimeline";

// Story Timeline (T6, TL0-TL6, docs/Story_Timeline_Design.md) — mirrors
// story-maps/hooks/useStoryMapsQuery.ts's key-factory/invalidate pattern.
export const storyTimelineKeys = {
    all: ["storyTimelines"] as const,
    timelines: (storyId: string) => [...storyTimelineKeys.all, "timelines", storyId] as const,
    pins: (storyId: string) => [...storyTimelineKeys.all, "pins", storyId] as const,
    pinForLink: (storyId: string, linkType: PinLinkType, linkId: string) =>
        [...storyTimelineKeys.all, "pinForLink", storyId, linkType, linkId] as const,
    pendingPins: (storyId: string) => [...storyTimelineKeys.all, "pendingPins", storyId] as const,
    suggestSettings: (storyId: string) => [...storyTimelineKeys.all, "suggestSettings", storyId] as const
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

// TL5 — board switcher's "New timeline" action.
export const useCreateTimelineMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (title: string) => storyTimelineApi.createTimeline(storyId, title),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.timelines(storyId) });
            toast.success("Timeline created");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to create timeline")
    });
};

export const useUpdateTimelineMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof storyTimelineApi.updateTimeline>[1] }) =>
            storyTimelineApi.updateTimeline(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyTimelineKeys.timelines(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline")
    });
};

// TL5 — deleting a named timeline (spine delete is blocked server-side). Also invalidates pins
// (deleteTimeline may have re-homed exclusively-owned pins onto Spine).
export const useDeleteTimelineMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyTimelineApi.deleteTimeline(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.timelines(storyId) });
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) });
            toast.success("Timeline deleted");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete timeline")
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

// TL5 — PinMembershipPopover.tsx's per-timeline checkbox/lane control. No dedicated success toast
// (the popover itself gives immediate visual feedback via checkbox state; a toast per checkbox
// click would be noisy).
export const useAddMembershipMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ pinId, timelineId, laneId }: { pinId: string; timelineId: string; laneId?: string | null }) =>
            storyTimelineApi.addMembership(pinId, timelineId, laneId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline placement")
    });
};

export const useRemoveMembershipMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ pinId, timelineId }: { pinId: string; timelineId: string }) => storyTimelineApi.removeMembership(pinId, timelineId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) }),
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline placement")
    });
};

// TL11B — pending pin review, mirrors useStoryGraphQuery.ts's usePendingEdgesQuery/
// useApproveEdgeMutation/useRejectEdgeMutation/useSuggestGraphEdgesMutation exactly.

export const usePendingPinsQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyTimelineKeys.pendingPins(storyId ?? ""),
        queryFn: () => storyTimelineApi.listPendingPins(storyId as string),
        enabled: !!storyId
    });

export const useApprovePinMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyTimelineApi.approvePin(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pins(storyId) });
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pendingPins(storyId) });
            toast.success("Timeline pin approved");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to approve timeline pin")
    });
};

export const useRejectPinMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyTimelineApi.rejectPin(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pendingPins(storyId) });
            toast.success("Timeline pin rejected");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to reject timeline pin")
    });
};

// Manually enqueues timeline_suggest_pins for the whole story — fire-and-forget enqueue, no job
// polling; the Pending tab's own query is what the user checks afterward.
export const useSuggestTimelinePinsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId: string) => agentJobsApi.enqueue({ jobType: "timeline_suggest_pins", storyId }),
        onSuccess: (job, storyId) => {
            queryClient.invalidateQueries({ queryKey: storyTimelineKeys.pendingPins(storyId) });
            queryClient.invalidateQueries({ queryKey: ["agentJobs"] });
            toast.success(
                job.status === "running" || job.status === "queued"
                    ? "Suggesting timeline pins from this story's lorebook and notes…"
                    : "A pin-suggestion job for this story already ran"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue timeline pin suggestions")
    });
};

// TL13 — story-side context controls for timeline_suggest_pins. Get is get-or-create server-side,
// so this always resolves to a value (no "not found" branch needed by callers).
export const useTimelineSuggestSettingsQuery = (storyId: string | null) =>
    useQuery({
        queryKey: storyTimelineKeys.suggestSettings(storyId ?? ""),
        queryFn: () => storyTimelineApi.getSuggestSettings(storyId as string),
        enabled: !!storyId
    });

export const useUpdateTimelineSuggestSettingsMutation = (storyId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Parameters<typeof storyTimelineApi.updateSuggestSettings>[1]) =>
            storyTimelineApi.updateSuggestSettings(storyId, data),
        onSuccess: updated => queryClient.setQueryData(storyTimelineKeys.suggestSettings(storyId), updated),
        onError: (error: Error) => toast.error(error.message || "Failed to update timeline suggest settings")
    });
};

export type { StoryTimeline, TimelineMembership, TimelinePin };
