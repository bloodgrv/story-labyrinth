import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useGenerateWithPrompt } from "@/features/ai/hooks/useGenerateWithPrompt";
import { useStreamingGeneration } from "@/features/ai/hooks/useStreamingGeneration";
import { chatsApi } from "@/services/api/client";
import type { AIChat, AllowedModel, ChatMessage, Prompt, PromptParserConfig } from "@/types/story";
import { logger } from "@/utils/logger";
import { parseCodexProposals } from "../services/parseCodexProposals";
import { parseProseProposal } from "../services/parseProseProposal";
import { useCreateProposalMutation } from "./useCodexProposalsQuery";

interface UseChatMessageGenerationParams {
    selectedChat: AIChat;
    selectedPrompt: Prompt | null;
    selectedModel: AllowedModel | null;
    onChatUpdate: (chat: AIChat) => void;
    createPromptConfig: (prompt: Prompt) => PromptParserConfig;
    // Called with the newly-created assistant message's id and proposed text when a reply
    // contains a ```prose-proposal block (Editor chats only — see chatContextService.ts).
    // Not persisted server-side, so the caller owns tracking it (see ChatInterface.tsx).
    onProseProposal?: (messageId: string, proposal: string) => void;
}

interface UseChatMessageGenerationReturn {
    generate: (input: string) => Promise<void>;
    isGenerating: boolean;
    abort: () => void;
    streamingContent: string;
}

// Generation for chats.ts-backed chats (World-Building, Research, Editor) — distinct from
// features/brainstorm's useMessageGeneration because these chats always already exist (created
// via a template picker or get-or-create, never inline-created from the first message) and
// because a reply can carry ```codex-proposal blocks that need extracting and submitting to
// the Codex approval flow (see parseCodexProposals.ts and chatContextService.ts's system prompt).
export const useChatMessageGeneration = ({
    selectedChat,
    selectedPrompt,
    selectedModel,
    onChatUpdate,
    createPromptConfig,
    onProseProposal
}: UseChatMessageGenerationParams): UseChatMessageGenerationReturn => {
    const [isSending, setIsSending] = useState(false);
    const { generateWithPrompt } = useGenerateWithPrompt();
    const { isStreaming, streamedText, processStream, abort: abortStream, reset } = useStreamingGeneration();
    const createProposalMutation = useCreateProposalMutation();

    const abort = useCallback(() => {
        abortStream();
        setIsSending(false);
    }, [abortStream]);

    const generate = useCallback(
        async (input: string) => {
            if (!input.trim() || !selectedPrompt || !selectedModel || isStreaming || !selectedChat.id) return;

            setIsSending(true);
            const [error] = await attemptPromise(async () => {
                const afterUserMessage = await chatsApi.appendMessage(selectedChat.id, "user", input.trim());
                onChatUpdate(afterUserMessage);

                const config = createPromptConfig(selectedPrompt);
                const response = await generateWithPrompt(config, selectedModel);

                if (response.status === 204) {
                    logger.info("Generation was aborted.");
                    reset();
                    return;
                }

                const fullResponse = await processStream(response);
                if (!fullResponse) return;

                const { cleanedContent: afterCodexStrip, proposals } = parseCodexProposals(fullResponse);
                const { cleanedContent, proseProposal } = parseProseProposal(afterCodexStrip);

                const afterAssistantMessage = await chatsApi.appendMessage(selectedChat.id, "assistant", cleanedContent);
                onChatUpdate(afterAssistantMessage);

                const assistantMessage: ChatMessage | undefined =
                    afterAssistantMessage.messages[afterAssistantMessage.messages.length - 1];

                proposals.forEach(proposal =>
                    createProposalMutation.mutate({
                        chatId: selectedChat.id,
                        data: { messageId: assistantMessage?.id, ...proposal }
                    })
                );

                if (proseProposal && assistantMessage) onProseProposal?.(assistantMessage.id, proseProposal);
            });

            if (error) {
                logger.error("Error during generation:", error);
                toast.error("An error occurred during generation");
            }
            setIsSending(false);
        },
        [
            selectedChat,
            selectedPrompt,
            selectedModel,
            isStreaming,
            createPromptConfig,
            generateWithPrompt,
            processStream,
            reset,
            createProposalMutation,
            onChatUpdate
        ]
    );

    return {
        generate,
        isGenerating: isStreaming || isSending,
        abort,
        streamingContent: streamedText
    };
};
