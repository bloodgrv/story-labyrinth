import { useState } from "react";

// Shared controlled/uncontrolled dual-mode collapse state — extracted from the identical pattern
// independently hand-rolled in ChatList.tsx and every chat-hosting rail (Outline/Notes/Brainstorm/
// World-Building) that lifts collapse out of ChatList so a sibling tray can collapse in sync.
// Passing collapsed/onCollapsedChange makes it controlled (e.g. OutlineChatRail's ResizablePanel
// integration); omitting both falls back to local state, identical to today's uncontrolled default.
export function useChatListCollapse(
    collapsed?: boolean,
    onCollapsedChange?: (collapsed: boolean) => void,
    initialCollapsed = false
) {
    const [internalCollapsed, setInternalCollapsed] = useState(initialCollapsed);
    const isCollapsed = collapsed ?? internalCollapsed;
    const setIsCollapsed = onCollapsedChange ?? setInternalCollapsed;
    return [isCollapsed, setIsCollapsed] as const;
}
