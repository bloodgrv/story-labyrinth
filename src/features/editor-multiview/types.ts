// Editor MultiView: split-screen editing within the Editor tool. A story's editor area is a
// binary tree — leaves are panes (each showing one chapter's editor), internal nodes are splits
// (a resizable row or column of children).
//
// Task 2: a pane isn't just one chapter anymore — it's a tab strip. A tab can hold a chapter's
// editor, or one of the tool panels that used to only exist as a StoryEditor side-drawer
// (Lorebook, Tags, Outline, POV, Notes, Beats). "Docked" = a tab in some pane, tiled into the
// resizable grid. "Floating" = detached into its own movable/resizable window (see
// FloatingPanelsContext) — the same PaneTabContent shape either way, just held in a different
// place.

export type SplitDirection = "horizontal" | "vertical";

// The four chapter-scoped tool kinds carry an explicit chapterId rather than implicitly
// following "whichever chapter tab happens to be active in this pane" — a tab's content is
// meant to be fully self-contained, not dependent on its siblings.
export type PaneTabContent =
    | { kind: "chapter"; chapterId: string }
    | { kind: "lorebook" }
    | { kind: "tags"; chapterId: string }
    | { kind: "outline"; chapterId: string }
    | { kind: "pov"; chapterId: string }
    | { kind: "notes"; chapterId: string }
    | { kind: "beats"; chapterId: string };

export interface PaneTab {
    id: string;
    content: PaneTabContent;
}

export interface EditorPaneState {
    id: string;
    tabs: PaneTab[];
    activeTabId: string;
}

export interface EditorSplitState {
    id: string;
    direction: SplitDirection;
    // Percentage sizes for each child, kept in sync with react-resizable-panels' onLayout.
    sizes: number[];
    children: EditorLayoutNode[];
}

export type EditorLayoutNode = { type: "pane"; pane: EditorPaneState } | { type: "split"; split: EditorSplitState };

export interface FloatingPanelState {
    id: string;
    content: PaneTabContent;
    x: number;
    y: number;
    width: number;
    height: number;
}
