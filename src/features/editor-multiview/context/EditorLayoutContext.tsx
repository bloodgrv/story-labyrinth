import { debounce } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { EditorLayoutNode, PaneTabContent, SplitDirection } from "../types";
import { loadPersistedLayout, savePersistedLayout } from "../utils/layoutStorage";
import {
    closePaneInTree,
    countPanes,
    createPane,
    findPaneById,
    findPaneContainingTab,
    setSplitSizesInTree,
    splitPaneInTree,
    updatePaneInTree
} from "../utils/layoutTree";
import { addTabToPane, closeTabInPane, getTabChapterId, setActiveTabInPane } from "../utils/paneTabs";

interface EditorLayoutContextValue {
    root: EditorLayoutNode;
    activePaneId: string;
    paneCount: number;
    setActivePane: (paneId: string) => void;
    splitPane: (paneId: string, direction: SplitDirection) => void;
    closePane: (paneId: string) => void;
    addTab: (paneId: string, content: PaneTabContent) => void;
    closeTab: (paneId: string, tabId: string) => void;
    setActiveTab: (paneId: string, tabId: string) => void;
    setSplitSizes: (splitId: string, sizes: number[]) => void;
}

const EditorLayoutContext = createContext<EditorLayoutContextValue | null>(null);

interface EditorLayoutProviderProps {
    storyId: string;
    initialChapterId: string;
    children: ReactNode;
}

// One layout tree per story, restored from localStorage on mount (see layoutStorage.ts) and
// saved back on every change. EditorMultiView mounts this with `key={storyId}`, so switching
// stories fully remounts (loading THAT story's saved layout, or a fresh single pane if it never
// had one) rather than needing a reset effect here.
//
// This provider itself does NOT react to `initialChapterId` changing after mount — it's only
// the seed for a fresh tree. Keeping the active pane in sync with later picks from the TopBar's
// ChapterSwitcher (or anything else driving StoryContext.currentChapterId) is handled one level
// up, in EditorMultiViewRoot's effect, which activates/opens a tab for the new chapter in
// whichever pane is currently active. That effect is a no-op whenever currentChapterId already
// matches the active pane (which is the case right after a pane's own focus-driven sync — see
// EditorPane), so the two directions don't feed back into each other.
export const EditorLayoutProvider = ({ storyId, initialChapterId, children }: EditorLayoutProviderProps) => {
    const { setCurrentChapterId } = useStoryContext();
    const [root, setRoot] = useState<EditorLayoutNode>(() => {
        const persisted = loadPersistedLayout(storyId);
        return persisted?.root ?? createPane({ kind: "chapter", chapterId: initialChapterId });
    });
    const [activePaneId, setActivePaneId] = useState(() => {
        const persisted = loadPersistedLayout(storyId);
        if (persisted) return persisted.activePaneId;
        return root.type === "pane" ? root.pane.id : "";
    });

    // Debounced so a resize drag (many setSplitSizes calls per second) doesn't hammer
    // localStorage — split/tab operations are infrequent enough that the short delay is
    // unnoticeable, and the save is best-effort anyway (see the "why localStorage" note above).
    const saveRef = useRef(
        debounce((id: string, nextRoot: EditorLayoutNode, nextActivePaneId: string) => {
            savePersistedLayout(id, { root: nextRoot, activePaneId: nextActivePaneId });
        }, 400)
    );

    useEffect(() => {
        saveRef.current(storyId, root, activePaneId);
    }, [storyId, root, activePaneId]);

    useEffect(() => {
        const save = saveRef.current;
        return () => save.cancel();
    }, []);

    const value = useMemo<EditorLayoutContextValue>(
        () => ({
            root,
            activePaneId,
            paneCount: countPanes(root),
            setActivePane: setActivePaneId,
            splitPane: (paneId, direction) => setRoot(prev => splitPaneInTree(prev, paneId, direction)),
            closePane: paneId => {
                if (countPanes(root) <= 1) return;
                const next = closePaneInTree(root, paneId);
                if (!next) return;
                setRoot(next);
                if (activePaneId === paneId) {
                    const firstPaneId = findFirstPaneId(next);
                    if (firstPaneId) {
                        setActivePaneId(firstPaneId);
                        syncCurrentChapterFromPane(next, firstPaneId, setCurrentChapterId);
                    }
                }
            },
            addTab: (paneId, content) => {
                setRoot(prev => updatePaneInTree(prev, paneId, pane => addTabToPane(pane, content)));
                // addTabToPane always makes the new tab active in its pane — if that's the
                // active pane, StoryContext's "current chapter" needs to follow, or the TopBar/
                // download button etc. keep pointing at whatever was open before (the confirmed
                // cause of the "Add tab doesn't focus" QA finding).
                if (paneId === activePaneId) {
                    const chapterId = getTabChapterId(content);
                    if (chapterId) setCurrentChapterId(chapterId);
                }
            },
            closeTab: (paneId, tabId) => {
                const pane = findPaneContainingTab(root, tabId);
                if (!pane) return;
                // Mirrors closePane's "can't close the last pane" rule: can't close the last tab
                // in the last remaining pane either — there must always be something open.
                if (pane.tabs.length <= 1 && countPanes(root) <= 1) return;

                const updatedPane = closeTabInPane(pane, tabId);
                if (updatedPane) {
                    const next = updatePaneInTree(root, paneId, () => updatedPane);
                    setRoot(next);
                    // Closing the active tab can hand "active" to a different tab in the same
                    // pane (closeTabInPane falls back to the last remaining one) — keep the
                    // global current-chapter pointer following it when that's the active pane.
                    if (paneId === activePaneId) syncCurrentChapterFromPane(next, paneId, setCurrentChapterId);
                    return;
                }
                // The pane's last tab just closed — remove the pane itself from the tree.
                const next = closePaneInTree(root, paneId);
                if (!next) return;
                setRoot(next);
                if (activePaneId === paneId) {
                    const firstPaneId = findFirstPaneId(next);
                    if (firstPaneId) {
                        setActivePaneId(firstPaneId);
                        syncCurrentChapterFromPane(next, firstPaneId, setCurrentChapterId);
                    }
                }
            },
            setActiveTab: (paneId, tabId) =>
                setRoot(prev => updatePaneInTree(prev, paneId, pane => setActiveTabInPane(pane, tabId))),
            setSplitSizes: (splitId, sizes) => setRoot(prev => setSplitSizesInTree(prev, splitId, sizes))
        }),
        [root, activePaneId, setCurrentChapterId]
    );

    return <EditorLayoutContext.Provider value={value}>{children}</EditorLayoutContext.Provider>;
};

const findFirstPaneId = (node: EditorLayoutNode): string | null =>
    node.type === "pane" ? node.pane.id : (node.split.children.map(findFirstPaneId).find(Boolean) ?? null);

// Pushes the given pane's active tab's chapter into StoryContext.currentChapterId — the
// counterpart to EditorMultiViewRoot's own global-to-active-pane sync effect, for the other
// direction: a pane-tree mutation (closing a tab/pane, adding a tab) reassigning which tab is
// "active" as a side effect. Without this, the global pointer (read by the TopBar breadcrumb,
// the download button, etc.) can go stale relative to what the active pane is actually showing —
// the root cause behind the 2026-08-15 QA pass's "Add tab doesn't focus" finding, and the closest
// verified defect to its "MultiView split mislabels a pane's tab" finding (which did not
// reproduce under a clean, non-flaky click in a follow-up session — see DECISIONS.md).
const syncCurrentChapterFromPane = (
    node: EditorLayoutNode,
    paneId: string,
    setCurrentChapterId: (chapterId: string) => void
): void => {
    const pane = findPaneById(node, paneId);
    if (!pane) return;
    const activeTab = pane.tabs.find(tab => tab.id === pane.activeTabId) ?? pane.tabs[0];
    const chapterId = getTabChapterId(activeTab.content);
    if (chapterId) setCurrentChapterId(chapterId);
};

export const useEditorLayout = (): EditorLayoutContextValue => {
    const context = useContext(EditorLayoutContext);
    if (!context) throw new Error("useEditorLayout must be used within an EditorLayoutProvider");

    return context;
};
