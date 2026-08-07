import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TimelinePin } from "@/types/storyTimeline";
import { useAddMembershipMutation, useRemoveMembershipMutation, useTimelinesQuery } from "../hooks/useStoryTimelineQuery";

interface PinMembershipPopoverProps {
    storyId: string;
    pin: TimelinePin;
}

// Story Timeline (T6, TL5/TL6) — the concrete "place the same pin on Spine + a named timeline"
// UI the design's acceptance criterion calls for: a checkbox per story timeline toggles
// membership (one pin row, multiple membership rows — never a duplicate pin). When a checked
// timeline has swimlanes on (TL6), a free-text lane field appears for that timeline's own
// membership row. Fetches the story's full timeline list itself (React Query dedupes against
// TimelineTool's own useTimelinesQuery call) rather than prop-drilling it through
// TimelineBoard -> PinCard -> here.
export function PinMembershipPopover({ storyId, pin }: PinMembershipPopoverProps) {
    const { data: timelines = [] } = useTimelinesQuery(storyId);
    const addMutation = useAddMembershipMutation(storyId);
    const removeMutation = useRemoveMembershipMutation(storyId);

    const membershipFor = (timelineId: string) => pin.memberships.find(m => m.timelineId === timelineId) ?? null;

    const toggle = (timelineId: string, checked: boolean) => {
        if (checked) addMutation.mutate({ pinId: pin.id, timelineId });
        else removeMutation.mutate({ pinId: pin.id, timelineId });
    };

    const setLane = (timelineId: string, laneId: string) => {
        addMutation.mutate({ pinId: pin.id, timelineId, laneId: laneId.trim() || null });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Manage timelines">
                    <Layers className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">On timelines</p>
                {timelines.map(timeline => {
                    const membership = membershipFor(timeline.id);
                    return (
                        <div key={timeline.id} className="space-y-1">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input"
                                    checked={!!membership}
                                    onChange={e => toggle(timeline.id, e.target.checked)}
                                />
                                {timeline.title}
                            </label>
                            {membership && timeline.swimlanesEnabled && (
                                <Input
                                    className="ml-6 h-7 text-xs"
                                    defaultValue={membership.laneId ?? ""}
                                    placeholder="Lane (e.g. Cover story)"
                                    onBlur={e => setLane(timeline.id, e.target.value)}
                                />
                            )}
                        </div>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}
