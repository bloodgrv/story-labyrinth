import { useEffect } from "react";
import { TimelineBoard } from "@/features/story-timeline/components/TimelineBoard";
import { useTimelinePinsQuery, useTimelinesQuery } from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Story Timeline (T6, TL1, docs/Story_Timeline_Design.md) — top-level tool, mirrors MapsTool.tsx's
// shape. TL0-TL4 scope: a story has exactly one usable board (the spine) — ensureSpineTimeline
// (server) guarantees it exists on first fetch, so no create/empty-state handling is needed here
// the way Maps' multi-document list view needs it.
export function TimelineTool() {
    const { currentStoryId, pendingTimelineFocusPinId, setPendingTimelineFocusPinId } = useStoryContext();
    const { data: timelines, isLoading: timelinesLoading } = useTimelinesQuery(currentStoryId);
    const { data: pins = [], isLoading: pinsLoading } = useTimelinePinsQuery(currentStoryId);

    // "Place on timeline" elsewhere / a pin's own re-open — consume once on arrival, same pattern
    // MapsTool.tsx uses for pendingMapId. TL0-TL4 scope has no per-pin scroll/highlight target yet
    // (single board, pin cards aren't individually addressable in the DOM) — just clears the
    // pointer so navigating here again later doesn't replay a stale focus request.
    useEffect(() => {
        if (pendingTimelineFocusPinId) setPendingTimelineFocusPinId(null);
    }, [pendingTimelineFocusPinId, setPendingTimelineFocusPinId]);

    if (!currentStoryId) return null;
    if (timelinesLoading || pinsLoading)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">Loading timeline...</p>
            </div>
        );

    const spine = timelines?.find(t => t.isDefault);
    if (!spine) return null;

    return <TimelineBoard storyId={currentStoryId} timeline={spine} pins={pins} />;
}
