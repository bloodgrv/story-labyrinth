import { AlertCircle, MessageSquare, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { useChatsByStoryQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import type { ParsedLoreSuggestion } from "@/features/chat/services/parseLoreSuggestions";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import type { AIChat } from "@/types/story";
import { OutlineProposalTray } from "./OutlineProposalTray";

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
}

// Dedicated Outline chat rail (P0.4 R5/R7) — was EditorChatRail with chatType="editor" relabeled
// (see docs/CURRENT_BACKLOG.md's P0.4 note on why this plan folds R7's chatType split in here);
// now its own chatType="outline"/promptType="outline". Unlike Editor (anchored per chapter) or
// World-Building (anchored per entry), Outline chat isn't opened "from" one row — it reads the
// whole story's outline tree unconditionally (chatContextService.ts) — so find-or-create here is
// simply "the story's most-recently-updated outline chat, else create one," used both for a
// pending rework request AND for auto-selecting a chat on first mount (unlike EditorChatRail,
// which leaves the "no chat selected" empty state for the user to act on manually).
export function OutlineChatRail({ storyId }: OutlineChatRailProps) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const [loreSuggestions, setLoreSuggestions] = useState<ParsedLoreSuggestion[]>([]);
    const createMutation = useCreateChatMutation();
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "outline");
    const pendingRework = usePendingRework();

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
        <Button variant="outline" size="sm" onClick={handleCreateNewChat} className="flex items-center gap-1">
            <Plus className="h-4 w-4" />
            New Chat
        </Button>
    );

    return (
        <div className="flex h-full">
            <div className="flex-1 h-full min-h-0">
                {selectedChat ? (
                    <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                        <ChatInterface
                            storyId={storyId}
                            promptType="outline"
                            selectedChat={selectedChat}
                            onChatUpdate={setSelectedChat}
                            enableProseProposals={false}
                            initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                            onLoreSuggestions={suggestions => setLoreSuggestions(prev => [...prev, ...suggestions])}
                        />
                    </ErrorBoundary>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Setting up your Outline chat…</p>
                    </div>
                )}
            </div>

            <div className="flex flex-col w-[250px] sm:w-[300px] shrink-0">
                <ChatList
                    storyId={storyId}
                    chatType="outline"
                    title="Outline Chats"
                    emptyLabel="No outline chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderNewChatButton}
                    side="right"
                />
                {selectedChat && <CodexProposalTray chatId={selectedChat.id} />}
                <OutlineProposalTray loreSuggestions={loreSuggestions} />
            </div>
        </div>
    );
}
