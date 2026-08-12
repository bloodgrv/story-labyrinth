import { AlertCircle, Loader2, RefreshCcw, Send, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { ChatToolsRail } from "@/features/chat/components/ChatToolsRail";
import { GlobalResearchChatList } from "@/features/chat/components/GlobalResearchChatList";
import { useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { useChatListCollapse } from "@/features/chat/hooks/useChatListCollapse";
import {
    useChatsByStoryQuery,
    useCreateChatMutation,
    useCreateGlobalChatMutation,
    useGlobalChatsQuery
} from "@/features/chat/hooks/useChatQuery";
import { extractMarkdownLinks } from "@/features/chat/services/extractMarkdownLinks";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { brainstormApi, chatsApi, deskTransfersApi } from "@/services/api/client";
import type { AIChat } from "@/types/story";

const ChatErrorFallback = (error: Error, resetError: () => void) => (
    <div className="flex items-center justify-center h-full p-4">
        <Alert variant="destructive" className="max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Chat Error</AlertTitle>
            <AlertDescription className="mt-2">
                <p className="mb-4">The chat interface encountered an error: {error.message}</p>
                <div className="flex gap-2">
                    <Button onClick={resetError} variant="outline" size="sm">
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Reset Chat
                    </Button>
                    <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                        Reload Page
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    </div>
);

const mostRecentChat = (candidates: AIChat[]): AIChat =>
    [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

type ResearchMode = "story" | "global";

// Web research desk (P0.4 S0/S6, docs/Chat_Panel_Integrations_Design.md §6, chat-list rail added
// later) — Story mode (default, light story seasoning via title+synopsis, opt-in Notes/Lorebook)
// vs. Global mode (pure web, not story-bound), each its own chat-list rail rather than a single
// permanently-growing chat — storyId is baked into a chat row's identity (nullable, not a per-turn
// context toggle), so Story and Global are genuinely separate rails, not one chat with a flag.
// Both rails share the exact most-recent-or-create auto-select pattern OutlineChatRail.tsx
// established.
export const ResearchTool = () => {
    const { currentStoryId, pendingChatComposerSeed, setPendingChatComposerSeed, pendingShuttleSeed, setPendingShuttleSeed } =
        useStoryContext();
    const [mode, setMode] = useState<ResearchMode>(currentStoryId ? "story" : "global");

    // Keep mode valid if the active story changes/clears while Research is open — Story mode with
    // no story to bind to doesn't make sense.
    useEffect(() => {
        if (!currentStoryId && mode === "story") setMode("global");
    }, [currentStoryId, mode]);

    // Chat Shuttle's Open handoff always targets Story mode (docs/Chat_Shuttle_Design.md's "story
    // mode default") regardless of whichever mode Research happened to be showing already.
    useEffect(() => {
        if (pendingShuttleSeed && currentStoryId) setMode("story");
    }, [pendingShuttleSeed, currentStoryId]);

    const [selectedStoryChat, setSelectedStoryChat] = useState<AIChat | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: storyChats = [], isLoading: storyChatsLoading } = useChatsByStoryQuery(currentStoryId ?? "", "research");

    // Clear the selected chat whenever the active story changes, so switching stories never leaves
    // a stale chat from a different story mounted while the new one's list is still loading.
    useEffect(() => {
        setSelectedStoryChat(null);
    }, [currentStoryId]);

    useEffect(() => {
        if (mode !== "story" || !currentStoryId || selectedStoryChat || storyChatsLoading) return;
        if (storyChats.length > 0) {
            setSelectedStoryChat(mostRecentChat(storyChats));
            return;
        }
        createMutation.mutate(
            { storyId: currentStoryId, chatType: "research", title: "Research" },
            { onSuccess: newChat => setSelectedStoryChat(newChat) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, currentStoryId, storyChats, storyChatsLoading, selectedStoryChat]);

    // Global rail — same auto-select-most-recent-or-create shape as Story mode above, just backed
    // by the storyId-less list/create endpoints instead.
    const [selectedGlobalChat, setSelectedGlobalChat] = useState<AIChat | null>(null);
    const createGlobalMutation = useCreateGlobalChatMutation();
    const { data: globalChats = [], isLoading: globalChatsLoading } = useGlobalChatsQuery("research");

    useEffect(() => {
        if (mode !== "global" || selectedGlobalChat || globalChatsLoading) return;
        if (globalChats.length > 0) {
            setSelectedGlobalChat(mostRecentChat(globalChats));
            return;
        }
        createGlobalMutation.mutate(
            { chatType: "research", title: "Research" },
            { onSuccess: newChat => setSelectedGlobalChat(newChat) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, globalChats, globalChatsLoading, selectedGlobalChat]);

    const chat = mode === "story" ? selectedStoryChat : selectedGlobalChat;

    // T10 CR7 — Research's first-ever collapse state (previously neither ChatList nor
    // GlobalResearchChatList had one lifted here); defaults collapsed on first paint (Axis 6).
    const [chatListCollapsed, setChatListCollapsed] = useChatListCollapse(undefined, undefined, true);
    // T10 CR8 — icon-vs-label width toggle for the ChatToolsRail itself (separate axis from
    // chatListCollapsed above). Mirrors EditorToolsPanel's own collapsed/onToggleCollapsed.
    const [toolsRailCollapsed, setToolsRailCollapsed] = useState(true);
    // Single source of truth for the Context & memory toggles, shared with ChatInterface
    // (contextToggles/contextPanelMode="external" below) and the rail's own "Context" panel.
    const contextToggles = useChatContextToggles(chat, "research");
    const [openPanelId, setOpenPanelId] = useState<string | null>(null);

    // Brainstorm's "Handoff → Research" tray action (P0.4 B0-B4) — same one-shot consumption
    // posture as OutlineChatRail's, generalized via StoryContext.pendingChatComposerSeed.
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    useEffect(() => {
        if (!pendingChatComposerSeed || pendingChatComposerSeed.tool !== "research" || !chat) return;
        setComposerSeedText(pendingChatComposerSeed.text);
        setPendingChatComposerSeed(null);
    }, [pendingChatComposerSeed, chat, setPendingChatComposerSeed]);

    // Chat Shuttle's Open handoff (H2, docs/Chat_Shuttle_Design.md) — same one-shot seed pattern
    // as above, plus captures which origin chat/shuttle item a later "Send brief to origin" (H5)
    // should post back to. Deliberately kept in local state only (lost on remount/reload), same
    // volatile posture pendingChatComposerSeed/pendingLorebookSeed already have — the shuttle item
    // itself stays Openable from the origin tray regardless, so nothing is lost, just this one
    // convenience shortcut.
    const [activeShuttleContext, setActiveShuttleContext] = useState<{ originChatId: string; shuttleItemId: string } | null>(null);
    useEffect(() => {
        if (!pendingShuttleSeed || mode !== "story" || !chat) return;
        setComposerSeedText(pendingShuttleSeed.text);
        setActiveShuttleContext({ originChatId: pendingShuttleSeed.originChatId, shuttleItemId: pendingShuttleSeed.shuttleItemId });
        setPendingShuttleSeed(null);
    }, [pendingShuttleSeed, mode, chat, setPendingShuttleSeed]);

    // H5 — "Send brief to origin": takes the latest assistant reply as-is (summary, truncated) plus
    // whatever markdown-link citations it contains, and posts it as a NEW brainstormChecklist row
    // (kind: "shuttle_return") on the ORIGIN chat's own tray — never auto-injected into that chat's
    // transcript (decision #3). Reusable any time after the first reply, not a one-shot action.
    const handleSendBriefBack = () => {
        if (!activeShuttleContext || !currentStoryId || !chat) return;
        const lastAssistant = [...chat.messages].reverse().find(m => m.role === "assistant");
        if (!lastAssistant) {
            toast.error("No Research reply yet to send back.");
            return;
        }
        brainstormApi
            .createChecklistItem({
                chatId: activeShuttleContext.originChatId,
                storyId: currentStoryId,
                kind: "shuttle_return",
                payload: { summary: lastAssistant.content.slice(0, 1200), links: extractMarkdownLinks(lastAssistant.content) },
                sourceMessageId: lastAssistant.id
            })
            .then(item => {
                toast.success("Sent brief back to the origin chat's tray");
                // Transfer Log (T1) — fetch the origin chat for its chatType/title (not carried
                // by activeShuttleContext, which only has the id) rather than logging with an
                // unknown toDesk.
                chatsApi
                    .getById(activeShuttleContext.originChatId)
                    .then(originChat =>
                        deskTransfersApi.log(currentStoryId, {
                            event: "proposed",
                            kind: "shuttle_return",
                            fromDesk: "research",
                            fromChatId: chat.id,
                            fromChatTitleSnapshot: chat.title,
                            toDesk: originChat.chatType ?? "general",
                            toChatId: originChat.id,
                            toChatTitleSnapshot: originChat.title,
                            subject: lastAssistant.content.slice(0, 1200),
                            sourceChecklistItemId: item.id
                        })
                    )
                    .catch(() => {});
            })
            .catch(() => toast.error("Failed to send brief back"));
    };

    const handleChatUpdate = (updated: AIChat) => {
        if (mode === "story") setSelectedStoryChat(updated);
        else setSelectedGlobalChat(updated);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 pb-0">
                <Tabs value={mode} onValueChange={value => setMode(value as ResearchMode)}>
                    <TabsList>
                        <TabsTrigger
                            value="story"
                            disabled={!currentStoryId}
                            className={mode === "story" ? "raycast-pill-active" : ""}
                        >
                            Story
                        </TabsTrigger>
                        <TabsTrigger value="global" className={mode === "global" ? "raycast-pill-active" : ""}>
                            Global
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <div className="flex-1 min-h-0 flex min-w-0">
                <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                    {activeShuttleContext && chat && (
                        <div className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                            <p className="text-xs text-muted-foreground">Shuttled in from another chat.</p>
                            <Button size="sm" variant="outline" onClick={handleSendBriefBack} className="flex items-center gap-1">
                                <Send className="h-3 w-3" />
                                Send brief to origin
                            </Button>
                        </div>
                    )}
                    {!chat ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <LorebookProvider storyId={mode === "story" ? (currentStoryId ?? "") : ""}>
                            <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[chat.id]}>
                                <ChatInterface
                                    promptType="research"
                                    storyId={mode === "story" ? (currentStoryId ?? undefined) : undefined}
                                    selectedChat={chat}
                                    onChatUpdate={handleChatUpdate}
                                    initialComposerText={composerSeedText}
                                    contextToggles={contextToggles}
                                    contextPanelMode="external"
                                />
                            </ErrorBoundary>
                        </LorebookProvider>
                    )}
                </div>

                {/* T10 CR7 — the "Chats" bucket's collapsing column. GlobalResearchChatList has no
                    collapse props of its own (unlike ChatList) — the wrapper's own overflow-hidden
                    handles hiding it visually while collapsed. */}
                <div
                    className={cn(
                        "flex flex-col shrink-0 transition-all duration-300",
                        chatListCollapsed ? "w-0 overflow-hidden" : "w-[250px] sm:w-[300px]"
                    )}
                >
                    {mode === "story" && currentStoryId ? (
                        <ChatList
                            storyId={currentStoryId}
                            chatType="research"
                            title="Research Chats"
                            emptyLabel="No research chats yet"
                            selectedChat={selectedStoryChat}
                            onSelectChat={setSelectedStoryChat}
                            side="right"
                            collapsed={chatListCollapsed}
                            onCollapsedChange={setChatListCollapsed}
                            hideToggle
                        />
                    ) : mode === "global" ? (
                        <GlobalResearchChatList selectedChat={selectedGlobalChat} onSelectChat={setSelectedGlobalChat} />
                    ) : null}
                </div>

                {/* T10 CR7 — Context & memory as a ChatToolsRail modal panel, plus the Chats
                    primitive above (docs/Chat_Chrome_Declutter_Design.md). No Approvals bucket —
                    Research has no Codex/Shuttle/checklist tray to put in one. */}
                <ChatToolsRail
                    collapsed={toolsRailCollapsed}
                    onToggleCollapsed={() => setToolsRailCollapsed(c => !c)}
                    chatsOpen={!chatListCollapsed}
                    onToggleChats={() => setChatListCollapsed(!chatListCollapsed)}
                    openPanelId={openPanelId}
                    onTogglePanel={id => setOpenPanelId(cur => (cur === id ? null : id))}
                    onClosePanel={() => setOpenPanelId(null)}
                    panels={
                        chat
                            ? [
                                  {
                                      id: "context",
                                      icon: SlidersHorizontal,
                                      label: "Context",
                                      title: "Context & memory",
                                      content: <ChatContextPanelContent selectedChat={chat} promptType="research" toggles={contextToggles} />,
                                      badge:
                                          contextToggles.armedLabels.length > 0 ? (
                                              <Badge variant="secondary" className="font-normal ml-2">
                                                  {contextToggles.armedLabels.join(" · ")}
                                              </Badge>
                                          ) : undefined
                                  }
                              ]
                            : []
                    }
                />
            </div>
        </div>
    );
};
