import { Coffee, PartyPopper, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useFocusSession } from "@/features/focus-session/context/FocusSessionContext";

// Shown only when the "Content check-in" toggle is on — a private, writer-facing nudge, never a
// reader-facing content warning. See the FocusSessionConfig.contentCheckInEnabled comment.
function ContentCheckInLine() {
    return (
        <p className="text-sm text-muted-foreground">
            If the material you're writing is heavy going, that's worth noticing too — take whatever space you need.
        </p>
    );
}

interface BreakReminderToastProps {
    onSnooze: () => void;
    onDismiss: () => void;
    showContentCheckIn: boolean;
}

// Deliberately worded as a question, not an instruction — this is a nudge, not a nag. See
// DECISIONS.md's "supportive rather than intrusive" note.
function BreakReminderToast({ onSnooze, onDismiss, showContentCheckIn }: BreakReminderToastProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
                <Coffee className="h-4 w-4" />
                Time for a quick break?
            </div>
            <p className="text-sm text-muted-foreground">
                You've been writing for a while — stretch, hydrate, rest your eyes for a minute.
            </p>
            {showContentCheckIn && <ContentCheckInLine />}
            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onSnooze}>
                    Snooze 10 min
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                    Dismiss
                </Button>
            </div>
        </div>
    );
}

interface SessionLimitToastProps {
    minutes: number;
    onKeepGoing: () => void;
    onEnd: () => void;
    showContentCheckIn: boolean;
}

function SessionLimitToast({ minutes, onKeepGoing, onEnd, showContentCheckIn }: SessionLimitToastProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4" />
                {minutes} minutes of writing — nice work
            </div>
            <p className="text-sm text-muted-foreground">
                No pressure either way. Keep the momentum going, or call it here for now.
            </p>
            {showContentCheckIn && <ContentCheckInLine />}
            <div className="flex gap-2">
                <Button size="sm" onClick={onKeepGoing}>
                    Keep Writing
                </Button>
                <Button size="sm" variant="outline" onClick={onEnd}>
                    End Session
                </Button>
            </div>
        </div>
    );
}

interface GoalReachedToastProps {
    goalType: "timer" | "wordCount";
    onKeepGoing: () => void;
    onEnd: () => void;
}

function GoalReachedToast({ goalType, onKeepGoing, onEnd }: GoalReachedToastProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
                <PartyPopper className="h-4 w-4" />
                {goalType === "timer" ? "Time's up!" : "Word goal reached!"}
            </div>
            <p className="text-sm text-muted-foreground">
                You hit your goal for this session. Keep riding the momentum, or wrap up here.
            </p>
            <div className="flex gap-2">
                <Button size="sm" onClick={onKeepGoing}>
                    Keep Writing
                </Button>
                <Button size="sm" variant="outline" onClick={onEnd}>
                    End Session
                </Button>
            </div>
        </div>
    );
}

// Mounted once at the workspace root (see Workspace.tsx) — watches FocusSessionContext's
// derived "pending" flags and turns them into persistent (non-auto-closing), action-carrying
// toasts. Kept separate from the context itself so the context stays toast-library-agnostic.
export function WellbeingNotices() {
    const {
        pendingBreakReminder,
        acknowledgeBreakReminder,
        pendingSessionLimitNotice,
        dismissSessionLimitNotice,
        pendingGoalReached,
        dismissGoalReached,
        config
    } = useFocusSession();

    useEffect(() => {
        if (!pendingBreakReminder) return;
        let id: ReturnType<typeof toast>;
        const handleSnooze = () => {
            acknowledgeBreakReminder(10);
            toast.dismiss(id);
        };
        const handleDismiss = () => {
            acknowledgeBreakReminder();
            toast.dismiss(id);
        };
        id = toast(
            <BreakReminderToast
                onSnooze={handleSnooze}
                onDismiss={handleDismiss}
                showContentCheckIn={config.contentCheckInEnabled}
            />,
            {
                autoClose: false,
                closeOnClick: false,
                onClose: () => acknowledgeBreakReminder()
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingBreakReminder]);

    useEffect(() => {
        if (!pendingSessionLimitNotice) return;
        let id: ReturnType<typeof toast>;
        const handleKeepGoing = () => {
            dismissSessionLimitNotice(true);
            toast.dismiss(id);
        };
        const handleEnd = () => {
            dismissSessionLimitNotice(false);
            toast.dismiss(id);
        };
        id = toast(
            <SessionLimitToast
                minutes={config.sessionLimitMinutes}
                onKeepGoing={handleKeepGoing}
                onEnd={handleEnd}
                showContentCheckIn={config.contentCheckInEnabled}
            />,
            { autoClose: false, closeOnClick: false, onClose: () => dismissSessionLimitNotice(true) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingSessionLimitNotice]);

    useEffect(() => {
        if (!pendingGoalReached) return;
        let id: ReturnType<typeof toast>;
        const handleKeepGoing = () => {
            dismissGoalReached(true);
            toast.dismiss(id);
        };
        const handleEnd = () => {
            dismissGoalReached(false);
            toast.dismiss(id);
        };
        id = toast(
            <GoalReachedToast
                goalType={config.goalType === "timer" ? "timer" : "wordCount"}
                onKeepGoing={handleKeepGoing}
                onEnd={handleEnd}
            />,
            { autoClose: false, closeOnClick: false, onClose: () => dismissGoalReached(true) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingGoalReached]);

    return null;
}
