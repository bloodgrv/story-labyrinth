import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router";
import { useAuthStatus, useSetOnboardingTourCompletedMutation } from "@/features/auth/hooks/useAuthStatus";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useStoryContext } from "@/features/stories/context/StoryContext";

export interface TourMicroStep {
    id: string;
    title: string;
    body: string;
    target?: string;
}

export interface TourStep {
    id: string;
    title: string;
    body: string;
    target?: string;
    micros?: TourMicroStep[];
    onEnter?: () => void;
}

interface TourContextValue {
    isActive: boolean;
    steps: TourStep[];
    stepIndex: number;
    microIndex: number;
    current: TourStep;
    currentMicro: TourMicroStep | null;
    start: () => void;
    next: () => void;
    back: () => void;
    skip: () => void;
    finish: () => void;
    isFirst: boolean;
    isLast: boolean;
    // Exposed so the Welcome step's inline "create a story" CTA (rendered by TourOverlay, not
    // this provider) can land the new story exactly where CreateStoryDialog's other caller
    // (StoriesTool's own empty-state CTA) does, then advance the tour.
    onStoryCreated: (storyId: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

// First-Start Tour (T11, docs/First_Start_Tour_Design.md) — OT1-OT3. Owns the step spine and
// drives navigation between tools/routes as the active step changes; TourOverlay (a sibling,
// mounted once alongside this provider) reads this context to render the actual spotlight/card
// chrome. Mounted once, above <Routes> (see main.tsx), so it survives the Workspace <-> Settings
// <-> Guide route changes the spine itself requires — a provider scoped inside Workspace would
// unmount mid-tour the moment a step navigates to /settings or /guide.
export function TourProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const { setCurrentTool, setCurrentStoryId } = useStoryContext();
    const { data: authStatus } = useAuthStatus();
    const isOwner = useIsOwner();
    const setCompletedMutation = useSetOnboardingTourCompletedMutation();

    const [isActive, setIsActive] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [microIndex, setMicroIndex] = useState(0);
    const autoStartedRef = useRef(false);

    // Design §6 spine: Welcome -> First provider -> Brainstorm basics (4 micros) -> Guide/Replay
    // -> Finish. `onEnter` runs once per step becoming active (not per micro — the whole
    // Brainstorm group navigates once, on entering the group).
    const steps = useMemo<TourStep[]>(
        () => [
            {
                id: "welcome",
                title: "Welcome to Story Labyrinth",
                body: "Quick tour: where to set up your first AI provider, the Brainstorm chat basics, and where Help lives. Four short stops.",
                onEnter: () => {
                    navigate("/");
                    setCurrentTool("stories");
                }
            },
            {
                id: "provider",
                title: "Your first AI provider",
                body: "You need at least one way to generate: a Cloud API key here, or a Local server URL on the Local tab next to it — either is enough to get started. Details live in Settings and the Guide.",
                target: "settings-providers-panel",
                onEnter: () => navigate("/settings?section=providers")
            },
            {
                id: "brainstorm",
                title: "Brainstorm chat basics",
                body: "",
                onEnter: () => {
                    navigate("/");
                    setCurrentTool("brainstorm");
                },
                micros: [
                    {
                        id: "mode",
                        title: "Cloud or Local",
                        body: "Every chat runs against Cloud or Local — switch here per chat, anytime.",
                        target: "chat-mode-toggle"
                    },
                    {
                        id: "model",
                        title: "Pick a model",
                        body: "Choose which model handles this chat, from whatever you've configured for the selected mode.",
                        target: "chat-model-picker"
                    },
                    {
                        id: "composer",
                        title: "Talk to the model",
                        body: "Type here and send — this is how you actually talk to the model in any chat.",
                        target: "chat-composer"
                    },
                    {
                        id: "context",
                        title: "Context & memory",
                        body: "Optional working context (Notes, Outline, Project Memory, …) — off by default, opt in per chat when you want it.",
                        target: "chat-context-memory"
                    }
                ]
            },
            {
                id: "guide",
                title: "Help lives in the Guide",
                body: 'Everything else — every feature, every desk — is documented here. "Replay tour" at the top always brings you back to this walkthrough.',
                target: "guide-replay",
                onEnter: () => navigate("/guide")
            },
            {
                id: "finish",
                title: "That's the tour",
                body: "Set up your provider, explore Brainstorm, and check the Guide whenever you're stuck. You can replay this anytime from the Guide's top button."
            }
        ],
        [navigate, setCurrentTool]
    );

    const current = steps[stepIndex] ?? steps[0];
    const currentMicro = current.micros ? (current.micros[microIndex] ?? current.micros[0]) : null;
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    // Runs the new step's navigation exactly once per step entry — not per micro-advance within
    // a step, so re-entering the Brainstorm group's 4th micro doesn't re-navigate 4 times.
    useEffect(() => {
        if (!isActive) return;
        steps[stepIndex]?.onEnter?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on stepIndex/isActive only; steps/onEnter closures are recreated every render but must not re-fire navigation on every render
    }, [isActive, stepIndex]);

    const start = () => {
        setStepIndex(0);
        setMicroIndex(0);
        setIsActive(true);
    };

    const next = () => {
        if (current.micros && microIndex < current.micros.length - 1) {
            setMicroIndex(i => i + 1);
            return;
        }
        if (isLast) {
            finish();
            return;
        }
        setStepIndex(i => i + 1);
        setMicroIndex(0);
    };

    const back = () => {
        if (current.micros && microIndex > 0) {
            setMicroIndex(i => i - 1);
            return;
        }
        if (isFirst) return;
        const prevIndex = stepIndex - 1;
        const prevMicros = steps[prevIndex]?.micros;
        setStepIndex(prevIndex);
        setMicroIndex(prevMicros ? prevMicros.length - 1 : 0);
    };

    const onStoryCreated = (storyId: string) => {
        setCurrentStoryId(storyId);
        setCurrentTool("brainstorm");
        next();
    };

    // Skip and Finish both write completed=true (design §4) — the only difference is the toast
    // copy, and Skip's must name the Replay control explicitly (design §7's own lock).
    const skip = () => {
        setIsActive(false);
        setCompletedMutation.mutate(true);
        toast.info('Tour skipped — replay it anytime from "Replay tour" at the top of the Guide.');
    };

    const finish = () => {
        setIsActive(false);
        setCompletedMutation.mutate(true);
        toast.success('Tour complete — replay it anytime from "Replay tour" at the top of the Guide.');
    };

    // Auto-start (OT2, design §2/§4): owner-only, exactly once per page load, only while the
    // flag is still false. Guarded by a ref (not just the flag itself) so a Skip/Finish mutation's
    // brief pre-refetch window — where the cache still reads completed:false — can never
    // re-trigger a second auto-start in the same session.
    useEffect(() => {
        if (autoStartedRef.current) return;
        if (!authStatus?.authenticated) return;
        if (isOwner && authStatus.onboardingTourCompleted === false) {
            autoStartedRef.current = true;
            start();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- start() is stable enough for a one-shot gate; only authStatus/isOwner should re-evaluate this
    }, [authStatus, isOwner]);

    return (
        <TourContext.Provider
            value={{
                isActive,
                steps,
                stepIndex,
                microIndex,
                current,
                currentMicro,
                start,
                next,
                back,
                skip,
                finish,
                isFirst,
                isLast,
                onStoryCreated
            }}
        >
            {children}
        </TourContext.Provider>
    );
}

export function useTour(): TourContextValue {
    const ctx = useContext(TourContext);
    if (!ctx) throw new Error("useTour must be used within a TourProvider");
    return ctx;
}
