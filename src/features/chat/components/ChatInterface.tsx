import { useCallback, useEffect, useMemo, useState } from "react";
import { useAvailableModels } from "@/features/ai/hooks/useAvailableModels";
import { ChatMessageList } from "@/features/brainstorm/components/ChatMessageList";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { MessageInputArea } from "@/features/brainstorm/components/MessageInputArea";
import { PromptControls } from "@/features/brainstorm/components/PromptControls";
import { useChatMessages } from "@/features/brainstorm/hooks/useChatMessages";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import { usePromptPreview } from "@/features/brainstorm/hooks/usePromptPreview";
import { usePromptSelection } from "@/features/brainstorm/hooks/usePromptSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { usePromptsQuery } from "@/features/prompts/hooks/usePromptsQuery";
import { chatsApi } from "@/services/api/client";
import type { AIChat, AllowedModel, Prompt, PromptParserConfig } from "@/types/story";
import { ProposalCard } from "./ProposalCard";
import { useChatMessageGeneration } from "../hooks/useChatMessageGeneration";
import { groupProposalsByMessage, useChatProposalsQuery } from "../hooks/useCodexProposalsQuery";

interface ChatInterfaceProps {
    // Absent for global chats (Research) — chapter/lorebook context selection is simply
    // unavailable there (no single story to scope it to), not an error state.
    storyId?: string;
    selectedChat: AIChat;
    onChatUpdate: (chat: AIChat) => void;
}

// ChatInterface for chats.ts-backed chats (World-Building, Research) — reuses the same
// message-list/prompt-selection/context-selection UI as features/brainstorm, but generates
// via useChatMessageGeneration (chatsApi) instead of brainstormApi, and renders Codex
// proposals inline under the assistant message that produced them. Message editing isn't
// supported here yet (see ChatMessageList's optional onStartEdit).
export function ChatInterface({ storyId, selectedChat, onChatUpdate }: ChatInterfaceProps) {
    const [input, setInput] = useState("");

    const { entries: lorebookEntries } = useLorebookContext();
    const {
        data: prompts = [],
        isLoading: promptsLoading,
        error: promptsQueryError
    } = usePromptsQuery({ includeSystem: true });
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId ?? "");
    const promptsError = promptsQueryError?.message ?? null;
    const { data: availableModels = [] } = useAvailableModels();

    const { selectedPrompt, selectedModel, selectPrompt } = usePromptSelection(
        selectedChat.id,
        selectedChat.lastUsedPromptId,
        selectedChat.lastUsedModelId,
        prompts,
        (promptId, modelId) => chatsApi.update(selectedChat.id, { lastUsedPromptId: promptId, lastUsedModelId: modelId })
    );

    const { showPreview, previewMessages, previewLoading, previewError, openPreview, closePreview } = usePromptPreview();

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

    // Grounds the AI in the chat's Codex context (template hint, pending proposals, relevant
    // entries) and the ```codex-proposal wire-format instructions — see chatContextService.ts.
    const [codexContext, setCodexContext] = useState<string>("");
    useEffect(() => {
        let cancelled = false;
        chatsApi.getContext(selectedChat.id).then(context => {
            if (cancelled) return;
            const entriesText = context.relevantCodexEntries
                .map(e => `- ${e.name} (${e.category}): ${e.excerpt}`)
                .join("\n");
            setCodexContext(entriesText ? `${context.systemPrompt}\n\nRelevant Codex entries:\n${entriesText}` : context.systemPrompt);
        });
        return () => {
            cancelled = true;
        };
    }, [selectedChat.id]);

    const createPromptConfig = useCallback(
        (prompt: Prompt): PromptParserConfig => ({
            promptId: prompt.id,
            storyId: storyId ?? "",
            scenebeat: input.trim(),
            additionalContext: {
                codexContext,
                chatHistory: selectedChat.messages.map(msg => ({ role: msg.role, content: msg.content })),
                includeFullContext,
                selectedSummaries: includeFullContext ? [] : selectedSummaries,
                selectedItems: includeFullContext ? [] : selectedItems.map(item => item.id),
                selectedChapterContent: includeFullContext ? [] : selectedChapterContent
            }
        }),
        [input, storyId, codexContext, selectedChat.messages, includeFullContext, selectedSummaries, selectedItems, selectedChapterContent]
    );

    const { generate, isGenerating, abort, streamingContent } = useChatMessageGeneration({
        selectedChat,
        selectedPrompt,
        selectedModel,
        onChatUpdate,
        createPromptConfig
    });

    const displayMessages = useChatMessages({
        selectedChat,
        streamingMessageId: isGenerating ? "streaming" : null,
        streamingContent,
        pendingUserMessage: null
    });

    const { data: chatProposals = [] } = useChatProposalsQuery(selectedChat.id, "pending");
    const proposalsByMessageId = useMemo(() => groupProposalsByMessage(chatProposals), [chatProposals]);
    const entryLookup = useMemo(() => new Map(lorebookEntries.map(e => [e.id, e])), [lorebookEntries]);

    useEffect(() => {
        clearSelections();
    }, [clearSelections]);

    const getFilteredEntries = () => getFilteredLorebookEntries(lorebookEntries, false);

    const handlePromptSelect = (prompt: Prompt, model: AllowedModel) => selectPrompt(prompt, model);

    const handlePreviewPrompt = async () => {
        if (!selectedPrompt) return;
        await openPreview(createPromptConfig(selectedPrompt));
    };

    const handleSubmit = async () => {
        await generate(input);
        setInput("");
    };

    const handleItemSelect = (itemId: string) => {
        const item = getFilteredLorebookEntries(lorebookEntries, false).find(entry => entry.id === itemId);
        if (item) addItem(item);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 space-y-4">
                <PromptControls
                    prompts={prompts}
                    promptsLoading={promptsLoading}
                    promptsError={promptsError}
                    selectedPrompt={selectedPrompt}
                    selectedModel={selectedModel}
                    availableModels={availableModels.map(model => ({ id: model.id, name: model.name, provider: model.provider }))}
                    showPreview={showPreview}
                    previewMessages={previewMessages}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    onPromptSelect={handlePromptSelect}
                    onPreviewPrompt={handlePreviewPrompt}
                    onClosePreview={closePreview}
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
                editingMessageId={null}
                editingContent=""
                streamingMessageId={isGenerating ? "streaming" : null}
                storyId={storyId ?? ""}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onEditContentChange={() => {}}
                editingTextareaRef={{ current: null }}
                renderProposalsForMessage={messageId => {
                    const proposals = proposalsByMessageId[messageId];
                    if (!proposals?.length) return null;
                    return proposals.map(proposal => {
                        const entry = entryLookup.get(proposal.entryId);
                        return (
                            <ProposalCard
                                key={proposal.id}
                                proposal={proposal}
                                chatId={selectedChat.id}
                                entryName={entry?.name ?? "Unknown entry"}
                                entryCategory={entry?.category ?? "unknown"}
                            />
                        );
                    });
                }}
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
