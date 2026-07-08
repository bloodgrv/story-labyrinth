// Layout persistence: one localStorage entry per story for the pane/tab tree, one for the
// floating panels list. localStorage (not a server table) matches how every other piece of
// per-story *UI* state already persists in this app (current chapter, current tool, right
// sidebar collapse) — this is workspace layout, not story content, so it doesn't need to survive
// a localStorage clear or sync across devices the way chapter text does.
import type { FloatingPanelState } from "../types";
import { isValidFloatingPanel, isValidPersistedLayout, type PersistedLayout } from "./layoutValidation";

const layoutKey = (storyId: string) => `editor-multiview-layout-${storyId}`;
const floatingKey = (storyId: string) => `editor-multiview-floating-${storyId}`;

export const loadPersistedLayout = (storyId: string): PersistedLayout | null => {
    try {
        const raw = localStorage.getItem(layoutKey(storyId));
        if (!raw) return null;

        const parsed: unknown = JSON.parse(raw);
        return isValidPersistedLayout(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const savePersistedLayout = (storyId: string, layout: PersistedLayout): void => {
    localStorage.setItem(layoutKey(storyId), JSON.stringify(layout));
};

export const loadPersistedFloatingPanels = (storyId: string): FloatingPanelState[] => {
    try {
        const raw = localStorage.getItem(floatingKey(storyId));
        if (!raw) return [];

        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidFloatingPanel) : [];
    } catch {
        return [];
    }
};

export const savePersistedFloatingPanels = (storyId: string, panels: FloatingPanelState[]): void => {
    localStorage.setItem(floatingKey(storyId), JSON.stringify(panels));
};
