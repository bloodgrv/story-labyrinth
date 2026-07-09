import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { chatsApi } from "@/services/api/client";

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

// A single global, cross-story chat for general research/reference — see CLAUDE.md's
// "Global Info/Research Chat". No story context, no chat list, no templates: the server
// get-or-creates the one Research chat on first load (chatsApi.getOrCreateGlobal).
export const ResearchTool = () => {
    const queryClient = useQueryClient();
    const { data: chat, isLoading } = useQuery({
        queryKey: ["chats", "global", "research"],
        queryFn: () => chatsApi.getOrCreateGlobal("research", "Research")
    });

    if (isLoading || !chat)
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );

    return (
        <LorebookProvider storyId="">
            <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[chat.id]}>
                <ChatInterface
                    promptType="research"
                    selectedChat={chat}
                    onChatUpdate={updated => queryClient.setQueryData(["chats", "global", "research"], updated)}
                />
            </ErrorBoundary>
        </LorebookProvider>
    );
};
