import { AlertCircle, MessageSquare, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BrainstormChecklistTray } from "@/features/brainstorm/components/BrainstormChecklistTray";
import { GuidedSetupControl, type BrainstormStyle } from "@/features/brainstorm/components/GuidedSetupControl";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { useChatsByStoryQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { chatsApi } from "@/services/api/client";
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

// P0.4 B0-B4 — Brainstorm migrated off its own parallel chat stack onto the shared
// aiChats/chatContextService/ChatInterface stack (chatType: "brainstorm"), same move Outline
// made in R5/R7. No separate tree/rail split needed here (unlike Outline) — the chat + tray IS
// the whole tool, so this top-level tool component doubles as the "rail" OutlineChatRail is.
export const BrainstormTool = () => {
    const { currentStoryId } = useStoryContext();
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
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

    const handleStyleChange = (style: BrainstormStyle) => {
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
            <div className="flex h-full">
                <div className="flex-1 h-full min-h-0 flex flex-col">
                    {selectedChat && (
                        <div className="p-4 pb-0">
                            <GuidedSetupControl
                                style={(selectedChat.brainstormStyle as BrainstormStyle) ?? "standard"}
                                onStyleChange={handleStyleChange}
                                onStartGuidedSetup={setComposerSeedText}
                            />
                        </div>
                    )}
                    {selectedChat ? (
                        <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                            <ChatInterface
                                storyId={currentStoryId}
                                promptType="brainstorm"
                                selectedChat={selectedChat}
                                onChatUpdate={setSelectedChat}
                                enableProseProposals={false}
                                initialComposerText={composerSeedText}
                            />
                        </ErrorBoundary>
                    ) : (
                        <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                            <p className="text-sm text-center max-w-xs">Setting up your Brainstorm chat…</p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col w-[250px] sm:w-[300px] shrink-0">
                    <ChatList
                        storyId={currentStoryId}
                        chatType="brainstorm"
                        title="Brainstorm Chats"
                        emptyLabel="No brainstorm chats yet"
                        selectedChat={selectedChat}
                        onSelectChat={setSelectedChat}
                        renderNewChatAction={renderNewChatButton}
                        side="right"
                    />
                    {selectedChat && <BrainstormChecklistTray chatId={selectedChat.id} storyId={currentStoryId} />}
                </div>
            </div>
        </LorebookProvider>
    );
};
