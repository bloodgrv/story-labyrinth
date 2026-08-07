import type { PinLinkType, PinWhenKind, StoryTimeline, TimelineOrientation, TimelinePin } from "@/types/storyTimeline";
import { fetchJSON } from "./apiFactory";

// Story Timeline (T6, TL0-TL4, docs/Story_Timeline_Design.md) — mirrors storyMapsClient.ts's
// style/naming.
export const storyTimelineApi = {
    listTimelines: (storyId: string) => fetchJSON<StoryTimeline[]>(`/stories/${storyId}/timelines`),
    updateTimeline: (
        id: string,
        data: Partial<{
            title: string;
            orientation: TimelineOrientation;
            storyStartMode: StoryTimeline["storyStartMode"];
            storyStartChapterId: string | null;
            storyStartPinId: string | null;
            storyStartManualWhenJson: StoryTimeline["storyStartManualWhenJson"];
        }>
    ) => fetchJSON<StoryTimeline>(`/timelines/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

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
    deletePin: (id: string) => fetchJSON<{ success: boolean }>(`/timeline-pins/${id}`, { method: "DELETE" })
};
