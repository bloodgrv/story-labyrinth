import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { formatElapsed } from "../lib/jobPresentation";
import type { AiActivityEntry } from "../store/aiActivityStore";

interface AiActivityIndicatorProps {
    entries: AiActivityEntry[];
    ariaLabel: string;
    heading: string;
    emptyLabel: string;
    activeVerb: string;
    dotColorClass: string;
}

// Reusable TopBar lamp shell for foreground AI work — instantiated twice (see TopBar.tsx): once
// over the streaming registry (chat sends, Editor Selection-Generate/Rework, chapter summaries)
// and once over the one-shot registry (Humanizer rewrite, Lore Sheet Improve/Sync, Image
// Generation, Document/Outline Import — wired generically in apiFactory.ts). A deliberate sibling
// of ActivityStoplight.tsx (agentJobs), not a merge: unlike a background job, none of this has a
// failed/retry state to show — it either finishes or its own toast already reported the error —
// so this is just a live "what's running right now" list, no Retry/Dismiss. Same "always visible,
// dim when idle" posture as the job lamp; a distinct dot color per instance keeps all three lamps
// visually separable at a glance. Not owner-gated — none of this is an owner-only action.
export function AiActivityIndicator({ entries, ariaLabel, heading, emptyLabel, activeVerb, dotColorClass }: AiActivityIndicatorProps) {
    const [open, setOpen] = useState(false);
    const { data: stories } = useStoriesQuery();
    const { setCurrentStoryId, setCurrentTool } = useStoryContext();

    const isIdle = entries.length === 0;

    const storyTitleFor = (entry: AiActivityEntry): string | null => {
        if (!entry.storyId) return null;
        return stories?.find(s => s.id === entry.storyId)?.title ?? null;
    };

    const handleJump = (entry: AiActivityEntry) => {
        if (!entry.tool) return;
        if (entry.storyId) setCurrentStoryId(entry.storyId);
        setCurrentTool(entry.tool);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={ariaLabel}
                    title={isIdle ? emptyLabel : `${entries.length} ${activeVerb}`}
                    className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 h-9 text-xs hover:bg-accent transition-colors"
                >
                    <span className={`h-2 w-2 rounded-full ${isIdle ? "bg-muted-foreground/40" : `${dotColorClass} animate-pulse`}`} />
                    {!isIdle && <span>{entries.length}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
                <p className="font-medium text-sm mb-1">{heading}</p>
                {isIdle ? (
                    <p className="text-xs text-muted-foreground py-2">{emptyLabel}</p>
                ) : (
                    <div className="divide-y max-h-80 overflow-y-auto">
                        {entries.map(entry => {
                            const storyTitle = storyTitleFor(entry);
                            return (
                                <div key={entry.id} className="flex items-start justify-between gap-2 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{entry.label}</p>
                                        {storyTitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{storyTitle}</p>}
                                        <p className="text-xs text-muted-foreground mt-0.5">{formatElapsed(Date.now() - entry.startedAt)}</p>
                                    </div>
                                    {entry.tool && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 shrink-0"
                                            title="Jump to tool"
                                            onClick={() => handleJump(entry)}
                                        >
                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
