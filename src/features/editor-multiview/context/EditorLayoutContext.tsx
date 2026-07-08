import { debounce } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EditorLayoutNode, PaneTabContent, SplitDirection } from "../types";
import { loadPersistedLayout, savePersistedLayout } from "../utils/layoutStorage";
import {
    closePaneInTree,
    countPanes,
    createPane,
    findPaneContainingTab,
    setSplitSizesInTree,
    splitPaneInTree,
    updatePaneInTree
} from "../utils/layoutTree";
import { addTabToPane, closeTabInPane, setActiveTabInPane } from "../utils/paneTabs";

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
// Deliberately does NOT react to `initialChapterId` changing after mount (e.g. picking a
// different chapter from the TopBar's ChapterSwitcher while a layout already exists) — panes
// push their own chapter into the global selection on focus (see EditorPane), so continuously
// syncing the other direction too would create a feedback loop between "last-focused pane" and
// "last global pick." The per-pane chapter picker is the supported way to change what an
// existing pane shows.
export const EditorLayoutProvider = ({ storyId, initialChapterId, children }: EditorLayoutProviderProps) => {
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
                    if (firstPaneId) setActivePaneId(firstPaneId);
                }
            },
            addTab: (paneId, content) =>
                setRoot(prev => updatePaneInTree(prev, paneId, pane => addTabToPane(pane, content))),
            closeTab: (paneId, tabId) => {
                const pane = findPaneContainingTab(root, tabId);
                if (!pane) return;
                // Mirrors closePane's "can't close the last pane" rule: can't close the last tab
                // in the last remaining pane either — there must always be something open.
                if (pane.tabs.length <= 1 && countPanes(root) <= 1) return;

                const updatedPane = closeTabInPane(pane, tabId);
                if (updatedPane) {
                    setRoot(updatePaneInTree(root, paneId, () => updatedPane));
                    return;
                }
                // The pane's last tab just closed — remove the pane itself from the tree.
                const next = closePaneInTree(root, paneId);
                if (!next) return;
                setRoot(next);
                if (activePaneId === paneId) {
                    const firstPaneId = findFirstPaneId(next);
                    if (firstPaneId) setActivePaneId(firstPaneId);
                }
            },
            setActiveTab: (paneId, tabId) =>
                setRoot(prev => updatePaneInTree(prev, paneId, pane => setActiveTabInPane(pane, tabId))),
            setSplitSizes: (splitId, sizes) => setRoot(prev => setSplitSizesInTree(prev, splitId, sizes))
        }),
        [root, activePaneId]
    );

    return <EditorLayoutContext.Provider value={value}>{children}</EditorLayoutContext.Provider>;
};

const findFirstPaneId = (node: EditorLayoutNode): string | null =>
    node.type === "pane" ? node.pane.id : (node.split.children.map(findFirstPaneId).find(Boolean) ?? null);

export const useEditorLayout = (): EditorLayoutContextValue => {
    const context = useContext(EditorLayoutContext);
    if (!context) throw new Error("useEditorLayout must be used within an EditorLayoutProvider");

    return context;
};
