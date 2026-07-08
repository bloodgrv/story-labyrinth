import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocusThemeSwitcher } from "@/features/focus-session/components/FocusThemeSwitcher";
import { useFocusSession } from "@/features/focus-session/context/FocusSessionContext";
import { formatDuration } from "@/features/focus-session/utils/formatDuration";

// The only chrome left visible during a session — a small, floating, unobtrusive bar rather
// than a toolbar, so it reads as a companion to the writing rather than more UI to manage.
export function FocusSessionHud() {
    const { config, elapsedSeconds, wordsWritten, endSession, updateConfig } = useFocusSession();

    let goalLabel: string | null = null;
    let progressRatio: number | null = null;

    if (config.goalType === "timer") {
        const remaining = Math.max(0, config.timerMinutes * 60 - elapsedSeconds);
        goalLabel = `${formatDuration(remaining)} left`;
        progressRatio = Math.min(1, elapsedSeconds / (config.timerMinutes * 60));
    } else if (config.goalType === "wordCount") {
        goalLabel = `${wordsWritten} / ${config.wordCountGoal} words`;
        progressRatio = Math.min(1, wordsWritten / config.wordCountGoal);
    }

    return (
        <div className="animate-in fade-in slide-in-from-top-2 fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur duration-300">
            <span className="text-sm font-medium tabular-nums">{formatDuration(elapsedSeconds)}</span>

            {goalLabel && (
                <>
                    <span className="h-4 w-px bg-border" />
                    <span className="text-sm tabular-nums text-muted-foreground">{goalLabel}</span>
                    {progressRatio !== null && (
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full bg-primary transition-all duration-500"
                                style={{ width: `${progressRatio * 100}%` }}
                            />
                        </div>
                    )}
                </>
            )}

            <span className="h-4 w-px bg-border" />
            <FocusThemeSwitcher
                value={config.theme}
                onChange={theme => updateConfig({ theme })}
                triggerClassName="h-7 w-[104px] border-none bg-transparent text-xs shadow-none"
            />

            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={endSession}>
                <LogOut className="h-3.5 w-3.5" />
                End Session
            </Button>
        </div>
    );
}
