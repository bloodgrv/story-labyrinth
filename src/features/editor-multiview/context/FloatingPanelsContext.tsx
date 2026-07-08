import { debounce } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "@/utils/crypto";
import type { FloatingPanelState, PaneTabContent } from "../types";
import { loadPersistedFloatingPanels, savePersistedFloatingPanels } from "../utils/layoutStorage";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 480;
const CASCADE_OFFSET = 28;

interface FloatingPanelsContextValue {
    panels: FloatingPanelState[];
    addPanel: (content: PaneTabContent) => void;
    closePanel: (id: string) => void;
    updatePanel: (id: string, patch: Partial<Pick<FloatingPanelState, "x" | "y" | "width" | "height">>) => void;
    bringToFront: (id: string) => void;
}

const FloatingPanelsContext = createContext<FloatingPanelsContextValue | null>(null);

interface FloatingPanelsProviderProps {
    storyId: string;
    children: ReactNode;
}

// Floating panels are docking's counterpart (see DECISIONS.md) — the same PaneTabContent a pane
// tab would hold, just rendered as a movable/resizable window instead of tiled into the
// resizable grid. Kept as its own tree (not part of EditorLayoutContext's pane tree) since a
// floating panel isn't a pane and doesn't participate in splits/resizing between siblings.
// Persisted separately from the pane layout, per story, for the same reasons (see
// layoutStorage.ts).
export const FloatingPanelsProvider = ({ storyId, children }: FloatingPanelsProviderProps) => {
    const [panels, setPanels] = useState<FloatingPanelState[]>(() => loadPersistedFloatingPanels(storyId));

    // Debounced — dragging/resizing a panel calls updatePanel on every pointermove, and saving
    // on every one of those would be wasteful.
    const saveRef = useRef(
        debounce((id: string, nextPanels: FloatingPanelState[]) => {
            savePersistedFloatingPanels(id, nextPanels);
        }, 400)
    );

    useEffect(() => {
        saveRef.current(storyId, panels);
    }, [storyId, panels]);

    useEffect(() => {
        const save = saveRef.current;
        return () => save.cancel();
    }, []);

    const value = useMemo<FloatingPanelsContextValue>(
        () => ({
            panels,
            addPanel: content => {
                const cascade = (panels.length % 8) * CASCADE_OFFSET;
                setPanels(prev => [
                    ...prev,
                    {
                        id: randomUUID(),
                        content,
                        x: 80 + cascade,
                        y: 80 + cascade,
                        width: DEFAULT_WIDTH,
                        height: DEFAULT_HEIGHT
                    }
                ]);
            },
            closePanel: id => setPanels(prev => prev.filter(panel => panel.id !== id)),
            updatePanel: (id, patch) =>
                setPanels(prev => prev.map(panel => (panel.id === id ? { ...panel, ...patch } : panel))),
            // Floating panels render in array order (later = higher DOM z-order); moving the
            // clicked panel to the end is the whole "bring to front" implementation.
            bringToFront: id =>
                setPanels(prev => {
                    const panel = prev.find(p => p.id === id);
                    if (!panel || prev[prev.length - 1]?.id === id) return prev;
                    return [...prev.filter(p => p.id !== id), panel];
                })
        }),
        [panels]
    );

    return <FloatingPanelsContext.Provider value={value}>{children}</FloatingPanelsContext.Provider>;
};

export const useFloatingPanels = (): FloatingPanelsContextValue => {
    const context = useContext(FloatingPanelsContext);
    if (!context) throw new Error("useFloatingPanels must be used within a FloatingPanelsProvider");

    return context;
};
