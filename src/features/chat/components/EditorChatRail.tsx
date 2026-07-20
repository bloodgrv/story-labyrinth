import { AlertCircle, MessageSquare, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import type { AIChat } from "@/types/story";
import { ChatInterface } from "./ChatInterface";
import { ChatList } from "./ChatList";
import { CodexProposalTray } from "./CodexProposalTray";
import { useChatsByStoryQuery, useCreateChatMutation } from "../hooks/useChatQuery";

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
    // The chapter currently focused in the editor (StoryEditor's currentChapterId), if any —
    // anchors new chats created here to it, mirroring WorldBuildingChatPanel's entryId pattern.
    // Naturally undefined for Outline's rail (no single focused chapter there) and whenever no
    // chapter tab is open yet — no special-casing needed, see DECISIONS.md's chat-context-
    // anchoring entry.
    anchorChapterId?: string;
}

// Docked chat companion for the Editor and Outline tools (chatType="editor", shared between
// both — CLAUDE.md's "Main Editor Chat" is one context, not split per-tool). Multiple named
// chats per story (not a single unbounded thread) so context stays manageable per chapter/arc.
export function EditorChatRail({ storyId, enableProseProposals = true, anchorChapterId }: EditorChatRailProps) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    // Tracks which chat a captured rework payload belongs to, not just the payload itself — so
    // if the user manually switches chats via ChatList right after a rework resolves (or any
    // other reason selectedChat changes), a stale rework never gets applied to the wrong chat.
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const createMutation = useCreateChatMutation();
    // Same query ChatList already runs internally (chatKeys.byStory(storyId, "editor")) — React
    // Query dedupes the request, this just gives this component a copy of the list too, needed
    // to resolve which chat a pending rework request should bind to.
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "editor");
    const pendingRework = usePendingRework();

    // Bridges a "Rework in chat" click (floating toolbar, inside the Lexical composer tree) into
    // this rail (a sibling panel, outside it) via pendingReworkStore — see that file's doc
    // comment. Finds an Editor chat already anchored to the target chapter and reuses it (most
    // recently updated, if several — surfaced via toast since more than one legitimately-anchored
    // chat means silently picking one is otherwise an invisible guess); creates one if none exist.
    useEffect(() => {
        if (!pendingRework || pendingRework.storyId !== storyId || chatsLoading) return;
        const request = consumePendingRework();
        if (!request) return;

        const payload: InitialReworkPayload = {
            target: request.target,
            packet: request.packet,
            initialInstruction: request.initialInstruction
        };

        const candidates = chats.filter(chat => chat.anchorChapterId === request.chapterId);
        if (candidates.length === 0) {
            createMutation.mutate(
                {
                    storyId,
                    chatType: "editor",
                    title: `Rework ${new Date().toLocaleString()}`,
                    anchorChapterId: request.chapterId
                },
                {
                    onSuccess: newChat => {
                        setSelectedChat(newChat);
                        setInitialRework({ chatId: newChat.id, payload });
                    }
                }
            );
            return;
        }

        const mostRecent = [...candidates].sort(
            (a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
        )[0];
        if (candidates.length > 1) toast.info(`Continuing in "${mostRecent.title}"`);
        setSelectedChat(mostRecent);
        setInitialRework({ chatId: mostRecent.id, payload });
    }, [pendingRework, storyId, chats, chatsLoading, createMutation]);

    const handleCreateNewChat = () => {
        createMutation.mutate(
            { storyId, chatType: "editor", title: `New Chat ${new Date().toLocaleString()}`, anchorChapterId: anchorChapterId ?? null },
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
                            promptType="editor"
                            selectedChat={selectedChat}
                            onChatUpdate={setSelectedChat}
                            enableProseProposals={enableProseProposals}
                            initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                        />
                    </ErrorBoundary>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Start a chat to write and revise alongside the AI.</p>
                        {renderNewChatButton()}
                    </div>
                )}
            </div>

            <div className="flex flex-col w-[250px] sm:w-[300px] shrink-0">
                <ChatList
                    storyId={storyId}
                    chatType="editor"
                    title="Editor Chats"
                    emptyLabel="No editor chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderNewChatButton}
                    side="right"
                />
                {selectedChat && <CodexProposalTray chatId={selectedChat.id} />}
            </div>
        </div>
    );
}
