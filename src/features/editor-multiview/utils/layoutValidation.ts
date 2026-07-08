// Structural validation for layout data loaded back out of localStorage — a previous session's
// JSON blob (or a future schema change) could be missing fields, have a stale shape, or just be
// corrupted, so a persisted layout must be validated before being trusted as initial state. This
// deliberately only checks *shape* (right fields, right types, internally consistent — e.g.
// activePaneId actually points at a pane that exists), not whether referenced chapterIds still
// exist — that's already handled gracefully at render time (see PaneTabContentView).
import type { EditorLayoutNode, EditorPaneState, FloatingPanelState, PaneTab, PaneTabContent } from "../types";

const CHAPTER_SCOPED_KINDS = new Set(["chapter", "tags", "outline", "pov", "notes", "beats"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export const isValidTabContent = (value: unknown): value is PaneTabContent => {
    if (!isRecord(value)) return false;
    if (value.kind === "lorebook") return true;
    if (typeof value.kind === "string" && CHAPTER_SCOPED_KINDS.has(value.kind))
        return typeof value.chapterId === "string" && value.chapterId.length > 0;

    return false;
};

const isValidTab = (value: unknown): value is PaneTab =>
    isRecord(value) && typeof value.id === "string" && isValidTabContent(value.content);

const isValidPane = (value: unknown): value is EditorPaneState =>
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.tabs) &&
    value.tabs.length > 0 &&
    value.tabs.every(isValidTab) &&
    typeof value.activeTabId === "string" &&
    (value.tabs as PaneTab[]).some(tab => tab.id === value.activeTabId);

export const isValidLayoutNode = (value: unknown): value is EditorLayoutNode => {
    if (!isRecord(value)) return false;
    if (value.type === "pane") return isValidPane(value.pane);
    if (value.type !== "split" || !isRecord(value.split)) return false;

    const { id, direction, sizes, children } = value.split;
    return (
        typeof id === "string" &&
        (direction === "horizontal" || direction === "vertical") &&
        Array.isArray(sizes) &&
        Array.isArray(children) &&
        children.length >= 2 &&
        children.length === sizes.length &&
        children.every(isValidLayoutNode)
    );
};

const collectPaneIds = (node: EditorLayoutNode): string[] =>
    node.type === "pane" ? [node.pane.id] : node.split.children.flatMap(collectPaneIds);

export interface PersistedLayout {
    root: EditorLayoutNode;
    activePaneId: string;
}

export const isValidPersistedLayout = (value: unknown): value is PersistedLayout =>
    isRecord(value) &&
    isValidLayoutNode(value.root) &&
    typeof value.activePaneId === "string" &&
    collectPaneIds(value.root as EditorLayoutNode).includes(value.activePaneId);

export const isValidFloatingPanel = (value: unknown): value is FloatingPanelState =>
    isRecord(value) &&
    typeof value.id === "string" &&
    isValidTabContent(value.content) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number";
