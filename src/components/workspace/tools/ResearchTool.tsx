import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
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

const mostRecentChat = (candidates: AIChat[]): AIChat =>
    [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

type ResearchMode = "story" | "global";

// Web research desk (P0.4 S0/S6, docs/Chat_Panel_Integrations_Design.md §6) — Story mode (default,
// light story seasoning via title+synopsis, opt-in Notes/Lorebook) vs. Global mode (pure web, not
// story-bound), never a chat list — each mode is just one single-chat identity, same "the one
// chat" posture the pre-S0 version always had for Global. Story mode reuses the exact
// most-recent-or-create pattern OutlineChatRail.tsx established (useChatsByStoryQuery +
// useCreateChatMutation) rather than a new server route — createGenericChat already accepts
// chatType="research" with a real storyId.
export const ResearchTool = () => {
    const queryClient = useQueryClient();
    const { currentStoryId, pendingChatComposerSeed, setPendingChatComposerSeed } = useStoryContext();
    const [mode, setMode] = useState<ResearchMode>(currentStoryId ? "story" : "global");

    // Keep mode valid if the active story changes/clears while Research is open — Story mode with
    // no story to bind to doesn't make sense.
    useEffect(() => {
        if (!currentStoryId && mode === "story") setMode("global");
    }, [currentStoryId, mode]);

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

    const { data: globalChat } = useQuery({
        queryKey: ["chats", "global", "research"],
        queryFn: () => chatsApi.getOrCreateGlobal("research", "Research"),
        enabled: mode === "global"
    });

    const chat = mode === "story" ? selectedStoryChat : (globalChat ?? null);

    // Brainstorm's "Handoff → Research" tray action (P0.4 B0-B4) — same one-shot consumption
    // posture as OutlineChatRail's, generalized via StoryContext.pendingChatComposerSeed.
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    useEffect(() => {
        if (!pendingChatComposerSeed || pendingChatComposerSeed.tool !== "research" || !chat) return;
        setComposerSeedText(pendingChatComposerSeed.text);
        setPendingChatComposerSeed(null);
    }, [pendingChatComposerSeed, chat, setPendingChatComposerSeed]);

    const handleChatUpdate = (updated: AIChat) => {
        if (mode === "story") setSelectedStoryChat(updated);
        else queryClient.setQueryData(["chats", "global", "research"], updated);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 pb-0">
                <Tabs value={mode} onValueChange={value => setMode(value as ResearchMode)}>
                    <TabsList>
                        <TabsTrigger value="story" disabled={!currentStoryId}>
                            Story
                        </TabsTrigger>
                        <TabsTrigger value="global">Global</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
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
                        />
                    </ErrorBoundary>
                </LorebookProvider>
            )}
        </div>
    );
};
