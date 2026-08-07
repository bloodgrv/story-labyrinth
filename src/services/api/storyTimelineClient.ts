import type { PinLinkType, PinWhenKind, StoryTimeline, TimelineMembership, TimelineOrientation, TimelinePin } from "@/types/storyTimeline";
import { fetchJSON } from "./apiFactory";

// Story Timeline (T6, TL0-TL6, docs/Story_Timeline_Design.md) — mirrors storyMapsClient.ts's
// style/naming.
export const storyTimelineApi = {
    listTimelines: (storyId: string) => fetchJSON<StoryTimeline[]>(`/stories/${storyId}/timelines`),
    createTimeline: (storyId: string, title: string) =>
        fetchJSON<StoryTimeline>(`/stories/${storyId}/timelines`, { method: "POST", body: JSON.stringify({ title }) }),
    updateTimeline: (
        id: string,
        data: Partial<{
            title: string;
            orientation: TimelineOrientation;
            swimlanesEnabled: boolean;
            storyStartMode: StoryTimeline["storyStartMode"];
            storyStartChapterId: string | null;
            storyStartPinId: string | null;
            storyStartManualWhenJson: StoryTimeline["storyStartManualWhenJson"];
        }>
    ) => fetchJSON<StoryTimeline>(`/timelines/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteTimeline: (id: string) => fetchJSON<{ success: boolean }>(`/timelines/${id}`, { method: "DELETE" }),

    listPins: (storyId: string) => fetchJSON<TimelinePin[]>(`/stories/${storyId}/timeline-pins`),
    getPinForLink: (storyId: string, linkType: PinLinkType, linkId: string) =>
        fetchJSON<TimelinePin | null>(`/stories/${storyId}/timeline-pins/by-link/${linkType}/${linkId}`),
    createPin: (
        storyId: string,
        data: {
            title: string;
            blurb?: string | null;
            whenKind: PinWhenKind;
            relativeOffsetYears?: number | null;
            fuzzyPhrase?: string | null;
            civilDate?: string | null;
            linkType?: PinLinkType | null;
            linkId?: string | null;
            timelineId?: string;
        }
    ) => fetchJSON<TimelinePin>(`/stories/${storyId}/timeline-pins`, { method: "POST", body: JSON.stringify(data) }),
    updatePin: (
        id: string,
        data: Partial<{
            title: string;
            blurb: string | null;
            whenKind: PinWhenKind;
            relativeOffsetYears: number | null;
            fuzzyPhrase: string | null;
            civilDate: string | null;
            manualOrder: number;
        }>
    ) => fetchJSON<TimelinePin>(`/timeline-pins/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deletePin: (id: string) => fetchJSON<{ success: boolean }>(`/timeline-pins/${id}`, { method: "DELETE" }),

    addMembership: (pinId: string, timelineId: string, laneId?: string | null) =>
        fetchJSON<TimelineMembership>(`/timeline-pins/${pinId}/memberships`, { method: "POST", body: JSON.stringify({ timelineId, laneId }) }),
    removeMembership: (pinId: string, timelineId: string) =>
        fetchJSON<{ success: boolean }>(`/timeline-pins/${pinId}/memberships/${timelineId}`, { method: "DELETE" }),

    // TL11B — pending review, mirrors storyGraphClient.ts's own pending/approve/reject shape.
    listPendingPins: (storyId: string) => fetchJSON<{ pending: TimelinePin[] }>(`/stories/${storyId}/timeline-pins/pending`),
    approvePin: (id: string) => fetchJSON<TimelinePin>(`/timeline-pins/${id}/approve`, { method: "POST" }),
    rejectPin: (id: string) => fetchJSON<TimelinePin>(`/timeline-pins/${id}/reject`, { method: "POST" })
};
