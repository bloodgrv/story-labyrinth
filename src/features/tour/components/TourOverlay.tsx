import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { CreateStoryDialog } from "@/features/stories/components/CreateStoryDialog";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useTour } from "../context/TourContext";
import { useTourAnchor } from "../hooks/useTourAnchor";

// First-Start Tour (T11, OT1/OT7) — the actual chrome: a floating step card with progress dots
// and Back/Next/Skip. Portaled to <body> and z-40, deliberately under Radix's own z-50 dialogs/
// popovers (design §5.1 "below critical system modals if conflict") so e.g. the Welcome step's
// own CreateStoryDialog renders on top of the tour chrome, not under it.
//
// Previously drew a dimmed backdrop with a spotlight cutout around the current step's target
// (useTourAnchor's `rect`). Dropped (2026-08-22) — every step's target is already fully
// interactive while the tour is active (nothing here ever blocked clicks; pointer-events-none
// on this wrapper always let them through), but the dimming made the rest of the page *look*
// disabled, which read as "you're locked into whatever's lit up" even though switching tabs/
// providers worked the whole time. useTourAnchor's "missing" status (the target string never
// appearing in the DOM) is still surfaced via the copy below — only the rect-driven visual is
// gone, so the hook keeps running just to detect that case.
export function TourOverlay() {
    const tour = useTour();
    const { data: stories = [] } = useStoriesQuery();
    const anchorKey = tour.currentMicro ? `${tour.current.id}:${tour.currentMicro.id}` : tour.current.id;
    const target = tour.currentMicro?.target ?? tour.current.target;
    const anchor = useTourAnchor(target, anchorKey);

    if (!tour.isActive) return null;

    const title = tour.currentMicro?.title ?? tour.current.title;
    const body = tour.currentMicro?.body ?? tour.current.body;
    const isWelcome = tour.current.id === "welcome";
    const hasMicroBefore = !!(tour.current.micros && tour.microIndex > 0);
    const canGoBack = !tour.isFirst || hasMicroBefore;
    const isFinalStep = tour.isLast && !tour.current.micros;
    const isFinalMicro = tour.isLast && tour.current.micros && tour.microIndex === tour.current.micros.length - 1;
    const nextIsDone = isFinalStep || isFinalMicro;

    return createPortal(
        <div className="fixed inset-0 z-40 pointer-events-none">
            <div className="fixed bottom-6 right-6 w-[min(24rem,calc(100vw-3rem))] pointer-events-auto">
                <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-5 space-y-3">
                    <div className="flex items-center gap-1.5">
                        {tour.steps.map((step, i) => (
                            <span
                                key={step.id}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === tour.stepIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                                }`}
                            />
                        ))}
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold">{title}</h3>
                        {body && <p className="text-sm text-muted-foreground mt-1">{body}</p>}
                    </div>

                    {anchor.status === "missing" && (
                        <p className="text-xs text-muted-foreground italic">
                            Couldn't find that control here — it may be somewhere else right now. Next still works.
                        </p>
                    )}

                    {isWelcome && (
                        <div className="pt-1">
                            {stories.length === 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        A quick test/throwaway story is fine for this — you can always create a real one later.
                                    </p>
                                    <CreateStoryDialog
                                        trigger={
                                            <Button variant="outline" size="sm">
                                                Create your first story
                                            </Button>
                                        }
                                        onCreated={story => tour.onStoryCreated(story.id)}
                                    />
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">You already have stories — nothing to set up here.</p>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" size="sm" onClick={tour.skip}>
                            Skip
                        </Button>
                        <div className="flex items-center gap-2">
                            {canGoBack && (
                                <Button variant="outline" size="sm" onClick={tour.back}>
                                    Back
                                </Button>
                            )}
                            <Button size="sm" onClick={tour.next}>
                                {nextIsDone ? "Done" : "Next"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
