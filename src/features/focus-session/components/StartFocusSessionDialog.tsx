import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FocusThemeSwitcher } from "@/features/focus-session/components/FocusThemeSwitcher";
import {
    BREAK_REMINDER_PRESETS_MINUTES,
    type FocusGoalType,
    type FocusSessionConfig,
    SESSION_LIMIT_PRESETS_MINUTES,
    TIMER_PRESETS_MINUTES,
    WORD_COUNT_PRESETS
} from "@/types/focusSession";

const GOAL_TYPE_OPTIONS: { id: FocusGoalType; label: string }[] = [
    { id: "none", label: "Open-ended" },
    { id: "timer", label: "Timer" },
    { id: "wordCount", label: "Word Count" }
];

interface PresetRowProps {
    presets: readonly number[];
    value: number;
    onChange: (value: number) => void;
    suffix: string;
}

function PresetRow({ presets, value, onChange, suffix }: PresetRowProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {presets.map(preset => (
                <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={value === preset ? "default" : "outline"}
                    onClick={() => onChange(preset)}
                >
                    {preset} {suffix}
                </Button>
            ))}
            <Input
                type="number"
                min={1}
                className="h-8 w-20"
                value={value}
                onChange={event => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(parsed) && parsed > 0) onChange(parsed);
                }}
            />
        </div>
    );
}

interface StartFocusSessionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialConfig: FocusSessionConfig;
    canTrackWordCount: boolean;
    onStart: (config: FocusSessionConfig) => void;
}

// Every option here is optional and remembered between sessions (see FocusSessionContext's
// localStorage-backed config) — starting a session never requires configuring anything, but
// changing something once means you don't have to redo it next time.
export function StartFocusSessionDialog({
    open,
    onOpenChange,
    initialConfig,
    canTrackWordCount,
    onStart
}: StartFocusSessionDialogProps) {
    const [draft, setDraft] = useState(initialConfig);

    useEffect(() => {
        if (open) setDraft(initialConfig);
    }, [open, initialConfig]);

    const handleStart = () => {
        onStart(draft);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Start a Writing Session</DialogTitle>
                    <DialogDescription>
                        Hides the sidebars and menus, fills the screen with just your writing. Set a goal if you'd like,
                        or just write.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="space-y-2">
                        <Label>Goal</Label>
                        <div className="flex gap-2">
                            {GOAL_TYPE_OPTIONS.map(option => (
                                <Button
                                    key={option.id}
                                    type="button"
                                    size="sm"
                                    variant={draft.goalType === option.id ? "default" : "outline"}
                                    disabled={option.id === "wordCount" && !canTrackWordCount}
                                    onClick={() => setDraft(prev => ({ ...prev, goalType: option.id }))}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </div>
                        {!canTrackWordCount && (
                            <p className="text-xs text-muted-foreground">Open a chapter to track a word-count goal.</p>
                        )}
                    </div>

                    {draft.goalType === "timer" && (
                        <div className="space-y-2">
                            <Label>Minutes</Label>
                            <PresetRow
                                presets={TIMER_PRESETS_MINUTES}
                                value={draft.timerMinutes}
                                suffix="min"
                                onChange={timerMinutes => setDraft(prev => ({ ...prev, timerMinutes }))}
                            />
                        </div>
                    )}

                    {draft.goalType === "wordCount" && (
                        <div className="space-y-2">
                            <Label>Words</Label>
                            <PresetRow
                                presets={WORD_COUNT_PRESETS}
                                value={draft.wordCountGoal}
                                suffix="words"
                                onChange={wordCountGoal => setDraft(prev => ({ ...prev, wordCountGoal }))}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Theme</Label>
                        <FocusThemeSwitcher
                            value={draft.theme}
                            onChange={theme => setDraft(prev => ({ ...prev, theme }))}
                            triggerClassName="w-full"
                        />
                    </div>

                    <div className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="session-break-reminders" className="font-normal">
                                Break reminders
                            </Label>
                            <Switch
                                id="session-break-reminders"
                                checked={draft.breakReminderEnabled}
                                onCheckedChange={breakReminderEnabled =>
                                    setDraft(prev => ({ ...prev, breakReminderEnabled }))
                                }
                            />
                        </div>
                        {draft.breakReminderEnabled && (
                            <PresetRow
                                presets={BREAK_REMINDER_PRESETS_MINUTES}
                                value={draft.breakReminderMinutes}
                                suffix="min"
                                onChange={breakReminderMinutes => setDraft(prev => ({ ...prev, breakReminderMinutes }))}
                            />
                        )}

                        <div className="flex items-center justify-between pt-1">
                            <Label htmlFor="session-limit-checkin" className="font-normal">
                                Session length check-in
                            </Label>
                            <Switch
                                id="session-limit-checkin"
                                checked={draft.sessionLimitEnabled}
                                onCheckedChange={sessionLimitEnabled =>
                                    setDraft(prev => ({ ...prev, sessionLimitEnabled }))
                                }
                            />
                        </div>
                        {draft.sessionLimitEnabled && (
                            <PresetRow
                                presets={SESSION_LIMIT_PRESETS_MINUTES}
                                value={draft.sessionLimitMinutes}
                                suffix="min"
                                onChange={sessionLimitMinutes => setDraft(prev => ({ ...prev, sessionLimitMinutes }))}
                            />
                        )}

                        <div className="flex items-center justify-between pt-1">
                            <Label htmlFor="session-content-checkin" className="font-normal">
                                Content check-in
                            </Label>
                            <Switch
                                id="session-content-checkin"
                                checked={draft.contentCheckInEnabled}
                                onCheckedChange={contentCheckInEnabled =>
                                    setDraft(prev => ({ ...prev, contentCheckInEnabled }))
                                }
                            />
                        </div>
                        {draft.contentCheckInEnabled && (
                            <p className="text-xs text-muted-foreground">
                                Adds a private, supportive nudge to check in with yourself during break and session
                                reminders — useful if you're working through emotionally intense material.
                            </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                            All three are optional and off by default — a gentle check-in, never a lock on your work.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={handleStart}>Start Writing</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
