// Deep Writing Sessions: an opt-in, explicitly-started distraction-free mode for the Main
// Editor — full-screen editor, hidden chrome, an optional timer or word-count goal, an
// adaptive color theme suited to long stretches of writing, and light-touch wellbeing nudges
// (break reminders, a session-length check-in). Distinct from the existing toolbar
// "Maximize Editor" button, which just collapses the workspace's side panels — a session is a
// deliberate, configured activity with a start and (usually) an end, not a layout toggle.

export type FocusGoalType = "none" | "timer" | "wordCount";

export type FocusThemeId = "default" | "warm" | "lowContrast" | "night";

export interface FocusThemeMeta {
    id: FocusThemeId;
    label: string;
    description: string;
}

// "default" deliberately has no CSS override — it just inherits whatever the app's normal
// light/dark theme already resolves to, so choosing it never fights the global ThemeToggle.
export const FOCUS_THEMES: FocusThemeMeta[] = [
    { id: "default", label: "Default", description: "Matches your normal app theme." },
    { id: "warm", label: "Warm", description: "Warm sepia tones — easier on the eyes for evening writing." },
    { id: "lowContrast", label: "Low Contrast", description: "Softer, muted contrast to reduce eye strain." },
    { id: "night", label: "Night", description: "Very dim, deep tones for late-night sessions." }
];

export interface FocusSessionConfig {
    goalType: FocusGoalType;
    timerMinutes: number;
    wordCountGoal: number;
    theme: FocusThemeId;
    // All four wellbeing knobs default OFF — see DECISIONS.md: a supportive feature that's
    // opt-in respects a writer's own judgment about their session, rather than assuming everyone
    // wants to be interrupted or limited.
    breakReminderEnabled: boolean;
    breakReminderMinutes: number;
    sessionLimitEnabled: boolean;
    sessionLimitMinutes: number;
    // Adds a short, private, supportive line to the break/session-limit check-ins — for writers
    // working through emotionally intense material who'd like the occasional nudge to check in
    // with themselves. Not a content-tagging or reader-facing warning system; purely a wellbeing
    // toggle for the writer's own session. See DECISIONS.md.
    contentCheckInEnabled: boolean;
}

export const DEFAULT_FOCUS_SESSION_CONFIG: FocusSessionConfig = {
    goalType: "none",
    timerMinutes: 25,
    wordCountGoal: 500,
    theme: "default",
    breakReminderEnabled: false,
    breakReminderMinutes: 30,
    sessionLimitEnabled: false,
    sessionLimitMinutes: 90,
    contentCheckInEnabled: false
};

export const TIMER_PRESETS_MINUTES = [15, 25, 45, 60] as const;
export const WORD_COUNT_PRESETS = [250, 500, 1000, 2000] as const;
export const BREAK_REMINDER_PRESETS_MINUTES = [20, 30, 45, 60] as const;
export const SESSION_LIMIT_PRESETS_MINUTES = [60, 90, 120, 180] as const;
