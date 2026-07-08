import { randomUUID } from "@/utils/crypto";
import type { EditorLayoutNode, EditorPaneState, PaneTabContent, SplitDirection } from "../types";

export const createPane = (content: PaneTabContent): EditorLayoutNode => {
    const tab = { id: randomUUID(), content };
    return { type: "pane", pane: { id: randomUUID(), tabs: [tab], activeTabId: tab.id } };
};

export const countPanes = (node: EditorLayoutNode): number =>
    node.type === "pane" ? 1 : node.split.children.reduce((sum, child) => sum + countPanes(child), 0);

export const findPaneContainingTab = (node: EditorLayoutNode, tabId: string): EditorPaneState | null => {
    if (node.type === "pane") return node.pane.tabs.some(tab => tab.id === tabId) ? node.pane : null;

    for (const child of node.split.children) {
        const found = findPaneContainingTab(child, tabId);
        if (found) return found;
    }
    return null;
};

export const findPaneById = (node: EditorLayoutNode, paneId: string): EditorPaneState | null => {
    if (node.type === "pane") return node.pane.id === paneId ? node.pane : null;

    for (const child of node.split.children) {
        const found = findPaneById(child, paneId);
        if (found) return found;
    }
    return null;
};

const activeTabContent = (pane: EditorPaneState): PaneTabContent =>
    (pane.tabs.find(tab => tab.id === pane.activeTabId) ?? pane.tabs[0]).content;

// Splits the given pane in place into a new split node containing the original pane (with all
// its tabs, untouched) and a new sibling pane holding one tab — a copy of whichever tab was
// active ("view the same scene side by side" by default).
export const splitPaneInTree = (
    node: EditorLayoutNode,
    paneId: string,
    direction: SplitDirection
): EditorLayoutNode => {
    if (node.type === "pane") {
        if (node.pane.id !== paneId) return node;
        return {
            type: "split",
            split: {
                id: randomUUID(),
                direction,
                sizes: [50, 50],
                children: [node, createPane(activeTabContent(node.pane))]
            }
        };
    }

    return {
        type: "split",
        split: {
            ...node.split,
            children: node.split.children.map(child => splitPaneInTree(child, paneId, direction))
        }
    };
};

// Applies `updater` to the single pane matching `paneId`, leaving the rest of the tree alone —
// the shared plumbing behind every tab-level operation (add/close/activate), so each of those
// stays a small, tree-shape-agnostic function over one EditorPaneState.
export const updatePaneInTree = (
    node: EditorLayoutNode,
    paneId: string,
    updater: (pane: EditorPaneState) => EditorPaneState
): EditorLayoutNode => {
    if (node.type === "pane") return node.pane.id === paneId ? { type: "pane", pane: updater(node.pane) } : node;

    return {
        type: "split",
        split: { ...node.split, children: node.split.children.map(child => updatePaneInTree(child, paneId, updater)) }
    };
};

export const setSplitSizesInTree = (node: EditorLayoutNode, splitId: string, sizes: number[]): EditorLayoutNode => {
    if (node.type === "pane") return node;
    if (node.split.id === splitId) return { type: "split", split: { ...node.split, sizes } };

    return {
        type: "split",
        split: { ...node.split, children: node.split.children.map(child => setSplitSizesInTree(child, splitId, sizes)) }
    };
};

// Removes a pane from the tree entirely (used when its last tab closes, or via the pane's own
// Close button). A split left with only one child collapses into that child, so the tree never
// carries a redundant single-child split. Returns null if `paneId` was the only pane in the
// whole tree (closing the last pane is the caller's responsibility to prevent).
export const closePaneInTree = (node: EditorLayoutNode, paneId: string): EditorLayoutNode | null => {
    if (node.type === "pane") return node.pane.id === paneId ? null : node;

    const remainingChildren = node.split.children
        .map(child => closePaneInTree(child, paneId))
        .filter((child): child is EditorLayoutNode => child !== null);

    if (remainingChildren.length === node.split.children.length) return node; // paneId not in this subtree
    if (remainingChildren.length === 0) return null;
    if (remainingChildren.length === 1) return remainingChildren[0];

    return { type: "split", split: { ...node.split, children: remainingChildren } };
};
