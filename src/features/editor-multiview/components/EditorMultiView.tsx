import { Fragment, useEffect } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { EditorLayoutProvider, useEditorLayout } from "../context/EditorLayoutContext";
import { FloatingPanelsProvider } from "../context/FloatingPanelsContext";
import { useEditorMultiViewShortcuts } from "../hooks/useEditorMultiViewShortcuts";
import type { EditorLayoutNode } from "../types";
import { findPaneById } from "../utils/layoutTree";
import { findTabByContent, getTabChapterId } from "../utils/paneTabs";
import { EditorPane } from "./EditorPane";
import { FloatingPanelsLayer } from "./FloatingPanelsLayer";

interface EditorLayoutNodeViewProps {
    node: EditorLayoutNode;
    storyId: string;
}

function EditorLayoutNodeView({ node, storyId }: EditorLayoutNodeViewProps) {
    const { setSplitSizes } = useEditorLayout();

    if (node.type === "pane") return <EditorPane pane={node.pane} storyId={storyId} />;

    const { id, direction, sizes, children } = node.split;

    return (
        <ResizablePanelGroup direction={direction} onLayout={layoutSizes => setSplitSizes(id, layoutSizes)}>
            {children.map((child, index) => (
                <Fragment key={childKey(child)}>
                    {index > 0 && <ResizableHandle withHandle />}
                    <ResizablePanel defaultSize={sizes[index]} minSize={15}>
                        <EditorLayoutNodeView node={child} storyId={storyId} />
                    </ResizablePanel>
                </Fragment>
            ))}
        </ResizablePanelGroup>
    );
}

const childKey = (node: EditorLayoutNode): string => (node.type === "pane" ? node.pane.id : node.split.id);

interface EditorMultiViewProps {
    storyId: string;
    initialChapterId: string;
    isMaximised: boolean;
}

// Root of the split-screen editor. Keyed by storyId so switching stories mounts a fresh
// EditorLayoutProvider (a new single-pane tree) instead of carrying over the previous story's
// split layout — see EditorLayoutContext's comment on why this is a remount, not a reset effect.
export function EditorMultiView({ storyId, initialChapterId, isMaximised }: EditorMultiViewProps) {
    return (
        <EditorLayoutProvider key={storyId} storyId={storyId} initialChapterId={initialChapterId}>
            <FloatingPanelsProvider storyId={storyId}>
                <EditorMultiViewRoot storyId={storyId} isMaximised={isMaximised} />
            </FloatingPanelsProvider>
        </EditorLayoutProvider>
    );
}

function EditorMultiViewRoot({ storyId, isMaximised }: { storyId: string; isMaximised: boolean }) {
    const { root, paneCount, activePaneId, addTab, setActiveTab } = useEditorLayout();
    const { currentChapterId } = useStoryContext();
    useEditorMultiViewShortcuts();

    // Keep the active pane showing whichever chapter the TopBar's ChapterSwitcher (or any other
    // consumer of StoryContext.currentChapterId) just picked. EditorPane's focusPane already
    // pushes a pane's own chapter into currentChapterId on focus — this effect is a no-op
    // whenever currentChapterId already matches the active pane's active tab, so that reverse
    // sync never bounces back into a loop here.
    useEffect(() => {
        if (!currentChapterId) return;
        const activePane = findPaneById(root, activePaneId);
        if (!activePane) return;
        const activeTab = activePane.tabs.find(tab => tab.id === activePane.activeTabId) ?? activePane.tabs[0];
        if (getTabChapterId(activeTab.content) === currentChapterId) return;

        const existingTab = findTabByContent(activePane, { kind: "chapter", chapterId: currentChapterId });
        if (existingTab) setActiveTab(activePaneId, existingTab.id);
        else addTab(activePaneId, { kind: "chapter", chapterId: currentChapterId });
    }, [currentChapterId, activePaneId, root, addTab, setActiveTab]);

    // A capped, centered reading column only makes sense for a single pane — the moment there's
    // more than one, splitting the already-capped width further would waste most of the screen.
    const capWidth = !isMaximised && paneCount === 1;

    return (
        <div className={cn("relative h-full flex flex-col min-w-0", capWidth ? "max-w-[1024px] w-full" : "w-full")}>
            <EditorLayoutNodeView node={root} storyId={storyId} />
            <FloatingPanelsLayer storyId={storyId} />
        </div>
    );
}
