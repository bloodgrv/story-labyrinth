import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getChapterWordCount, useChapterWordCount } from "@/lib/chapterWordCountStore";
import { DEFAULT_FOCUS_SESSION_CONFIG, type FocusSessionConfig } from "@/types/focusSession";

const CONFIG_STORAGE_KEY = "focusSession.lastConfig";

const readStoredConfig = (): FocusSessionConfig => {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_FOCUS_SESSION_CONFIG;
    try {
        return { ...DEFAULT_FOCUS_SESSION_CONFIG, ...(JSON.parse(raw) as Partial<FocusSessionConfig>) };
    } catch {
        return DEFAULT_FOCUS_SESSION_CONFIG;
    }
};

interface FocusSessionContextValue {
    config: FocusSessionConfig;
    updateConfig: (patch: Partial<FocusSessionConfig>) => void;
    isActive: boolean;
    chapterId: string | null;
    elapsedSeconds: number;
    startingWordCount: number;
    wordsWritten: number;
    startSession: (config: FocusSessionConfig, chapterId: string | null) => void;
    endSession: () => void;
    // Wellbeing: derived "should a notice show right now" flags, plus the actions the notice UI
    // calls back into. Kept as plain state here (not toast calls) so this context stays
    // presentation-agnostic — see WellbeingNotices.tsx for the actual toast rendering.
    pendingBreakReminder: boolean;
    acknowledgeBreakReminder: (snoozeMinutes?: number) => void;
    pendingSessionLimitNotice: boolean;
    dismissSessionLimitNotice: (keepGoing: boolean) => void;
    pendingGoalReached: boolean;
    dismissGoalReached: (keepGoing: boolean) => void;
}

const FocusSessionContext = createContext<FocusSessionContextValue | null>(null);

export const FocusSessionProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<FocusSessionConfig>(readStoredConfig);
    const [isActive, setIsActive] = useState(false);
    const [chapterId, setChapterId] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [startingWordCount, setStartingWordCount] = useState(0);
    const [nextBreakReminderAt, setNextBreakReminderAt] = useState<number | null>(null);
    const [pendingBreakReminder, setPendingBreakReminder] = useState(false);
    const [sessionLimitNotified, setSessionLimitNotified] = useState(false);
    const [pendingSessionLimitNotice, setPendingSessionLimitNotice] = useState(false);
    const [goalReachedNotified, setGoalReachedNotified] = useState(false);
    const [pendingGoalReached, setPendingGoalReached] = useState(false);

    const liveWordCount = useChapterWordCount(chapterId);
    const wordsWritten = Math.max(0, liveWordCount - startingWordCount);

    const configRef = useRef(config);
    configRef.current = config;

    const updateConfig = useCallback((patch: Partial<FocusSessionConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...patch };
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const startSession = useCallback(
        (sessionConfig: FocusSessionConfig, sessionChapterId: string | null) => {
            updateConfig(sessionConfig);
            setChapterId(sessionChapterId);
            setStartingWordCount(getChapterWordCount(sessionChapterId));
            setElapsedSeconds(0);
            setNextBreakReminderAt(sessionConfig.breakReminderEnabled ? sessionConfig.breakReminderMinutes * 60 : null);
            setPendingBreakReminder(false);
            setSessionLimitNotified(false);
            setPendingSessionLimitNotice(false);
            setGoalReachedNotified(false);
            setPendingGoalReached(false);
            setIsActive(true);
        },
        [updateConfig]
    );

    const endSession = useCallback(() => {
        setIsActive(false);
        setChapterId(null);
        setPendingBreakReminder(false);
        setPendingSessionLimitNotice(false);
        setPendingGoalReached(false);
    }, []);

    // Ticks once a second while a session is active — a simple counter increment rather than
    // diffing wall-clock time, since a writing session that gets backgrounded long enough for
    // browser timer throttling to matter isn't really "in session" anymore anyway.
    useEffect(() => {
        if (!isActive) return undefined;
        const interval = setInterval(() => setElapsedSeconds(seconds => seconds + 1), 1000);
        return () => clearInterval(interval);
    }, [isActive]);

    // Break reminders recur: firing one immediately reschedules the next, so "every 30 minutes"
    // keeps holding for the rest of the session regardless of when the writer acts on any one.
    useEffect(() => {
        if (!isActive || nextBreakReminderAt === null) return;
        if (elapsedSeconds < nextBreakReminderAt) return;
        setPendingBreakReminder(true);
        setNextBreakReminderAt(elapsedSeconds + configRef.current.breakReminderMinutes * 60);
    }, [isActive, elapsedSeconds, nextBreakReminderAt]);

    // Session-limit check-in fires once per session, at the configured threshold.
    useEffect(() => {
        if (!isActive || sessionLimitNotified || !configRef.current.sessionLimitEnabled) return;
        if (elapsedSeconds < configRef.current.sessionLimitMinutes * 60) return;
        setPendingSessionLimitNotice(true);
        setSessionLimitNotified(true);
    }, [isActive, elapsedSeconds, sessionLimitNotified]);

    // Timer/word-count goal reached — fires once, a celebration rather than a cutoff (the
    // writer chooses whether to keep going or stop; the goal is a target, not a leash).
    useEffect(() => {
        if (!isActive || goalReachedNotified) return;
        const { goalType, timerMinutes, wordCountGoal } = configRef.current;
        const reached =
            (goalType === "timer" && elapsedSeconds >= timerMinutes * 60) ||
            (goalType === "wordCount" && wordsWritten >= wordCountGoal);
        if (!reached) return;
        setPendingGoalReached(true);
        setGoalReachedNotified(true);
    }, [isActive, elapsedSeconds, wordsWritten, goalReachedNotified]);

    const acknowledgeBreakReminder = useCallback(
        (snoozeMinutes?: number) => {
            setPendingBreakReminder(false);
            if (snoozeMinutes) setNextBreakReminderAt(elapsedSeconds + snoozeMinutes * 60);
        },
        [elapsedSeconds]
    );

    const dismissSessionLimitNotice = useCallback(
        (keepGoing: boolean) => {
            setPendingSessionLimitNotice(false);
            if (!keepGoing) endSession();
        },
        [endSession]
    );

    const dismissGoalReached = useCallback(
        (keepGoing: boolean) => {
            setPendingGoalReached(false);
            if (!keepGoing) endSession();
        },
        [endSession]
    );

    return (
        <FocusSessionContext.Provider
            value={{
                config,
                updateConfig,
                isActive,
                chapterId,
                elapsedSeconds,
                startingWordCount,
                wordsWritten,
                startSession,
                endSession,
                pendingBreakReminder,
                acknowledgeBreakReminder,
                pendingSessionLimitNotice,
                dismissSessionLimitNotice,
                pendingGoalReached,
                dismissGoalReached
            }}
        >
            {children}
        </FocusSessionContext.Provider>
    );
};

export const useFocusSession = (): FocusSessionContextValue => {
    const context = useContext(FocusSessionContext);
    if (!context) throw new Error("useFocusSession must be used within FocusSessionProvider");
    return context;
};
