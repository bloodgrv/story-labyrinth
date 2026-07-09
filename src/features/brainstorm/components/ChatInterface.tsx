import { useCallback, useEffect, useState } from "react";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { ChatSystemPromptControl } from "@/features/chat/components/ChatSystemPromptControl";
import { useChatSystemPrompt } from "@/features/chat/hooks/useChatSystemPrompt";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
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

    const createPromptConfig = useCallback(
        (prompt: Prompt): PromptParserConfig => ({
            promptId: prompt.id,
            storyId,
            scenebeat: input.trim(),
            additionalContext: {
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
