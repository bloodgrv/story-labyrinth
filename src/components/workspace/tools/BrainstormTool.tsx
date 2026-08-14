import { AlertCircle, Inbox, MessageSquare, Plus, RefreshCcw, SlidersHorizontal, Upload, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrainstormCharacterImportPanel } from "@/features/brainstorm/components/BrainstormCharacterImportPanel";
import { BrainstormChecklistTray } from "@/features/brainstorm/components/BrainstormChecklistTray";
import { useBrainstormChecklistQuery } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { ChatToolsRail } from "@/features/chat/components/ChatToolsRail";
import { GuidedSetupControl } from "@/features/chat/components/GuidedSetupControl";
import { useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { useChatListCollapse } from "@/features/chat/hooks/useChatListCollapse";
import { useChatsByStoryQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { chatsApi } from "@/services/api/client";
import type { AIChat } from "@/types/story";
import type { ChatStyle } from "@/types/worldbuilding";

// Opening lines sent into the composer (not auto-sent — user still hits Send) when "Guided
// setup" is clicked. Mirrors the depth each style's own system-prompt hint asks the model to
// bring (chatContextService.ts's BRAINSTORM_STYLE_HINTS) — this doesn't run any interview logic
// itself, it just starts the conversation in the right register (P0.4 B1/B2, confirmed
// prompt-driven, not a tracked state machine). Moved here from GuidedSetupControl.tsx when that
// component was generalized for WB/Outline reuse (P0.4 B5) — each host now owns its own opening
// lines instead of the shared component hardcoding Brainstorm's.
const OPENING_LINES: Record<ChatStyle, string> = {
    light: "Let's rough out my story idea — keep it quick, just the essentials.",
    standard: "Let's set up my project — walk me through the basics of premise, genre, characters, and setting.",
    grill: "Let's do a full guided setup — grill me on the details until we've got a solid premise, genre, protagonist, setting, and central conflict nailed down."
};

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

// P0.4 B0-B4 — Brainstorm migrated off its own parallel chat stack onto the shared
// aiChats/chatContextService/ChatInterface stack (chatType: "brainstorm"), same move Outline
// made in R5/R7. No separate tree/rail split needed here (unlike Outline) — the chat + tray IS
// the whole tool, so this top-level tool component doubles as the "rail" OutlineChatRail is.
export const BrainstormTool = () => {
    const { currentStoryId } = useStoryContext();
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    // T10 CR7 — defaults collapsed on first paint (Axis 6), same as Notes/Outline's CR1 wiring;
    // BrainstormChecklistTray moved off this column onto ChatToolsRail's Approvals panel below.
    const [chatListCollapsed, setChatListCollapsed] = useChatListCollapse(undefined, undefined, true);
    // T10 CR8 — icon-vs-label width toggle for the ChatToolsRail itself (separate axis from
    // chatListCollapsed above). Mirrors EditorToolsPanel's own collapsed/onToggleCollapsed.
    const [toolsRailCollapsed, setToolsRailCollapsed] = useState(true);
    // Single source of truth for the Context & memory toggles, shared with ChatInterface
    // (contextToggles/contextPanelMode="external" below) and the rail's own "Context" panel.
    const contextToggles = useChatContextToggles(selectedChat, "brainstorm");
    // Mounted here (not just inside BrainstormChecklistTray) so the "Approvals" icon's
    // pending-count badge stays live while its drawer — and the tray — are unmounted. Shares the
    // tray's own query cache key, same pattern NotesChatRail.tsx's CR3 used.
    const { data: activeChecklistItems = [] } = useBrainstormChecklistQuery(selectedChat?.id, "active");
    const [openPanelId, setOpenPanelId] = useState<string | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(currentStoryId ?? "", "brainstorm");

    const mostRecentChat = (candidates: AIChat[]): AIChat =>
        [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

    // Auto-select on first load: reuse the story's most recent Brainstorm chat, or create one —
    // same pattern as OutlineChatRail's auto-select effect.
    useEffect(() => {
        if (!currentStoryId || selectedChat || chatsLoading) return;
        if (chats.length > 0) {
            setSelectedChat(mostRecentChat(chats));
            return;
        }
        createMutation.mutate(
            { storyId: currentStoryId, chatType: "brainstorm", title: "Brainstorm" },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chats, chatsLoading, selectedChat, currentStoryId]);

    const handleCreateNewChat = () => {
        if (!currentStoryId) return;
        createMutation.mutate(
            { storyId: currentStoryId, chatType: "brainstorm", title: `New Chat ${new Date().toLocaleString()}` },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
    };

    const handleStyleChange = (style: ChatStyle) => {
        if (!selectedChat) return;
        void chatsApi.update(selectedChat.id, { brainstormStyle: style }).then(setSelectedChat);
    };

    const renderNewChatButton = () => (
        <Button variant="outline" size="sm" onClick={handleCreateNewChat} className="flex items-center gap-1">
            <Plus className="h-4 w-4" />
            New Chat
        </Button>
    );

    if (!currentStoryId)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">No story selected</p>
            </div>
        );

    return (
        <LorebookProvider storyId={currentStoryId}>
            <div className="flex h-full min-w-0">
                <div className="flex-1 h-full min-h-0 min-w-0 flex flex-col">
                    {selectedChat ? (
                        // min-h-0 is load-bearing — without it this flex-1 child can't shrink
                        // below its content's height, so a long reply grows the whole column
                        // instead of scrolling internally, pushing the composer out of view below
                        // the fold.
                        <div className="flex-1 min-h-0">
                            <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                                <ChatInterface
                                    storyId={currentStoryId}
                                    promptType="brainstorm"
                                    selectedChat={selectedChat}
                                    onChatUpdate={setSelectedChat}
                                    enableProseProposals={false}
                                    initialComposerText={composerSeedText}
                                    contextToggles={contextToggles}
                                    contextPanelMode="external"
                                />
                            </ErrorBoundary>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                            <p className="text-sm text-center max-w-xs">Setting up your Brainstorm chat…</p>
                        </div>
                    )}
                </div>

                <div
                    className={cn(
                        "flex flex-col shrink-0 transition-all duration-300",
                        chatListCollapsed ? "w-0" : "w-[250px] sm:w-[300px]"
                    )}
                >
                    <ChatList
                        storyId={currentStoryId}
                        chatType="brainstorm"
                        title="Brainstorm Chats"
                        emptyLabel="No brainstorm chats yet"
                        selectedChat={selectedChat}
                        onSelectChat={setSelectedChat}
                        renderNewChatAction={renderNewChatButton}
                        side="right"
                        collapsed={chatListCollapsed}
                        onCollapsedChange={setChatListCollapsed}
                        hideToggle
                    />
                </div>

                {/* T10 CR7 — Approvals (BrainstormChecklistTray) and Context & memory as
                    ChatToolsRail modal panels, plus the Chats primitive above
                    (docs/Chat_Chrome_Declutter_Design.md). */}
                <ChatToolsRail
                    collapsed={toolsRailCollapsed}
                    onToggleCollapsed={() => setToolsRailCollapsed(c => !c)}
                    chatsOpen={!chatListCollapsed}
                    onToggleChats={() => setChatListCollapsed(!chatListCollapsed)}
                    openPanelId={openPanelId}
                    onTogglePanel={id => setOpenPanelId(cur => (cur === id ? null : id))}
                    onClosePanel={() => setOpenPanelId(null)}
                    panels={
                        selectedChat
                            ? [
                                  {
                                      id: "approvals",
                                      icon: Inbox,
                                      label: "Approvals",
                                      title: "Approvals",
                                      content: (
                                          <BrainstormChecklistTray
                                              chatId={selectedChat.id}
                                              storyId={currentStoryId}
                                              fromChatTitleSnapshot={selectedChat.title}
                                          />
                                      ),
                                      badge:
                                          activeChecklistItems.length > 0 ? (
                                              <Badge variant="secondary" className="font-normal ml-2">
                                                  {activeChecklistItems.length} pending
                                              </Badge>
                                          ) : undefined,
                                      compactBadge:
                                          activeChecklistItems.length > 0 ? (
                                              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                                  {activeChecklistItems.length}
                                              </span>
                                          ) : undefined
                                  },
                                  {
                                      id: "context",
                                      icon: SlidersHorizontal,
                                      label: "Context",
                                      title: "Context & memory",
                                      content: (
                                          <ChatContextPanelContent selectedChat={selectedChat} promptType="brainstorm" toggles={contextToggles} />
                                      ),
                                      badge:
                                          contextToggles.armedLabels.length > 0 ? (
                                              <Badge variant="secondary" className="font-normal ml-2">
                                                  {contextToggles.armedLabels.join(" · ")}
                                              </Badge>
                                          ) : undefined
                                  },
                                  {
                                      id: "import-characters",
                                      icon: Upload,
                                      label: "Import",
                                      title: "Import characters from a document",
                                      content: <BrainstormCharacterImportPanel chatId={selectedChat.id} storyId={currentStoryId} />
                                  },
                                  {
                                      id: "playbook",
                                      icon: Wand2,
                                      label: "Playbook",
                                      title: "Guided setup",
                                      content: (
                                          <GuidedSetupControl
                                              style={(selectedChat.brainstormStyle as ChatStyle) ?? "standard"}
                                              onStyleChange={handleStyleChange}
                                              blurb="Start designing your project here — or run Guided setup for a structured interview."
                                              onGuidedSetup={style => setComposerSeedText(OPENING_LINES[style])}
                                          />
                                      )
                                  }
                              ]
                            : []
                    }
                />
            </div>
        </LorebookProvider>
    );
};
