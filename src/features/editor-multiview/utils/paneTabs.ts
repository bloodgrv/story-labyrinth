import { randomUUID } from "@/utils/crypto";
import type { EditorPaneState, PaneTab, PaneTabContent } from "../types";

export const createTab = (content: PaneTabContent): PaneTab => ({ id: randomUUID(), content });

// Every tab kind except "lorebook" (story-scoped) carries a chapterId — used to keep the
// app-wide focused chapter (TopBar, side-drawer-driven download button, etc.) in sync with
// whichever chapter-scoped tab is currently active, without those consumers needing any
// MultiView-awareness of their own.
export const getTabChapterId = (content: PaneTabContent): string | null =>
    content.kind === "lorebook" ? null : content.chapterId;

export const addTabToPane = (pane: EditorPaneState, content: PaneTabContent): EditorPaneState => {
    const tab = createTab(content);
    return { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id };
};

// Returns null to signal "this pane has no tabs left and should be removed from the tree
// entirely" — the caller (EditorLayoutContext) is responsible for that removal via
// closePaneInTree, since a pane can't delete itself from outside its own state.
export const closeTabInPane = (pane: EditorPaneState, tabId: string): EditorPaneState | null => {
    const remaining = pane.tabs.filter(tab => tab.id !== tabId);
    if (remaining.length === 0) return null;

    const activeTabId = pane.activeTabId === tabId ? remaining[remaining.length - 1].id : pane.activeTabId;
    return { ...pane, tabs: remaining, activeTabId };
};

export const setActiveTabInPane = (pane: EditorPaneState, tabId: string): EditorPaneState => ({
    ...pane,
    activeTabId: tabId
});

// Used by the "toggle panel" shortcuts (useEditorMultiViewShortcuts) to find whether a pane
// already has, say, "Outline for chapter X" open before deciding to open one vs. close/focus
// the existing one.
export const tabContentEquals = (a: PaneTabContent, b: PaneTabContent): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "lorebook") return true;

    return "chapterId" in b && a.chapterId === b.chapterId;
};

export const findTabByContent = (pane: EditorPaneState, content: PaneTabContent): PaneTab | undefined =>
    pane.tabs.find(tab => tabContentEquals(tab.content, content));
