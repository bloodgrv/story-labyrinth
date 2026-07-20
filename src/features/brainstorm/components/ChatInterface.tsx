import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { ChatSystemPromptControl } from "@/features/chat/components/ChatSystemPromptControl";
import { useChatSystemPrompt } from "@/features/chat/hooks/useChatSystemPrompt";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { chatsApi } from "@/services/api/client";
import type { AIChat, Prompt, PromptParserConfig } from "@/types/story";
import { useUpdateBrainstormMutation } from "../hooks/useBrainstormQuery";
import { useChatMessages } from "../hooks/useChatMessages";
import { useContextSelection } from "../hooks/useContextSelection";
import { useMessageEditing } from "../hooks/useMessageEditing";
import { useMessageGeneration } from "../hooks/useMessageGeneration";
import { ChatMessageList } from "./ChatMessageList";
import { ContextSelector } from "./ContextSelector";
import { MessageInputArea } from "./MessageInputArea";

interface ChatInterfaceProps {
    storyId: string;
    selectedChat: AIChat;
    onChatUpdate: (chat: AIChat) => void;
}

export default function ChatInterface({ storyId, selectedChat, onChatUpdate }: ChatInterfaceProps) {
    const [input, setInput] = useState("");

    const { entries: lorebookEntries } = useLorebookContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);

    const updateChatMutation = useUpdateBrainstormMutation();
    const {
        prompt: selectedPrompt,
        isLoading: promptLoading,
        availableModels,
        selectedModel,
        selectModel
    } = useChatSystemPrompt("brainstorm", selectedChat.lastUsedModelId, modelId =>
        updateChatMutation.mutate({ id: selectedChat.id, data: { lastUsedModelId: modelId } })
    );

    const {
        includeFullContext,
        contextOpen,
        selectedSummaries,
        selectedItems,
        selectedChapterContent,
        toggleFullContext,
        toggleContextOpen,
        toggleSummary,
        addItem,
        removeItem,
        addChapterContent,
        removeChapterContent,
        clearSelections
    } = useContextSelection();

    // Notes/Outline bridge chat-level gate (docs/Notes_Outline_Chat_Bridges_Design.md). Brainstorm
    // deliberately stays manual-only for lorebook/chapter context (the ContextSelector above) —
    // unlike World-Building/Research/Editor chats, it never calls chatContextService's full
    // getChatContext for that. This only pulls the notes/outline non-canon packet (see the
    // useEffect below), so arming these toggles can't silently change Brainstorm's existing
    // lorebook/chapter behavior.
    const [includeNotes, setIncludeNotes] = useState(selectedChat.includeNotes);
    const [includeOutline, setIncludeOutline] = useState(selectedChat.includeOutline);
    const [notesOutlineContext, setNotesOutlineContext] = useState("");

    const toggleIncludeNotes = (value: boolean) =>
        updateChatMutation.mutateAsync({ id: selectedChat.id, data: { includeNotes: value } }).then(() => setIncludeNotes(value));
    const toggleIncludeOutline = (value: boolean) =>
        updateChatMutation.mutateAsync({ id: selectedChat.id, data: { includeOutline: value } }).then(() => setIncludeOutline(value));

    useEffect(() => {
        if (!includeNotes && !includeOutline) {
            setNotesOutlineContext("");
            return;
        }
        let cancelled = false;
        chatsApi.getContext(selectedChat.id).then(context => {
            if (cancelled) return;
            const notesText = context.relevantNotes.map(n => `- ${n.title}: ${n.excerpt}`).join("\n");
            const outlineText = context.relevantOutlineItems.map(o => `- ${o.title} (${o.type}): ${o.excerpt}`).join("\n");
            const sections = [
                notesText &&
                    `[STORY NOTES — working material, not canon]\nOnly use as ideas/constraints if relevant; do not treat as established fact unless it also appears in Codex/lorebook.\n${notesText}`,
                outlineText &&
                    `[OUTLINE — planning intent, not canon]\nOnly use as ideas/constraints if relevant; do not treat as established fact unless it also appears in Codex/lorebook.\n${outlineText}`
            ].filter(Boolean);
            setNotesOutlineContext(sections.join("\n\n"));
        });
        return () => {
            cancelled = true;
        };
    }, [selectedChat.id, includeNotes, includeOutline]);

    const createPromptConfig = useCallback(
        (prompt: Prompt): PromptParserConfig => ({
            promptId: prompt.id,
            storyId,
            scenebeat: input.trim(),
            additionalContext: {
                codexContext: notesOutlineContext,
                chatHistory: selectedChat.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                includeFullContext,
                selectedSummaries: includeFullContext ? [] : selectedSummaries,
                selectedItems: includeFullContext ? [] : selectedItems.map(item => item.id),
                selectedChapterContent: includeFullContext ? [] : selectedChapterContent
            }
        }),
        [
            input,
            storyId,
            notesOutlineContext,
            selectedChat.messages,
            includeFullContext,
            selectedSummaries,
            selectedItems,
            selectedChapterContent
        ]
    );

    const { generate, isGenerating, abort, streamingMessageId, streamingContent, pendingUserMessage } =
        useMessageGeneration({
            selectedChat,
            selectedPrompt,
            selectedModel,
            storyId,
            onChatUpdate,
            createPromptConfig
        });

    const { editingMessageId, editingContent, editingTextareaRef, startEdit, saveEdit, cancelEdit, setEditingContent } =
        useMessageEditing({
            selectedChat,
            streamingMessageId,
            onChatUpdate
        });

    const displayMessages = useChatMessages({
        selectedChat,
        streamingMessageId,
        streamingContent,
        pendingUserMessage
    });

    useEffect(() => {
        clearSelections();
    }, [clearSelections]);

    const getFilteredEntries = () => getFilteredLorebookEntries(lorebookEntries, false);

    const handleSubmit = async () => {
        await generate(input);
        setInput("");
    };

    const handleItemSelect = (itemId: string) => {
        const filteredEntries = getFilteredLorebookEntries(lorebookEntries, false);
        const item = filteredEntries.find(entry => entry.id === itemId);
        if (item) addItem(item);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 space-y-4">
                <ChatSystemPromptControl
                    prompt={selectedPrompt}
                    isLoading={promptLoading}
                    availableModels={availableModels}
                    selectedModel={selectedModel}
                    onSelectModel={selectModel}
                />

                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                        <Switch id={`${selectedChat.id}-include-notes`} checked={includeNotes} onCheckedChange={toggleIncludeNotes} />
                        <Label htmlFor={`${selectedChat.id}-include-notes`} className="text-sm font-normal">
                            Include Notes (working material, not canon)
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch id={`${selectedChat.id}-include-outline`} checked={includeOutline} onCheckedChange={toggleIncludeOutline} />
                        <Label htmlFor={`${selectedChat.id}-include-outline`} className="text-sm font-normal">
                            Include Outline (planning intent, not canon)
                        </Label>
                    </div>
                </div>

                <ContextSelector
                    includeFullContext={includeFullContext}
                    contextOpen={contextOpen}
                    selectedSummaries={selectedSummaries}
                    selectedItems={selectedItems}
                    selectedChapterContent={selectedChapterContent}
                    chapters={chapters}
                    lorebookEntries={lorebookEntries}
                    onToggleFullContext={toggleFullContext}
                    onToggleContextOpen={toggleContextOpen}
                    onToggleSummary={toggleSummary}
                    onItemSelect={handleItemSelect}
                    onRemoveItem={removeItem}
                    onChapterContentSelect={addChapterContent}
                    onRemoveChapterContent={removeChapterContent}
                    getFilteredEntries={getFilteredEntries}
                />
            </div>

            <ChatMessageList
                messages={displayMessages}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                streamingMessageId={streamingMessageId}
                storyId={storyId}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onEditContentChange={setEditingContent}
                editingTextareaRef={editingTextareaRef}
            />

            <MessageInputArea
                input={input}
                isGenerating={isGenerating}
                selectedPrompt={selectedPrompt}
                onInputChange={setInput}
                onSend={handleSubmit}
                onStop={abort}
            />
        </div>
    );
}
