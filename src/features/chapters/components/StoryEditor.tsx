import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace/context/WorkspaceContext";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useBrainstormChecklistQuery } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { ChapterVersionsPanel } from "@/features/chapter-versions/components/ChapterVersionsPanel";
import { useChapterQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { EditorChatRail } from "@/features/chat/components/EditorChatRail";
import { useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { useChatProposalsQuery } from "@/features/chat/hooks/useCodexProposalsQuery";
import { EditorMultiView } from "@/features/editor-multiview/components/EditorMultiView";
import { FocusSessionHud } from "@/features/focus-session/components/FocusSessionHud";
import { useFocusSession } from "@/features/focus-session/context/FocusSessionContext";
import { FOCUS_THEME_CLASS } from "@/features/focus-session/focusThemeClass";
import { useFocusSessionShortcut } from "@/features/focus-session/hooks/useFocusSessionShortcut";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";
import type { AIChat } from "@/types/story";
import { type DrawerType, EditorToolsPanel } from "./EditorToolsPanel";

export function StoryEditor() {
    const [openDrawer, setOpenDrawer] = useState<DrawerType>(null);
    // Independent from EditorToolsPanel's own icon-label collapse (rightSidebar.collapsed below)
    // — starts collapsed so the Editor Chats list/tray (fixed-width) isn't fighting the chat
    // interface's own minimum width for room in the same narrow rail by default.
    const [chatRailCollapsed, setChatRailCollapsed] = useState(true);
    // Lifted here (rather than inside EditorChatRail) so the sibling EditorToolsPanel can show
    // Approvals/Context & memory as its own rail Sheets, matching the other 5 chat hosts' own
    // ChatToolsRail treatment — both siblings need the same selectedChat/contextToggles instance.
    const [selectedEditorChat, setSelectedEditorChat] = useState<AIChat | null>(null);
    const [editorComposerSeedText, setEditorComposerSeedText] = useState<string | null>(null);
    const editorContextToggles = useChatContextToggles(selectedEditorChat, "editor");
    const { data: pendingEditorCodexProposals = [] } = useChatProposalsQuery(selectedEditorChat?.id, "pending");
    const { data: activeEditorShuttleItems = [] } = useBrainstormChecklistQuery(selectedEditorChat?.id, "active");
    const { currentChapterId, currentStoryId, pendingChatComposerSeed, setPendingChatComposerSeed, setPendingAiReviewChapterId, setCurrentTool } =
        useStoryContext();
    const { data: currentChapter } = useChapterQuery(currentChapterId || "");

    // AI Review's "Send to Editor chat" action (AR3, docs/AI_Review_Design.md) — same one-shot
    // consumption posture as ResearchTool.tsx's own pendingChatComposerSeed effect, gated on a
    // chat already being selected so the seed doesn't get lost against a still-mounting rail.
    useEffect(() => {
        if (!pendingChatComposerSeed || pendingChatComposerSeed.tool !== "editor" || !selectedEditorChat) return;
        setEditorComposerSeedText(pendingChatComposerSeed.text);
        setPendingChatComposerSeed(null);
    }, [pendingChatComposerSeed, selectedEditorChat, setPendingChatComposerSeed]);
    const { rightSidebar, toggleRightSidebar, isMaximised } = useWorkspace();
    const { isActive: sessionActive, config: sessionConfig } = useFocusSession();
    const isDesktop = useIsDesktopViewport();
    const collapsed = rightSidebar.collapsed;
    const focusThemeClass = sessionActive ? FOCUS_THEME_CLASS[sessionConfig.theme] : null;
    useFocusSessionShortcut(currentChapterId);

    const toggleDrawer = (drawer: DrawerType) => setOpenDrawer(drawer === openDrawer ? null : drawer);

    const showChatRail = isDesktop && !sessionActive && currentStoryId;

    const editorContent = currentStoryId && currentChapterId && (
        <EditorMultiView
            storyId={currentStoryId}
            initialChapterId={currentChapterId}
            isMaximised={isMaximised || sessionActive}
        />
    );

    // Version tabs sit above the live chapter editor, not during a focus session (distraction-
    // free, same reasoning EditorToolsPanel already hides for) — see ChapterVersionsPanel.tsx.
    const mainAreaContent =
        currentChapterId && !sessionActive ? (
            <ChapterVersionsPanel chapterId={currentChapterId}>{editorContent}</ChapterVersionsPanel>
        ) : (
            editorContent
        );

    return (
        <div
            className={cn(
                "h-full flex relative overflow-hidden bg-background text-foreground transition-colors duration-300",
                focusThemeClass
            )}
        >
            {showChatRail ? (
                <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
                    <ResizablePanel defaultSize={72} minSize={40}>
                        <div
                            className={cn(
                                "h-full flex justify-center overflow-x-hidden",
                                !isMaximised && "px-4"
                            )}
                        >
                            {mainAreaContent}
                        </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={28} minSize={20}>
                        <EditorChatRail
                            storyId={currentStoryId}
                            anchorChapterId={currentChapterId ?? undefined}
                            collapsed={chatRailCollapsed}
                            selectedChat={selectedEditorChat}
                            onChatUpdate={setSelectedEditorChat}
                            contextToggles={editorContextToggles}
                            composerSeedText={editorComposerSeedText}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            ) : (
                <div
                    className={cn(
                        "flex-1 flex justify-center overflow-x-hidden min-w-0",
                        !isMaximised && !sessionActive && "px-4"
                    )}
                >
                    {mainAreaContent}
                </div>
            )}

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
                    chatRailCollapsed={chatRailCollapsed}
                    onToggleChatRail={() => setChatRailCollapsed(v => !v)}
                    selectedEditorChat={selectedEditorChat}
                    contextToggles={editorContextToggles}
                    approvalsCount={pendingEditorCodexProposals.length + activeEditorShuttleItems.length}
                    onAnswerHere={setEditorComposerSeedText}
                    onReviewChapter={
                        currentChapterId
                            ? () => {
                                  setPendingAiReviewChapterId(currentChapterId);
                                  setCurrentTool("ai-review");
                              }
                            : undefined
                    }
                />
            )}
        </div>
    );
}
