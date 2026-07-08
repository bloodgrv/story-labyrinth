import { Columns2, ExternalLink, Rows2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { useEditorLayout } from "../context/EditorLayoutContext";
import { useFloatingPanels } from "../context/FloatingPanelsContext";
import { useTabMeta } from "../hooks/useTabMeta";
import type { EditorPaneState, PaneTab } from "../types";
import { getTabChapterId } from "../utils/paneTabs";
import { AddTabMenu } from "./AddTabMenu";

interface PaneTabStripProps {
    pane: EditorPaneState;
    storyId: string;
    onFocus: () => void;
}

export function PaneTabStrip({ pane, storyId, onFocus }: PaneTabStripProps) {
    const { paneCount, splitPane, closePane } = useEditorLayout();

    return (
        <div className="flex items-center gap-0.5 border-b bg-muted/20 px-1 py-1">
            <div role="tablist" className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto">
                {pane.tabs.map(tab => (
                    <TabButton key={tab.id} tab={tab} pane={pane} onFocus={onFocus} />
                ))}
            </div>
            <AddTabMenu paneId={pane.id} storyId={storyId} />
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Split right"
                onClick={() => splitPane(pane.id, "horizontal")}
            >
                <Columns2 className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Split down"
                onClick={() => splitPane(pane.id, "vertical")}
            >
                <Rows2 className="h-3.5 w-3.5" />
            </Button>
            {paneCount > 1 && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Close pane"
                    onClick={() => closePane(pane.id)}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}

interface TabButtonProps {
    tab: PaneTab;
    pane: EditorPaneState;
    onFocus: () => void;
}

function TabButton({ tab, pane, onFocus }: TabButtonProps) {
    const { icon: Icon, label } = useTabMeta(tab.content);
    const { setActiveTab, closeTab } = useEditorLayout();
    const { addPanel } = useFloatingPanels();
    const { setCurrentChapterId } = useStoryContext();
    const isActive = pane.activeTabId === tab.id;

    const activate = () => {
        onFocus();
        setActiveTab(pane.id, tab.id);
        const chapterId = getTabChapterId(tab.content);
        if (chapterId) setCurrentChapterId(chapterId);
    };

    return (
        <div
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            className={cn(
                "group flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 px-2 py-1 text-xs cursor-pointer max-w-[160px] transition-colors",
                isActive
                    ? "bg-background border-b-primary font-medium"
                    : "border-b-transparent text-muted-foreground hover:bg-background/60"
            )}
            onClick={activate}
            onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate();
                }
            }}
            title={label}
        >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{label}</span>
            <button
                type="button"
                className={cn("hidden shrink-0 rounded p-0.5 hover:bg-muted group-hover:block", isActive && "block")}
                title="Float this tab"
                onClick={event => {
                    event.stopPropagation();
                    closeTab(pane.id, tab.id);
                    addPanel(tab.content);
                }}
            >
                <ExternalLink className="h-3 w-3" />
            </button>
            <button
                type="button"
                className={cn("hidden shrink-0 rounded p-0.5 hover:bg-muted group-hover:block", isActive && "block")}
                title="Close tab"
                onClick={event => {
                    event.stopPropagation();
                    closeTab(pane.id, tab.id);
                }}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
