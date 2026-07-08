import { useState } from "react";
import { useWorkspace } from "@/components/workspace/context/WorkspaceContext";
import { useChapterQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { EditorMultiView } from "@/features/editor-multiview/components/EditorMultiView";
import { FocusSessionHud } from "@/features/focus-session/components/FocusSessionHud";
import { useFocusSession } from "@/features/focus-session/context/FocusSessionContext";
import { FOCUS_THEME_CLASS } from "@/features/focus-session/focusThemeClass";
import { useFocusSessionShortcut } from "@/features/focus-session/hooks/useFocusSessionShortcut";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { type DrawerType, EditorToolsPanel } from "./EditorToolsPanel";

export function StoryEditor() {
    const [openDrawer, setOpenDrawer] = useState<DrawerType>(null);
    const { currentChapterId, currentStoryId } = useStoryContext();
    const { data: currentChapter } = useChapterQuery(currentChapterId || "");
    const { rightSidebar, toggleRightSidebar, isMaximised } = useWorkspace();
    const { isActive: sessionActive, config: sessionConfig } = useFocusSession();
    const collapsed = rightSidebar.collapsed;
    const focusThemeClass = sessionActive ? FOCUS_THEME_CLASS[sessionConfig.theme] : null;
    useFocusSessionShortcut(currentChapterId);

    const toggleDrawer = (drawer: DrawerType) => setOpenDrawer(drawer === openDrawer ? null : drawer);

    return (
        <div
            className={cn(
                "h-full flex relative overflow-hidden bg-background text-foreground transition-colors duration-300",
                focusThemeClass
            )}
        >
            <div
                className={cn(
                    "flex-1 flex justify-center overflow-x-hidden min-w-0",
                    !isMaximised && !sessionActive && "px-4"
                )}
            >
                {currentStoryId && currentChapterId && (
                    <EditorMultiView
                        storyId={currentStoryId}
                        initialChapterId={currentChapterId}
                        isMaximised={isMaximised || sessionActive}
                    />
                )}
            </div>

            {sessionActive && <FocusSessionHud />}

            {!sessionActive && (
                <EditorToolsPanel
                    openDrawer={openDrawer}
                    onToggleDrawer={toggleDrawer}
                    onCloseDrawer={() => setOpenDrawer(null)}
                    currentChapterId={currentChapterId}
                    currentStoryId={currentStoryId}
                    currentChapter={currentChapter}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleRightSidebar}
                />
            )}
        </div>
    );
}
