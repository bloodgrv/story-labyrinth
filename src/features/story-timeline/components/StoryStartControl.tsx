import { Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useUpdateTimelineMutation } from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import type { StoryStartMode, StoryTimeline, TimelinePin } from "@/types/storyTimeline";

interface StoryStartControlProps {
    storyId: string;
    timeline: StoryTimeline;
    pins: TimelinePin[];
}

// Story Timeline (T6, TL1) — Story-start anchor config (decision #11). Default/preferred mode is
// "chapter_one" (pre-filled by ensureSpineTimeline server-side on first creation), always
// manually overridable to a specific pin or a freeform manual time — a small settings popover
// rather than a dedicated dialog, since it's a handful of fields edited rarely.
export function StoryStartControl({ storyId, timeline, pins }: StoryStartControlProps) {
    const [open, setOpen] = useState(false);
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);
    const updateMutation = useUpdateTimelineMutation(storyId);

    const handleModeChange = (mode: StoryStartMode) => {
        updateMutation.mutate({ id: timeline.id, data: { storyStartMode: mode } });
    };

    const handleChapterChange = (chapterId: string) => {
        updateMutation.mutate({ id: timeline.id, data: { storyStartChapterId: chapterId } });
    };

    const handlePinChange = (pinId: string) => {
        updateMutation.mutate({ id: timeline.id, data: { storyStartPinId: pinId } });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                    <Flag className="h-3.5 w-3.5" />
                    Story-start
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
                <div className="space-y-2">
                    <Label>Anchor mode</Label>
                    <Select value={timeline.storyStartMode} onValueChange={handleModeChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="chapter_one">Chapter One</SelectItem>
                            <SelectItem value="manual_pin">A specific pin</SelectItem>
                            <SelectItem value="manual_time">Manual (no chapter or pin)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {timeline.storyStartMode === "chapter_one" && (
                    <div className="space-y-2">
                        <Label>Chapter</Label>
                        <Select value={timeline.storyStartChapterId ?? ""} onValueChange={handleChapterChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a chapter" />
                            </SelectTrigger>
                            <SelectContent>
                                {[...chapters]
                                    .sort((a, b) => a.order - b.order)
                                    .map(chapter => (
                                        <SelectItem key={chapter.id} value={chapter.id}>
                                            {chapter.order}: {chapter.title}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Chapters before this one (e.g. a prologue) can still sit before Story-start on the board.
                        </p>
                    </div>
                )}

                {timeline.storyStartMode === "manual_pin" && (
                    <div className="space-y-2">
                        <Label>Pin</Label>
                        <Select value={timeline.storyStartPinId ?? ""} onValueChange={handlePinChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a pin" />
                            </SelectTrigger>
                            <SelectContent>
                                {pins.map(pin => (
                                    <SelectItem key={pin.id} value={pin.id}>
                                        {pin.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {timeline.storyStartMode === "manual_time" && (
                    <p className="text-xs text-muted-foreground">
                        Story-start renders at relative offset 0 with no backing chapter or pin.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
