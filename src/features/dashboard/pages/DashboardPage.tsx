import {
    AlertTriangle,
    BookMarked,
    BookOpen,
    ChevronLeft,
    FileText,
    Lightbulb,
    Loader2,
    MessageSquare,
    PenLine,
    Plus,
    StickyNote
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ROUTES } from "@/constants/urls";
import { useSessionManager } from "@/features/session/useSessionManager";
import type { WorkspaceTool } from "@/features/stories/context/StoryContext";
import { StoryVoiceCard } from "@/features/tts/components/StoryVoiceCard";
import { DashboardCard } from "../components/DashboardCard";
import { SectionHeading, StatCount } from "../components/DashboardSectionHelpers";
import { NewChatDialog } from "../components/NewChatDialog";
import { PreferencesSidebar } from "../components/PreferencesSidebar";
import { SessionCard } from "../components/SessionCard";
import { useDashboardData } from "../hooks/useDashboardData";

// Open a same-origin path in a new browser tab.
const openTab = (path: string) => window.open(window.location.origin + path, "_blank", "noopener,noreferrer");

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { storyId } = useParams<{ storyId: string }>();
    const navigate = useNavigate();
    const [newChatOpen, setNewChatOpen] = useState(false);

    const {
        story,
        isLoadingStory,
        isStoryError,
        storyError,
        chapters,
        isLoadingChapters,
        isChaptersError,
        lastChapter,
        wbChats,
        isLoadingWbChats,
        isWbChatsError,
        aiSettings,
        featureEndpoints
    } = useDashboardData(storyId ?? "");

    const sessionManager = useSessionManager(storyId ?? "");

    // The story this tab/page is anchored to can vanish out from under it — most commonly it was
    // deleted from the Stories list in another tab (this app opens most things in new tabs, per
    // CLAUDE.md's UX Flow). Previously this just sat on a "Story not found" message with a manual
    // "Go home" link forever, which reads as a dead/blank page. Redirect automatically instead.
    useEffect(() => {
        if (isLoadingStory || story) return;
        toast.info("This story is no longer available.");
        navigate(ROUTES.HOME, { replace: true });
    }, [isLoadingStory, story, navigate]);

    if (isLoadingStory) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isStoryError) {
        return (
            <div className="container mx-auto p-6 max-w-lg">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-destructive">Couldn't load this story</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {storyError?.message ?? "An unexpected error occurred."}
                        </p>
                    </div>
                </div>
                <Button variant="ghost" onClick={() => navigate(ROUTES.HOME)} className="mt-3">
                    ← Go home
                </Button>
            </div>
        );
    }

    if (!story) {
        return (
            <div className="container mx-auto p-6">
                <p className="text-muted-foreground">Story not found.</p>
                <Button variant="ghost" onClick={() => navigate(ROUTES.HOME)} className="mt-2">
                    ← Go home
                </Button>
            </div>
        );
    }

    const sid = story.id;

    // A workspace deep link: ?story=&tool= is consumed once by useWorkspaceDeepLink on mount
    // (see components/workspace/hooks/useWorkspaceDeepLink.ts) to select the right story/tool
    // in the new tab. Each tool gets its own distinct URL so the SessionCard can tell them
    // apart — sharing a single bare "/" for every tool would make them overwrite each other
    // in the recent-tabs list.
    const workspaceTabUrl = (tool: WorkspaceTool) => `${ROUTES.HOME}?story=${sid}&tool=${tool}`;

    // DashboardCard already performs the actual window.open(href) — onOpen here only needs
    // to record the session tab, not navigate itself.
    const recordWorkspaceTab = (tool: WorkspaceTool, label: string) => {
        sessionManager.recordTab(workspaceTabUrl(tool), label);
    };

    const editorDescription = isLoadingChapters
        ? "Loading chapters…"
        : lastChapter
        ? `Continue · Ch. ${lastChapter.order}: ${lastChapter.title}`
        : chapters.length === 0
        ? "No chapters yet — open workspace to start"
        : "Open the main writing workspace";

    const mostRecentWbChat = wbChats[0];

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(ROUTES.HOME)}
                    className="text-muted-foreground hover:text-foreground -ml-2"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Stories
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold leading-tight">{story.title}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">by {story.author}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <StatCount label="chapter" value={chapters.length} isLoading={isLoadingChapters} />
                    <Separator orientation="vertical" className="h-4" />
                    <StatCount label="WB chat" value={wbChats.length} isLoading={isLoadingWbChats} />
                </div>
            </div>

            {(isChaptersError || isWbChatsError) && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-4 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {isChaptersError && isWbChatsError
                        ? "Couldn't load chapters or world-building chats."
                        : isChaptersError
                        ? "Couldn't load chapters."
                        : "Couldn't load world-building chats."}
                </div>
            )}

            {/* ── Main layout: grid + sidebar ────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">

                {/* Card grid */}
                <div className="flex-1 min-w-0 w-full space-y-6">

                    {/* Writing */}
                    <div>
                        <SectionHeading>Writing</SectionHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <DashboardCard
                                title="Main Editor"
                                description={editorDescription}
                                icon={PenLine}
                                href={workspaceTabUrl("editor")}
                                badge={chapters.length > 0 ? `${chapters.length} ch` : undefined}
                                onOpen={() => recordWorkspaceTab("editor", "Main Editor")}
                            />
                            <DashboardCard
                                title="Chapters"
                                description="Browse, reorder, and manage all chapters"
                                icon={FileText}
                                badge={chapters.length || undefined}
                                href={workspaceTabUrl("chapters")}
                                onOpen={() => recordWorkspaceTab("chapters", "Chapters")}
                            />
                        </div>
                    </div>

                    {/* World-Building */}
                    <div>
                        <SectionHeading>World-Building</SectionHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <DashboardCard
                                title="Codex"
                                description="Track character states, wardrobe, wounds, and custom fields — manage Codex-enabled entries via the Lorebook for now"
                                icon={BookMarked}
                                href={workspaceTabUrl("lorebook")}
                                linkedVia="Lorebook"
                                onOpen={() => recordWorkspaceTab("lorebook", "Codex (via Lorebook)")}
                            />
                            <DashboardCard
                                title="World-Building Chats"
                                description={
                                    wbChats.length === 0
                                        ? "No chats yet — start one to interview characters, locations, factions, and more"
                                        : `Continue "${mostRecentWbChat.title}" or start a new session`
                                }
                                icon={MessageSquare}
                                badge={wbChats.length || undefined}
                                href={mostRecentWbChat ? ROUTES.DASHBOARD.CHAT(sid, mostRecentWbChat.id) : undefined}
                                onOpen={() =>
                                    mostRecentWbChat && sessionManager.recordTab(
                                        ROUTES.DASHBOARD.CHAT(sid, mostRecentWbChat.id),
                                        mostRecentWbChat.title
                                    )
                                }
                                actions={
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => setNewChatOpen(true)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        New Chat
                                    </Button>
                                }
                            />
                            <DashboardCard
                                title="Outline"
                                description="Plan story structure, chapter beats, and narrative arc — with its own dedicated Outline chat"
                                icon={BookOpen}
                                href={workspaceTabUrl("outline")}
                                onOpen={() => recordWorkspaceTab("outline", "Outline")}
                            />
                            <DashboardCard
                                title="Lorebook"
                                description="World entries — characters, locations, items, events"
                                icon={BookMarked}
                                href={workspaceTabUrl("lorebook")}
                                onOpen={() => recordWorkspaceTab("lorebook", "Lorebook")}
                            />
                        </div>
                    </div>

                    {/* Tools */}
                    <div>
                        <SectionHeading>Tools</SectionHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <DashboardCard
                                title="Notes"
                                description="Research, ideas, to-dos, and freeform notes"
                                icon={StickyNote}
                                href={workspaceTabUrl("notes")}
                                onOpen={() => recordWorkspaceTab("notes", "Notes")}
                            />
                            <DashboardCard
                                title="Brainstorm"
                                description="AI-assisted brainstorming and idea generation"
                                icon={Lightbulb}
                                href={workspaceTabUrl("brainstorm")}
                                onOpen={() => recordWorkspaceTab("brainstorm", "Brainstorm")}
                            />
                        </div>
                    </div>
                </div>

                {/* Preferences + Session sidebar — stacks below the grid on small/medium screens */}
                <aside className="w-full lg:w-72 shrink-0 space-y-4">
                    <PreferencesSidebar
                        aiSettings={aiSettings}
                        featureEndpoints={featureEndpoints}
                    />
                    <StoryVoiceCard storyId={sid} />
                    <SessionCard
                        session={sessionManager.session}
                        preferredLayout={sessionManager.preferredLayout}
                        onSaveLayout={sessionManager.saveLayout}
                        onRestoreLayout={sessionManager.restoreLayout}
                        onDeleteLayout={sessionManager.deleteLayout}
                        onClearSession={sessionManager.clearSessionTabs}
                    />
                </aside>
            </div>

            {/* Dialogs */}
            <NewChatDialog
                storyId={sid}
                open={newChatOpen}
                onOpenChange={setNewChatOpen}
                onCreated={chat => {
                    const url = ROUTES.DASHBOARD.CHAT(sid, chat.id);
                    sessionManager.recordTab(url, chat.title);
                    openTab(url);
                }}
            />
        </div>
    );
}
