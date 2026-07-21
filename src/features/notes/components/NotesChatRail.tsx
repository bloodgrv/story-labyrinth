import { AlertCircle, MessageSquare, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { useChatsByStoryQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AIChat } from "@/types/story";
import { NotesChecklistTray } from "./NotesChecklistTray";

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

interface NotesChatRailProps {
    storyId: string;
    // Whichever note is currently open in the Notes tool (NotesTool.tsx's own selectedNoteId
    // state) — threaded into ChatInterface's focusedNoteId prop so the desk context pack
    // (chatContextService.ts's resolveFocusedNote) always reflects what the user is looking at.
    // Notes-tool-local, unlike currentChapterId (genuinely cross-tool) — no new StoryContext field.
    focusedNoteId: string | null;
}

// Notes chat rail (P0.4 K1) — own chatType/promptType="notes", own chat list (design doc §7:
// "Scope: Story-scoped, own chat list"), mirrors OutlineChatRail.tsx's find-or-create-most-recent
// shape exactly. No GuidedSetupControl (no guided-start style for Notes, out of K0-K5 scope) and
// no CodexProposalTray (Notes never writes Codex) — NotesChecklistTray (K3) takes that slot
// instead, handling note-split-proposal/promote-to-synopsis/promote-to-WB-or-Outline.
export function NotesChatRail({ storyId, focusedNoteId }: NotesChatRailProps) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "notes");
    const pendingRework = usePendingRework();
    const { pendingChatComposerSeed, setPendingChatComposerSeed } = useStoryContext();
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);

    const mostRecentChat = (candidates: AIChat[]): AIChat =>
        [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

    // Auto-select on first load: reuse the story's most recent Notes chat, or create one.
    useEffect(() => {
        if (selectedChat || chatsLoading) return;
        if (chats.length > 0) {
            setSelectedChat(mostRecentChat(chats));
            return;
        }
        createMutation.mutate(
            { storyId, chatType: "notes", title: "Notes Chat" },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chats, chatsLoading, selectedChat, storyId]);

    // K4's "Import dump" button (NotesTool.tsx) and Brainstorm's "Handoff → Notes" destination
    // both seed the composer this same way — same one-shot consumption posture as
    // OutlineChatRail's identical effect.
    useEffect(() => {
        if (!pendingChatComposerSeed || pendingChatComposerSeed.tool !== "notes" || !selectedChat) return;
        setComposerSeedText(pendingChatComposerSeed.text);
        setPendingChatComposerSeed(null);
    }, [pendingChatComposerSeed, selectedChat, setPendingChatComposerSeed]);

    // Bridges a "Rework in chat" click on a note (NoteEditor.tsx, P0.4 K2) into this rail via
    // pendingReworkStore — mirrors OutlineChatRail.tsx's identical effect.
    useEffect(() => {
        if (!pendingRework || pendingRework.panel !== "notes" || pendingRework.storyId !== storyId || chatsLoading) return;
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
            { storyId, chatType: "notes", title: "Notes Chat" },
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
            { storyId, chatType: "notes", title: `New Chat ${new Date().toLocaleString()}` },
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
            <div className="flex-1 h-full min-h-0 flex flex-col">
                {selectedChat ? (
                    <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                        <ChatInterface
                            storyId={storyId}
                            promptType="notes"
                            selectedChat={selectedChat}
                            onChatUpdate={setSelectedChat}
                            initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                            initialComposerText={composerSeedText}
                            focusedNoteId={focusedNoteId ?? undefined}
                        />
                    </ErrorBoundary>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Setting up your Notes chat…</p>
                    </div>
                )}
            </div>

            <div className="flex flex-col w-[250px] sm:w-[300px] shrink-0">
                <ChatList
                    storyId={storyId}
                    chatType="notes"
                    title="Notes Chats"
                    emptyLabel="No notes chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderNewChatButton}
                    side="right"
                />
                {selectedChat && <NotesChecklistTray chatId={selectedChat.id} storyId={storyId} />}
            </div>
        </div>
    );
}
