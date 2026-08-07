import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { PendingPinsPanel } from "@/features/story-timeline/components/PendingPinsPanel";
import { TimelineBoard } from "@/features/story-timeline/components/TimelineBoard";
import { TimelineSwitcher } from "@/features/story-timeline/components/TimelineSwitcher";
import {
    usePendingPinsQuery,
    useSuggestTimelinePinsMutation,
    useTimelinePinsQuery,
    useTimelinesQuery
} from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";

const ACTIVE_TIMELINE_KEY = (storyId: string) => `timeline-active-id-${storyId}`;

// Story Timeline (T6, TL1/TL5, docs/Story_Timeline_Design.md) — top-level tool, mirrors
// MapsTool.tsx's shape. TL5 — a story can now have multiple boards (Spine + named timelines);
// `activeTimelineId` tracks which one is showing, localStorage-persisted per story (same
// per-story-key convention StoryContext.tsx's own CHAPTER_KEY uses), defaulting to Spine.
export function TimelineTool() {
    const { currentStoryId, pendingTimelineFocusPinId, setPendingTimelineFocusPinId } = useStoryContext();
    const { data: timelines, isLoading: timelinesLoading } = useTimelinesQuery(currentStoryId);
    const { data: pins = [], isLoading: pinsLoading } = useTimelinePinsQuery(currentStoryId);
    const [activeTimelineId, setActiveTimelineIdState] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"board" | "pending">("board");
    const isOwner = useIsOwner();
    const pendingQuery = usePendingPinsQuery(currentStoryId);
    const suggestMutation = useSuggestTimelinePinsMutation();
    const pendingCount = pendingQuery.data?.pending.length ?? 0;

    // "Place on timeline" elsewhere / a pin's own re-open — consume once on arrival, same pattern
    // MapsTool.tsx uses for pendingMapId. TL0-TL4 scope has no per-pin scroll/highlight target yet
    // (pin cards aren't individually addressable in the DOM) — just clears the pointer so
    // navigating here again later doesn't replay a stale focus request.
    useEffect(() => {
        if (pendingTimelineFocusPinId) setPendingTimelineFocusPinId(null);
    }, [pendingTimelineFocusPinId, setPendingTimelineFocusPinId]);

    // Restore the last-viewed timeline for this story, falling back to Spine once timelines load —
    // covers both first visit (no stored id yet) and a stored id whose timeline got deleted since.
    useEffect(() => {
        if (!currentStoryId || !timelines?.length) return;
        const stored = localStorage.getItem(ACTIVE_TIMELINE_KEY(currentStoryId));
        const validStored = stored && timelines.some(t => t.id === stored) ? stored : null;
        setActiveTimelineIdState(validStored ?? timelines.find(t => t.isDefault)?.id ?? timelines[0].id);
    }, [currentStoryId, timelines]);

    const setActiveTimelineId = (id: string) => {
        setActiveTimelineIdState(id);
        if (currentStoryId) localStorage.setItem(ACTIVE_TIMELINE_KEY(currentStoryId), id);
    };

    if (!currentStoryId) return null;
    if (timelinesLoading || pinsLoading || !activeTimelineId)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">Loading timeline...</p>
            </div>
        );

    const activeTimeline = timelines?.find(t => t.id === activeTimelineId);
    if (!activeTimeline || !timelines) return null;

    const pinsForActiveTimeline = pins.filter(pin => pin.memberships.some(m => m.timelineId === activeTimelineId));

    return (
        <div className="h-full flex flex-col">
            <div className="px-4 pt-4 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <TimelineSwitcher
                        storyId={currentStoryId}
                        timelines={timelines}
                        activeTimelineId={activeTimelineId}
                        onSelect={setActiveTimelineId}
                    />
                    <Tabs value={viewMode} onValueChange={v => setViewMode(v as "board" | "pending")}>
                        <TabsList>
                            <TabsTrigger value="board">Board</TabsTrigger>
                            <TabsTrigger value="pending">Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                {isOwner && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={suggestMutation.isPending}
                        onClick={() => suggestMutation.mutate(currentStoryId)}
                        title="Propose new timeline pins from this story's lorebook entries and notes — reviewed in the Pending tab"
                    >
                        {suggestMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Suggest pins
                    </Button>
                )}
            </div>
            <div className="flex-1 min-h-0">
                {viewMode === "pending" ? (
                    <PendingPinsPanel storyId={currentStoryId} />
                ) : (
                    <TimelineBoard storyId={currentStoryId} timeline={activeTimeline} pins={pinsForActiveTimeline} />
                )}
            </div>
        </div>
    );
}
