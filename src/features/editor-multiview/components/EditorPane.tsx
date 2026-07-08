import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { useEditorLayout } from "../context/EditorLayoutContext";
import type { EditorPaneState } from "../types";
import { getTabChapterId } from "../utils/paneTabs";
import { PaneTabContentView } from "./PaneTabContentView";
import { PaneTabStrip } from "./PaneTabStrip";

interface EditorPaneProps {
    pane: EditorPaneState;
    storyId: string;
}

export function EditorPane({ pane, storyId }: EditorPaneProps) {
    const { activePaneId, setActivePane } = useEditorLayout();
    const { setCurrentChapterId } = useStoryContext();
    const isActive = activePaneId === pane.id;
    const activeTab = pane.tabs.find(tab => tab.id === pane.activeTabId) ?? pane.tabs[0];

    const focusPane = () => {
        if (isActive) return;
        setActivePane(pane.id);
        const chapterId = getTabChapterId(activeTab.content);
        if (chapterId) setCurrentChapterId(chapterId);
    };

    return (
        <div
            className={cn(
                "h-full flex flex-col min-w-0 border-t-2 transition-colors duration-150",
                isActive ? "border-t-primary" : "border-t-transparent"
            )}
            onFocusCapture={focusPane}
            onMouseDownCapture={focusPane}
        >
            <PaneTabStrip pane={pane} storyId={storyId} onFocus={() => setActivePane(pane.id)} />
            <div className="flex-1 min-h-0 overflow-hidden">
                <PaneTabContentView content={activeTab.content} storyId={storyId} />
            </div>
        </div>
    );
}
