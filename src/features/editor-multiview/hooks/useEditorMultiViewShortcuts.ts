import { useHotkeys } from "react-hotkeys-hook";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useEditorLayout } from "../context/EditorLayoutContext";
import type { PaneTabContent } from "../types";
import { findPaneById } from "../utils/layoutTree";
import { findTabByContent } from "../utils/paneTabs";

// react-hotkeys-hook ignores keydowns from contenteditable/form elements by default — without
// this, every shortcut below would be silently inert the moment the cursor is inside the
// Lexical editor, which is the normal state while using this feature at all.
const HOTKEY_OPTIONS = { enableOnContentEditable: true, enableOnFormTags: true };

// All bound as mod+alt+<key> — every other mod+<key>/mod+shift+<key> combo in the app is
// already spoken for (see SHORTCUTS in ShortcutsPlugin/shortcuts.ts for the Lexical formatting
// ones, and useWorkspaceShortcuts.ts for mod+1-7 tools, mod+[ / mod+] chapter nav, mod+k command
// palette) — the extra +alt keeps this whole feature on its own, collision-free key space.
// Only mounted while EditorMultiView itself is (see EditorMultiViewRoot), so these are
// automatically inactive outside the Editor tool — no extra "is this the right tool" guard.
export function useEditorMultiViewShortcuts() {
    const { root, activePaneId, splitPane, closePane, addTab, closeTab, setActiveTab } = useEditorLayout();
    const { currentChapterId } = useStoryContext();

    const cycleActiveTab = (direction: 1 | -1) => {
        const pane = findPaneById(root, activePaneId);
        if (!pane || pane.tabs.length <= 1) return;

        const currentIndex = pane.tabs.findIndex(tab => tab.id === pane.activeTabId);
        const nextIndex = (currentIndex + direction + pane.tabs.length) % pane.tabs.length;
        setActiveTab(pane.id, pane.tabs[nextIndex].id);
    };

    // Opens (or, if already open in the active pane, closes) a tool panel as a tab — the
    // keyboard equivalent of the "+" add-tab menu / a tab's close button. Chapter-scoped kinds
    // use whichever chapter is currently focused app-wide.
    const togglePanelTab = (content: PaneTabContent) => {
        const pane = findPaneById(root, activePaneId);
        if (!pane) return;

        const existing = findTabByContent(pane, content);
        if (existing) closeTab(pane.id, existing.id);
        else addTab(pane.id, content);
    };

    const deps = [root, activePaneId, splitPane, closePane, addTab, closeTab, setActiveTab, currentChapterId];

    useHotkeys(
        "mod+alt+right",
        e => {
            e.preventDefault();
            splitPane(activePaneId, "horizontal");
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+down",
        e => {
            e.preventDefault();
            splitPane(activePaneId, "vertical");
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+w",
        e => {
            e.preventDefault();
            closePane(activePaneId);
        },
        HOTKEY_OPTIONS,
        deps
    );

    // Vi-style j/k rather than bracket keys: react-hotkeys-hook matches bracket/punctuation keys
    // by their normalized DOM `code` (e.g. "BracketRight"), which doesn't line up with the
    // literal "]"/"[" character the way it does for the app's *existing* mod+]/mod+[ chapter-nav
    // shortcuts — verified those don't fire reliably either. Letters and arrow keys normalize
    // consistently, so this whole feature deliberately avoids punctuation keys entirely.
    useHotkeys(
        "mod+alt+j",
        e => {
            e.preventDefault();
            cycleActiveTab(1);
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+k",
        e => {
            e.preventDefault();
            cycleActiveTab(-1);
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+l",
        e => {
            e.preventDefault();
            togglePanelTab({ kind: "lorebook" });
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+t",
        e => {
            e.preventDefault();
            if (currentChapterId) togglePanelTab({ kind: "tags", chapterId: currentChapterId });
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+o",
        e => {
            e.preventDefault();
            if (currentChapterId) togglePanelTab({ kind: "outline", chapterId: currentChapterId });
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+p",
        e => {
            e.preventDefault();
            if (currentChapterId) togglePanelTab({ kind: "pov", chapterId: currentChapterId });
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+n",
        e => {
            e.preventDefault();
            if (currentChapterId) togglePanelTab({ kind: "notes", chapterId: currentChapterId });
        },
        HOTKEY_OPTIONS,
        deps
    );

    useHotkeys(
        "mod+alt+b",
        e => {
            e.preventDefault();
            if (currentChapterId) togglePanelTab({ kind: "beats", chapterId: currentChapterId });
        },
        HOTKEY_OPTIONS,
        deps
    );
}
