import { AlertCircle, MessageSquare, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AIChat } from "@/types/story";
import { ChatInterface } from "./ChatInterface";
import { ChatList } from "./ChatList";

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

interface EditorChatRailProps {
    storyId: string;
    // Outline's rail passes false — outline items are structured data, not prose, so there's
    // nothing for a prose-proposal Accept to insert into. See ChatInterface's own prop doc.
    enableProseProposals?: boolean;
}

// Docked chat companion for the Editor and Outline tools (chatType="editor", shared between
// both — CLAUDE.md's "Main Editor Chat" is one context, not split per-tool). Multiple named
// chats per story (not a single unbounded thread) so context stays manageable per chapter/arc.
export function EditorChatRail({ storyId, enableProseProposals = true }: EditorChatRailProps) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);

    return (
        <div className="flex h-full">
            <div className="flex-1 h-full min-h-0">
                {selectedChat ? (
                    <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                        <ChatInterface
                            storyId={storyId}
                            promptType="editor"
                            selectedChat={selectedChat}
                            onChatUpdate={setSelectedChat}
                            enableProseProposals={enableProseProposals}
                        />
                    </ErrorBoundary>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Start a chat to write and revise alongside the AI.</p>
                    </div>
                )}
            </div>

            <ChatList
                storyId={storyId}
                chatType="editor"
                title="Editor Chats"
                emptyLabel="No editor chats yet"
                selectedChat={selectedChat}
                onSelectChat={setSelectedChat}
                side="right"
            />
        </div>
    );
}
