import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Inbox, Library, MessageSquare, Paperclip, Plus, RefreshCcw, SlidersHorizontal, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrainstormChecklistQuery } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { ChatToolsRail } from "@/features/chat/components/ChatToolsRail";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { GuidedSetupControl } from "@/features/chat/components/GuidedSetupControl";
import { ShuttleTray } from "@/features/chat/components/ShuttleTray";
import { useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { useChatListCollapse } from "@/features/chat/hooks/useChatListCollapse";
import { useChatProposalsQuery } from "@/features/chat/hooks/useCodexProposalsQuery";
import { useChatsByStoryQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import type { ParsedLoreSuggestion } from "@/features/chat/services/parseLoreSuggestions";
import { useHierarchicalLorebookQuery } from "@/features/lorebook/hooks/useLorebookQuery";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { OutlineImportCard } from "@/features/outline/components/OutlineImportCard";
import { outlineImportKeys, useUploadOutlineImportMutation } from "@/features/outline/hooks/useOutlineImportQuery";
import { useOutlineQuery } from "@/features/outline/hooks/useOutlineQuery";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { chatsApi, outlineImportApi } from "@/services/api/client";
import type { AIChat } from "@/types/story";
import type { ChatStyle } from "@/types/worldbuilding";
import { OutlineProposalTray } from "./OutlineProposalTray";

// Opening lines for Outline's Guided Setup, per style (P0.4 B5) — mirrors BrainstormTool.tsx's/
// LorebookEntryEditor.tsx's own per-host opening-line maps.
const OUTLINE_OPENING_LINES: Record<ChatStyle, string> = {
    light: "Let's rough out the structure — just the high-level beats for now.",
    standard: "Let's build out the structure — walk me through chapters and scenes.",
    grill: "Let's plan this scene-by-scene — grill me on goal, conflict, and outcome for each."
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

interface OutlineChatRailProps {
    storyId: string;
    // Controlled by OutlinePage.tsx via its ResizablePanel's own imperative collapse/expand
    // (react-resizable-panels) — this rail sits inside a resizable panel group, so the actual
    // collapse has to resize that panel, not just this component's own CSS. Falls back to plain
    // internal state when omitted (e.g. any future non-resizable-panel host).
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}

// Dedicated Outline chat rail (P0.4 R5/R7) — was EditorChatRail with chatType="editor" relabeled
// (see docs/CURRENT_BACKLOG.md's P0.4 note on why this plan folds R7's chatType split in here);
// now its own chatType="outline"/promptType="outline". Unlike Editor (anchored per chapter) or
// World-Building (anchored per entry), Outline chat isn't opened "from" one row — it reads the
// whole story's outline tree unconditionally (chatContextService.ts) — so find-or-create here is
// simply "the story's most-recently-updated outline chat, else create one," used both for a
// pending rework request AND for auto-selecting a chat on first mount (unlike EditorChatRail,
// which leaves the "no chat selected" empty state for the user to act on manually).
export function OutlineChatRail({ storyId, collapsed, onCollapsedChange }: OutlineChatRailProps) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const [loreSuggestions, setLoreSuggestions] = useState<ParsedLoreSuggestion[]>([]);
    // Lifted out of ChatList so the import card beside it collapses in sync — otherwise the list
    // shrinks but the card is left stranded at full width (see NotesChatRail.tsx's own fix). T10
    // CR7 — defaults collapsed on first paint (Axis 6), same as Notes' CR1; `collapsed`/
    // `onCollapsedChange` are dead props today (OutlinePage.tsx never passes them, deliberately —
    // see its own comment), so this is a pure port, not a behavior change to OutlinePage.
    const [chatListCollapsed, setChatListCollapsed] = useChatListCollapse(collapsed, onCollapsedChange, true);
    // T10 CR8 — icon-vs-label width toggle for the ChatToolsRail itself (separate axis from
    // chatListCollapsed above). Mirrors EditorToolsPanel's own collapsed/onToggleCollapsed.
    const [toolsRailCollapsed, setToolsRailCollapsed] = useState(true);
    // T10 CR7 — single source of truth for the Context & memory toggles, shared with ChatInterface
    // (contextToggles/contextPanelMode="external" below) and the rail's own "Context" panel.
    const contextToggles = useChatContextToggles(selectedChat, "outline", setSelectedChat);
    // Added on user request, mirroring WB's own "Story Context" rail panel (LorebookEntryEditor.tsx)
    // — same single-source-of-truth pattern as contextToggles above, for the manual chapter/
    // lorebook-entry picker (ContextSelector), so this rail's own panel and ChatInterface's
    // generate() payload read the same state instead of two independent copies.
    const contextSelection = useContextSelection();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);
    const { data: lorebookEntries = [] } = useHierarchicalLorebookQuery(storyId);
    const getFilteredEntries = () => getFilteredLorebookEntries(lorebookEntries, false);
    const handleContextItemSelect = (itemId: string) => {
        const item = getFilteredEntries().find(e => e.id === itemId);
        if (item) contextSelection.addItem(item);
    };
    // Mounted here (not just inside CodexProposalTray/ShuttleTray) so the "Approvals" icon's
    // pending-count badge stays live while its drawer — and those tray components — are unmounted.
    // Same pattern NotesChatRail.tsx's CR3 used; shares each tray's own query cache key.
    const { data: pendingCodexProposals = [] } = useChatProposalsQuery(selectedChat?.id, "pending");
    const { data: activeShuttleItems = [] } = useBrainstormChecklistQuery(selectedChat?.id, "active");
    const [openPanelId, setOpenPanelId] = useState<string | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "outline");
    const pendingRework = usePendingRework();
    const { pendingChatComposerSeed, setPendingChatComposerSeed } = useStoryContext();
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);

    // OI6 — file-attach entry point. No drag/drop precedent exists anywhere in chat (see
    // DECISIONS.md's "Outline Import" entry); a click-to-attach button matches this app's usual
    // upload UX (hidden <input type="file"> + button) more closely than inventing a drop zone.
    const { data: outlineItems = [] } = useOutlineQuery(storyId);
    const uploadMutation = useUploadOutlineImportMutation(storyId);
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

    const runImport = (file: File, mode: "append" | "replace") => {
        uploadMutation.mutate(
            { file, chatId: selectedChat?.id },
            {
                onSuccess: async result => {
                    if (mode === "replace") {
                        await outlineImportApi.updateBatch(result.batch.id, { mode: "replace" });
                        queryClient.invalidateQueries({ queryKey: outlineImportKeys.active(storyId) });
                    }
                }
            }
        );
    };

    const handleImportFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        // Design lock #3: empty outline extracts immediately, non-empty asks intent first.
        if (outlineItems.length === 0) runImport(file, "append");
        else setPendingImportFile(file);
    };

    const mostRecentChat = (candidates: AIChat[]): AIChat =>
        [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

    // Auto-select on first load: reuse the story's most recent Outline chat, or create one — no
    // manual "New Chat" click needed just to start using the rail.
    useEffect(() => {
        if (selectedChat || chatsLoading) return;
        if (chats.length > 0) {
            setSelectedChat(mostRecentChat(chats));
            return;
        }
        createMutation.mutate(
            { storyId, chatType: "outline", title: "Outline Chat" },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chats, chatsLoading, selectedChat, storyId]);

    // Brainstorm's "Handoff → Outline" tray action (P0.4 B0-B4) — same one-shot consumption
    // posture as LorebookPage.tsx's pendingLorebookSeed effect, generalized via
    // StoryContext.pendingChatComposerSeed. Just prefills the composer via ChatInterface's
    // initialComposerText prop below; the auto-select effect above already guarantees a chat
    // exists to receive it.
    useEffect(() => {
        if (!pendingChatComposerSeed || pendingChatComposerSeed.tool !== "outline" || !selectedChat) return;
        setComposerSeedText(pendingChatComposerSeed.text);
        setPendingChatComposerSeed(null);
    }, [pendingChatComposerSeed, selectedChat, setPendingChatComposerSeed]);

    // Bridges a "Rework in chat" click on an outline row (OutlineChapterCard.tsx/
    // OutlineSceneRow.tsx, P0.4 R8) into this rail via pendingReworkStore — mirrors
    // EditorChatRail.tsx's effect, but since Outline chat isn't per-item anchored, this just
    // reuses whichever chat is already selected (or the same auto-select logic above) rather than
    // filtering by an anchor id.
    useEffect(() => {
        if (!pendingRework || pendingRework.panel !== "outline" || pendingRework.storyId !== storyId || chatsLoading) return;
        const request = consumePendingRework();
        if (!request) return;

        const payload: InitialReworkPayload = {
            target: request.target,
            packet: request.packet,
            initialInstruction: request.initialInstruction
        };

        if (selectedChat) {
            setInitialRework({ chatId: selectedChat.id, payload });
            return;
        }
        if (chats.length > 0) {
            const chat = mostRecentChat(chats);
            setSelectedChat(chat);
            setInitialRework({ chatId: chat.id, payload });
            return;
        }
        createMutation.mutate(
            { storyId, chatType: "outline", title: "Outline Chat" },
            {
                onSuccess: newChat => {
                    setSelectedChat(newChat);
                    setInitialRework({ chatId: newChat.id, payload });
                }
            }
        );
    }, [pendingRework, storyId, chats, chatsLoading, selectedChat, createMutation]);

    const handleCreateNewChat = () => {
        createMutation.mutate(
            { storyId, chatType: "outline", title: `New Chat ${new Date().toLocaleString()}` },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
    };

    const renderNewChatButton = () => (
        <Button variant="gradient" size="sm" onClick={handleCreateNewChat} className="flex items-center gap-1">
            <Plus className="h-4 w-4" />
            New Chat
        </Button>
    );

    // P0.4 B5 — Outline's guided-start style (no template/psych toggle, unlike WB — see
    // LorebookEntryEditor.tsx's WorldBuildingChatPanel for that shape).
    const handleStyleChange = (style: ChatStyle) => {
        if (!selectedChat) return;
        void chatsApi.update(selectedChat.id, { outlineStyle: style }).then(setSelectedChat);
    };

    return (
        <div className="flex h-full min-w-0">
            <div className="flex-1 h-full min-h-0 min-w-0 flex flex-col">
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={handleImportFileSelected} />
                <div className="flex items-center justify-end border-b border-input px-2 py-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadMutation.isPending}
                    >
                        <Paperclip className="h-3.5 w-3.5" />
                        Import structure document…
                    </Button>
                </div>
                {selectedChat ? (
                    // min-h-0 is load-bearing — without it this flex-1 child can't shrink below
                    // its content's height, so a long reply grows the whole column instead of
                    // scrolling internally, pushing the composer out of view below the fold.
                    <div className="flex-1 min-h-0">
                        <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                            <ChatInterface
                                storyId={storyId}
                                promptType="outline"
                                selectedChat={selectedChat}
                                onChatUpdate={setSelectedChat}
                                enableProseProposals={false}
                                initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                                initialComposerText={composerSeedText}
                                onLoreSuggestions={suggestions => setLoreSuggestions(prev => [...prev, ...suggestions])}
                                contextToggles={contextToggles}
                                contextPanelMode="external"
                                contextSelection={contextSelection}
                                storyContextPanelMode="external"
                            />
                        </ErrorBoundary>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Setting up your Outline chat…</p>
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
                    storyId={storyId}
                    chatType="outline"
                    title="Outline Chats"
                    emptyLabel="No outline chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderNewChatButton}
                    side="right"
                    collapsed={chatListCollapsed}
                    onCollapsedChange={setChatListCollapsed}
                    hideToggle
                />
                {/* T10 CR7 — OutlineImportCard stays here (not ChatToolsRail's hostExtras, which
                    is too narrow in icon-only mode for a card+button) — Approvals/Context trays
                    moved out to the rail's modal panels below. Not rendered while collapsed, same
                    reasoning as NotesChatRail.tsx's own tray used to have. */}
                {!chatListCollapsed && <OutlineImportCard storyId={storyId} />}
            </div>

            {/* T10 CR7 — Approvals (Codex+Shuttle+lore-suggestion trays) and Context & memory as
                ChatToolsRail modal panels, plus the Chats primitive above (docs/Chat_Chrome_Declutter_Design.md). */}
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
                                      <div className="flex h-full flex-col">
                                          <CodexProposalTray chatId={selectedChat.id} />
                                          <ShuttleTray
                                              chatId={selectedChat.id}
                                              storyId={storyId}
                                              fromDesk={selectedChat.chatType ?? "outline"}
                                              fromChatTitleSnapshot={selectedChat.title}
                                              onAnswerHere={setComposerSeedText}
                                          />
                                          <OutlineProposalTray
                                              loreSuggestions={loreSuggestions}
                                              storyId={storyId}
                                              fromChatId={selectedChat.id}
                                              fromChatTitleSnapshot={selectedChat.title}
                                          />
                                      </div>
                                  ),
                                  badge: (() => {
                                      const count = pendingCodexProposals.length + activeShuttleItems.length + loreSuggestions.length;
                                      return count > 0 ? (
                                          <Badge variant="secondary" className="font-normal ml-2">
                                              {count} pending
                                          </Badge>
                                      ) : undefined;
                                  })(),
                                  compactBadge: (() => {
                                      const count = pendingCodexProposals.length + activeShuttleItems.length + loreSuggestions.length;
                                      return count > 0 ? (
                                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                              {count}
                                          </span>
                                      ) : undefined;
                                  })()
                              },
                              {
                                  id: "context",
                                  icon: SlidersHorizontal,
                                  label: "Context",
                                  title: "Context & memory",
                                  content: <ChatContextPanelContent selectedChat={selectedChat} promptType="outline" toggles={contextToggles} />,
                                  badge:
                                      contextToggles.armedLabels.length > 0 ? (
                                          <Badge variant="secondary" className="font-normal ml-2">
                                              {contextToggles.armedLabels.join(" · ")}
                                          </Badge>
                                      ) : undefined
                              },
                              {
                                  id: "story-context",
                                  icon: Library,
                                  label: "Story Context",
                                  title: "Story Context",
                                  content: (
                                      <ContextSelector
                                          includeFullContext={contextSelection.includeFullContext}
                                          contextOpen={contextSelection.contextOpen}
                                          selectedSummaries={contextSelection.selectedSummaries}
                                          selectedItems={contextSelection.selectedItems}
                                          selectedChapterContent={contextSelection.selectedChapterContent}
                                          chapters={chapters}
                                          lorebookEntries={lorebookEntries}
                                          onToggleFullContext={contextSelection.toggleFullContext}
                                          onToggleContextOpen={contextSelection.toggleContextOpen}
                                          onToggleSummary={contextSelection.toggleSummary}
                                          onItemSelect={handleContextItemSelect}
                                          onRemoveItem={contextSelection.removeItem}
                                          onChapterContentSelect={contextSelection.addChapterContent}
                                          onRemoveChapterContent={contextSelection.removeChapterContent}
                                          getFilteredEntries={getFilteredEntries}
                                          hideHeader
                                      />
                                  ),
                                  badge: contextSelection.includeFullContext ? (
                                      <Badge variant="secondary" className="font-normal ml-2">
                                          Full context
                                      </Badge>
                                  ) : (
                                      (() => {
                                          const count =
                                              contextSelection.selectedSummaries.length +
                                              contextSelection.selectedItems.length +
                                              contextSelection.selectedChapterContent.length;
                                          return count > 0 ? (
                                              <Badge variant="secondary" className="font-normal ml-2">
                                                  {count} items
                                              </Badge>
                                          ) : undefined;
                                      })()
                                  )
                              },
                              {
                                  id: "playbook",
                                  icon: Wand2,
                                  label: "Playbook",
                                  title: "Guided setup",
                                  content: (
                                      <GuidedSetupControl
                                          style={(selectedChat.outlineStyle as ChatStyle) ?? "standard"}
                                          onStyleChange={handleStyleChange}
                                          blurb="Plan your story structure here — or run Guided setup for a structured interview."
                                          onGuidedSetup={style => setComposerSeedText(OUTLINE_OPENING_LINES[style])}
                                      />
                                  )
                              }
                          ]
                        : []
                }
            />

            {/* Design lock #3 — non-empty outline: ask intent before extracting, don't silently extract. */}
            <AlertDialog open={pendingImportFile !== null} onOpenChange={open => !open && setPendingImportFile(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Add to or replace the outline?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This story already has outline items. Should the imported structure be appended after them, or
                            should it replace the entire outline once you accept it? You can still review and edit the draft
                            before anything is written either way.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingImportFile(null)}>Cancel</AlertDialogCancel>
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (pendingImportFile) runImport(pendingImportFile, "append");
                                setPendingImportFile(null);
                            }}
                        >
                            Append
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (pendingImportFile) runImport(pendingImportFile, "replace");
                                setPendingImportFile(null);
                            }}
                        >
                            Replace all
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
