import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    History,
    Inbox,
    ListChecks,
    type LucideIcon,
    Menu,
    MessagesSquare,
    ScanSearch,
    SlidersHorizontal,
    StickyNote,
    Tags,
    User
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DownloadMenu } from "@/components/ui/DownloadMenu";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SimpleSheet } from "@/components/SimpleSheet";
import { ChapterNotesEditor } from "@/features/chapters/components/ChapterNotesEditor";
import { ChapterOutline } from "@/features/chapters/components/ChapterOutline";
import { ChapterPOVEditor } from "@/features/chapters/components/ChapterPOVEditor";
import { ConcreteBeatsPanel } from "@/features/chapters/components/ConcreteBeatsPanel";
import { MatchedTagEntries } from "@/features/chapters/components/MatchedTagEntries";
import { ChapterHistoryDrawer } from "@/features/chapter-history/components/ChapterHistoryDrawer";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { ShuttleTray } from "@/features/chat/components/ShuttleTray";
import type { ChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { ChapterScannerDrawer } from "@/features/rag-scanner/components/ChapterScannerDrawer";
import { cn } from "@/lib/utils";
import type { AIChat, Chapter } from "@/types/story";

export type DrawerType =
    | "matchedTags"
    | "chapterOutline"
    | "chapterPOV"
    | "chapterNotes"
    | "chapterBeats"
    | "ragScanner"
    | "chapterHistory"
    | "approvals"
    | "context"
    | null;

export const sidebarButtons: { id: DrawerType; icon: LucideIcon; label: string; title: string }[] = [
    { id: "matchedTags", icon: Tags, label: "Tags", title: "Matched Tags" },
    { id: "chapterOutline", icon: BookOpen, label: "Outline", title: "Chapter Outline" },
    { id: "chapterPOV", icon: User, label: "POV", title: "Edit POV" },
    { id: "chapterNotes", icon: StickyNote, label: "Scribble", title: "Scribble" },
    { id: "chapterBeats", icon: ListChecks, label: "Beats", title: "Concrete Beats" },
    { id: "ragScanner", icon: ScanSearch, label: "Scanner", title: "RAG Scanner" },
    { id: "chapterHistory", icon: History, label: "History", title: "Chapter History" },
    // Editor's own chat's Approvals (Codex+Shuttle trays) and Context & memory — mirrors the
    // Approvals/Context buckets ChatToolsRail already gives WB/Outline/Notes/Research/Brainstorm.
    // Only shown once a chat is selected (filtered in the render loop below, not here) since both
    // need selectedEditorChat/contextToggles that StoryEditor.tsx lifts from EditorChatRail.
    { id: "approvals", icon: Inbox, label: "Approvals", title: "Approvals" },
    { id: "context", icon: SlidersHorizontal, label: "Context", title: "Context & memory" }
];

interface EditorToolsPanelProps {
    openDrawer: DrawerType;
    onToggleDrawer: (drawer: DrawerType) => void;
    onCloseDrawer: () => void;
    currentChapterId: string | null;
    currentStoryId: string | null;
    currentChapter: Chapter | undefined;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    // Independent from the icon-label collapse above — lets the docked Editor Chats list/tray
    // (a sibling panel, EditorChatRail) show or hide without also expanding this bar's labels,
    // since both fighting for width at once is what was clipping the chat list's text/tabs.
    chatRailCollapsed: boolean;
    onToggleChatRail: () => void;
    // Approvals/Context & memory for Editor's own chat — lifted up to StoryEditor.tsx (the shared
    // parent of this panel and EditorChatRail) since both siblings need the same
    // selectedChat/contextToggles instance. Null selectedEditorChat hides both buttons entirely,
    // same as the other 5 hosts' panels only existing once a chat is selected.
    selectedEditorChat: AIChat | null;
    contextToggles: ChatContextToggles;
    approvalsCount: number;
    onAnswerHere: (text: string) => void;
}

// The right-rail tool sidebar (Tags/Outline/POV/Notes/Beats) plus its drawers/sheet, and the
// mobile floating-menu equivalent — extracted out of StoryEditor.tsx purely to keep that file
// under the project's max-lines lint limit once Deep Writing Sessions added HUD/theme wiring
// there. Rendered only when no focus session is active (StoryEditor hides this whole panel
// during a session) — kept as a plain, always-mountable component rather than baking that
// condition in here, so the caller stays in control of when it shows.
export function EditorToolsPanel({
    openDrawer,
    onToggleDrawer,
    onCloseDrawer,
    currentChapterId,
    currentStoryId,
    currentChapter,
    collapsed,
    onToggleCollapsed,
    chatRailCollapsed,
    onToggleChatRail,
    selectedEditorChat,
    contextToggles,
    approvalsCount,
    onAnswerHere
}: EditorToolsPanelProps) {
    // Approvals/Context depend on a selected chat existing at all — filtered out here (not from
    // the static sidebarButtons array, shared with the mobile menu below) rather than shown
    // disabled, same posture the other 5 hosts' panels array already uses.
    const visibleSidebarButtons = sidebarButtons.filter(
        b => (b.id === "approvals" || b.id === "context" ? !!selectedEditorChat : true)
    );
    const approvalsBadge =
        approvalsCount > 0 ? (
            <Badge variant="secondary" className="font-normal ml-2">
                {approvalsCount} pending
            </Badge>
        ) : undefined;
    const approvalsCompactBadge =
        approvalsCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {approvalsCount}
            </span>
        ) : undefined;
    const contextBadge =
        contextToggles.armedLabels.length > 0 ? (
            <Badge variant="secondary" className="font-normal ml-2">
                {contextToggles.armedLabels.join(" · ")}
            </Badge>
        ) : undefined;

    return (
        <>
            {/* Mobile floating menu for editor tools */}
            <div className="md:hidden fixed bottom-20 right-4 z-40">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" className="h-12 w-12 rounded-full shadow-lg">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2">
                        {visibleSidebarButtons.map(({ id, icon: Icon, title }) => (
                            <DropdownMenuItem key={id} onClick={() => onToggleDrawer(id)}>
                                <Icon className="h-4 w-4 mr-2" />
                                {title}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <aside
                className={cn(
                    "hidden md:flex flex-col border-l bg-muted/20 transition-all duration-200",
                    collapsed ? "w-12" : "w-36"
                )}
            >
                <div className="flex-1 py-2 space-y-2">
                    <Button
                        variant={!chatRailCollapsed ? "default" : "outline"}
                        size="sm"
                        className={cn("mx-2", collapsed ? "justify-center px-0 w-8" : "justify-start")}
                        onClick={onToggleChatRail}
                        title={chatRailCollapsed ? "Show Editor Chats" : "Hide Editor Chats"}
                    >
                        <MessagesSquare className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="ml-2">Chats</span>}
                    </Button>

                    {visibleSidebarButtons.map(({ id, icon: Icon, label, title }) => {
                        const badge = id === "approvals" ? approvalsBadge : id === "context" ? contextBadge : undefined;
                        const compactBadge = id === "approvals" ? approvalsCompactBadge : undefined;
                        return (
                            <Button
                                key={id}
                                variant={openDrawer === id ? "default" : "outline"}
                                size="sm"
                                className={cn("mx-2 relative", collapsed ? "justify-center px-0 w-8" : "justify-start")}
                                onClick={() => onToggleDrawer(id)}
                                title={title}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {!collapsed && <span className="ml-2">{label}</span>}
                                {collapsed
                                    ? (compactBadge ?? (badge && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary" />))
                                    : badge}
                            </Button>
                        );
                    })}

                    {currentChapterId && !collapsed && (
                        <DownloadMenu
                            type="chapter"
                            id={currentChapterId}
                            variant="outline"
                            size="sm"
                            showIcon={true}
                            label="Download"
                            className="mx-2 justify-start"
                        />
                    )}
                </div>

                <div className="p-2 border-t">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-full"
                        onClick={onToggleCollapsed}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                </div>
            </aside>

            <SimpleSheet open={openDrawer === "matchedTags"} onClose={onCloseDrawer} title="Matched Tag Entries" description="Lorebook entries that match tags in your current chapter.">
                <MatchedTagEntries />
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "chapterOutline"} onClose={onCloseDrawer} title="Chapter Outline" description="Outline and notes for your current chapter.">
                {currentChapter && <ChapterOutline key={currentChapter.id} chapter={currentChapter} />}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "chapterBeats"} onClose={onCloseDrawer} title="Concrete Beats" description="Physical actions, wardrobe/item changes, and other concrete beats marked in this chapter.">
                {currentChapterId && currentStoryId && <ConcreteBeatsPanel chapterId={currentChapterId} storyId={currentStoryId} />}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "ragScanner"} onClose={onCloseDrawer} title="RAG Scanner" description="Scan this chapter against the Codex and prior chapters for contradictions and state mismatches.">
                {currentChapterId && currentStoryId && <ChapterScannerDrawer chapterId={currentChapterId} storyId={currentStoryId} />}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "chapterHistory"} onClose={onCloseDrawer} title="Chapter History" description="Non-destructive save history for this chapter's content — auto-checkpoints plus your own named saves, with restore.">
                {currentChapterId && (
                    <ChapterHistoryDrawer chapterId={currentChapterId} currentContent={currentChapter?.content} />
                )}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "chapterPOV"} onClose={onCloseDrawer} title="Edit Chapter POV" description="Change the point of view character and perspective for this chapter.">
                {currentChapter && <ChapterPOVEditor chapter={currentChapter} onClose={onCloseDrawer} />}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "approvals"} onClose={onCloseDrawer} title="Approvals">
                {selectedEditorChat && (
                    <div className="space-y-0">
                        <CodexProposalTray chatId={selectedEditorChat.id} />
                        <ShuttleTray
                            chatId={selectedEditorChat.id}
                            storyId={currentStoryId ?? ""}
                            fromDesk={selectedEditorChat.chatType ?? "editor"}
                            fromChatTitleSnapshot={selectedEditorChat.title}
                            onAnswerHere={onAnswerHere}
                        />
                    </div>
                )}
            </SimpleSheet>

            <SimpleSheet open={openDrawer === "context"} onClose={onCloseDrawer} title="Context & memory">
                {selectedEditorChat && (
                    <ChatContextPanelContent selectedChat={selectedEditorChat} promptType="editor" toggles={contextToggles} />
                )}
            </SimpleSheet>

            {/* Replace the Chapter Notes Drawer with this Sheet */}
            <Sheet open={openDrawer === "chapterNotes"} onOpenChange={open => !open && onCloseDrawer()}>
                <SheetContent
                    side="right"
                    className="h-[100vh] w-full sm:w-[540px] md:w-[700px] lg:w-[800px] sm:max-w-full"
                >
                    <SheetHeader>
                        <SheetTitle>Scribble</SheetTitle>
                    </SheetHeader>
                    <div className="overflow-y-auto h-[100vh]">
                        {currentChapter && (
                            <ChapterNotesEditor
                                key={currentChapter.id}
                                chapter={currentChapter}
                                onClose={onCloseDrawer}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
