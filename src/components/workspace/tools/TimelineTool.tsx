import { Inbox, Loader2, SlidersHorizontal, Sparkles, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { SimpleSheet } from "@/components/SimpleSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { PendingPinsPanel } from "@/features/story-timeline/components/PendingPinsPanel";
import { TimelineBoard } from "@/features/story-timeline/components/TimelineBoard";
import { TimelineSuggestContextPanel } from "@/features/story-timeline/components/TimelineSuggestContextPanel";
import { TimelineSwitcher } from "@/features/story-timeline/components/TimelineSwitcher";
import {
    usePendingPinsQuery,
    useSuggestTimelinePinsMutation,
    useTimelinePinsQuery,
    useTimelinesQuery,
    useUpdateTimelineMutation
} from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";

const ACTIVE_TIMELINE_KEY = (storyId: string) => `timeline-active-id-${storyId}`;

type RailPanel = "context" | "pending" | null;

// Story Timeline (T6, TL1/TL5, docs/Story_Timeline_Design.md) — top-level tool, mirrors
// MapsTool.tsx's shape. TL5 — a story can now have multiple boards (Spine + named timelines);
// `activeTimelineId` tracks which one is showing, localStorage-persisted per story (same
// per-story-key convention StoryContext.tsx's own CHAPTER_KEY uses), defaulting to Spine.
export function TimelineTool() {
    const { currentStoryId, pendingTimelineFocusPinId, setPendingTimelineFocusPinId } = useStoryContext();
    const { data: timelines, isLoading: timelinesLoading } = useTimelinesQuery(currentStoryId);
    const { data: pins = [], isLoading: pinsLoading } = useTimelinePinsQuery(currentStoryId);
    const [activeTimelineId, setActiveTimelineIdState] = useState<string | null>(null);
    const [openPanel, setOpenPanel] = useState<RailPanel>(null);
    const isOwner = useIsOwner();
    const pendingQuery = usePendingPinsQuery(currentStoryId);
    const suggestMutation = useSuggestTimelinePinsMutation();
    const updateTimelineMutation = useUpdateTimelineMutation(currentStoryId ?? "");
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
    const togglePanel = (panel: RailPanel) => setOpenPanel(current => (current === panel ? null : panel));

    return (
        <div className="h-full flex flex-col">
            <div className="px-4 pt-4 flex items-center justify-between flex-wrap gap-2">
                <TimelineSwitcher
                    storyId={currentStoryId}
                    timelines={timelines}
                    activeTimelineId={activeTimelineId}
                    onSelect={setActiveTimelineId}
                />
            </div>
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0">
                    <TimelineBoard storyId={currentStoryId} timeline={activeTimeline} pins={pinsForActiveTimeline} />
                </div>
                {/* TL13/TL14 — same icon-rail + slide-out-Sheet shell every other tool uses
                    (EditorToolsPanel.tsx/ChatToolsRail.tsx). Suggest pins/Swimlanes are plain
                    onClick actions (no sheet of their own, same "escape hatch" ChatToolsRail
                    already supports) rather than togglePanel entries; Context/Pending share this
                    rail's single-open-Sheet slot like every other host's icon column. */}
                <aside className="hidden md:flex flex-col border-l bg-muted/20 w-12">
                    <div className="flex-1 py-2 space-y-2">
                        {isOwner && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mx-2 justify-center px-0 w-8"
                                disabled={suggestMutation.isPending}
                                onClick={() => suggestMutation.mutate(currentStoryId)}
                                title="Suggest pins — propose new timeline pins from this story's lorebook, notes, and picked chapters"
                            >
                                {suggestMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4 shrink-0" />
                                )}
                            </Button>
                        )}
                        <Button
                            variant={openPanel === "pending" ? "default" : "outline"}
                            size="sm"
                            className="mx-2 relative justify-center px-0 w-8"
                            onClick={() => togglePanel("pending")}
                            title="Pending — AI-suggested pins awaiting review"
                        >
                            <Inbox className="h-4 w-4 shrink-0" />
                            {pendingCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                    {pendingCount}
                                </span>
                            )}
                        </Button>
                        <Button
                            variant={activeTimeline.swimlanesEnabled ? "default" : "outline"}
                            size="sm"
                            className={cn("mx-2 justify-center px-0 w-8", updateTimelineMutation.isPending && "opacity-60")}
                            disabled={updateTimelineMutation.isPending}
                            onClick={() =>
                                updateTimelineMutation.mutate({
                                    id: activeTimeline.id,
                                    data: { swimlanesEnabled: !activeTimeline.swimlanesEnabled }
                                })
                            }
                            title={activeTimeline.swimlanesEnabled ? "Swimlanes on — click to turn off" : "Swimlanes off — click to turn on"}
                        >
                            <Waves className="h-4 w-4 shrink-0" />
                        </Button>
                        <Button
                            variant={openPanel === "context" ? "default" : "outline"}
                            size="sm"
                            className="mx-2 justify-center px-0 w-8"
                            onClick={() => togglePanel("context")}
                            title="Suggest Pins Context"
                        >
                            <SlidersHorizontal className="h-4 w-4 shrink-0" />
                        </Button>
                    </div>
                </aside>
            </div>

            <SimpleSheet
                open={openPanel === "context"}
                onClose={() => setOpenPanel(null)}
                title="Suggest Pins Context"
                description={'What "Suggest pins" reads from this story.'}
            >
                <TimelineSuggestContextPanel storyId={currentStoryId} />
            </SimpleSheet>

            <SimpleSheet
                open={openPanel === "pending"}
                onClose={() => setOpenPanel(null)}
                title="Pending"
                description="AI-suggested timeline pins awaiting your review — Approve to add them to Spine, Reject to discard."
            >
                <PendingPinsPanel storyId={currentStoryId} />
            </SimpleSheet>
        </div>
    );
}
