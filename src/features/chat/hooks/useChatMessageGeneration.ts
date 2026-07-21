import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useGenerateWithPrompt } from "@/features/ai/hooks/useGenerateWithPrompt";
import { useStreamingGeneration } from "@/features/ai/hooks/useStreamingGeneration";
import { chatsApi } from "@/services/api/client";
import type { AIChat, AllowedModel, ChatMessage, Prompt, PromptParserConfig } from "@/types/story";
import { logger } from "@/utils/logger";
import { parseCodexProposals } from "../services/parseCodexProposals";
import { parseHandoffPackets } from "../services/parseHandoffPackets";
import type { ParsedLoreSuggestion } from "../services/parseLoreSuggestions";
import { parseLoreSuggestions } from "../services/parseLoreSuggestions";
import type { ParsedNoteProposal } from "../services/parseNoteProposals";
import { parseNoteProposals } from "../services/parseNoteProposals";
import type { ParsedOutlineProposal } from "../services/parseOutlineProposals";
import { parseOutlineProposals } from "../services/parseOutlineProposals";
import { parseOverviewProposals } from "../services/parseOverviewProposals";
import { parseProseProposal } from "../services/parseProseProposal";
import type { ParsedPsychProposal } from "../services/parsePsychProposal";
import { parsePsychProposal } from "../services/parsePsychProposal";
import { useApproveProposalMutation, useCreateProposalMutation } from "./useCodexProposalsQuery";
import type { HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";

interface UseChatMessageGenerationParams {
    selectedChat: AIChat;
    selectedPrompt: Prompt | null;
    selectedModel: AllowedModel | null;
    onChatUpdate: (chat: AIChat) => void;
    // P0.4 S1 — extraContext (2nd param) lets a caller merge one-off, per-turn text into the
    // prompt's codexContext without routing it through React state first (Research's live web-
    // search results/fetched-page text must reflect THIS message, not a stale render — see
    // ChatInterface.tsx's handleSubmit). Every other caller simply ignores the param.
    createPromptConfig: (prompt: Prompt, extraContext?: string) => PromptParserConfig;
    // Called with the newly-created assistant message's id and proposed text when a reply
    // contains a ```prose-proposal block (Editor chats only — see chatContextService.ts).
    // Not persisted server-side, so the caller owns tracking it (see ChatInterface.tsx).
    onProseProposal?: (messageId: string, proposal: string) => void;
    // Called when a reply contains a ```note-proposal block (N6, non-Editor chats only — see
    // chatContextService.ts's NOTE_PROPOSAL_INSTRUCTIONS). Not persisted server-side either.
    onNoteProposal?: (messageId: string, proposal: ParsedNoteProposal) => void;
    // Called with every ```outline-proposal block in a reply (Outline chats only, P0.4 R5 — see
    // chatContextService.ts's OUTLINE_PROPOSAL_INSTRUCTIONS). The caller decides how to route each
    // one: "create" proposals get persisted immediately as a pending outlineItems row (see
    // ChatInterface.tsx), the rest become ephemeral accept/reject cards, same as prose/note.
    onOutlineProposals?: (messageId: string, proposals: ParsedOutlineProposal[]) => void;
    // Called when a reply contains a ```lore-suggestion block (Outline chats only, P0.4 R8). Never
    // persisted server-side — ephemeral until "Open in WB" hands one off to the Lorebook tool.
    onLoreSuggestions?: (messageId: string, suggestions: ParsedLoreSuggestion[]) => void;
    // Called when a reply contains a ```overview-proposal block (Brainstorm chats only, P0.4
    // B0-B4 — see chatContextService.ts's OVERVIEW_PROPOSAL_INSTRUCTIONS). Unlike prose/note/
    // outline-edit proposals, the caller is expected to persist this immediately as a durable
    // brainstormChecklist row (see ChatInterface.tsx) rather than hold it in ephemeral state.
    onOverviewProposal?: (messageId: string, proposal: OverviewProposalPayload) => void;
    // Called with every handoff in a reply's ```handoff-packet block (Brainstorm chats only,
    // P0.4 B0-B4). Same "persist immediately" posture as onOverviewProposal above.
    onHandoffPackets?: (messageId: string, packets: HandoffPacket[]) => void;
    // Called when a reply contains a ```psych-proposal block (WB Character-template chats only,
    // P0.4 B5 — see chatContextService.ts's PSYCH_MODULE_INSTRUCTIONS). Not persisted server-side
    // — ephemeral until Accept merges it into the anchor entry's own metadata.psychProfile.
    onPsychProposal?: (messageId: string, proposal: ParsedPsychProposal) => void;
    // P0.4 R6 — when true, every ```codex-proposal parsed from a reply is approved immediately
    // after its pending row is created (same call ProposalTrayCard's Approve button makes), instead
    // of waiting for a manual tray click. Editor/WB/Outline chats only (see ChatInterface.tsx's
    // usesCodexTray-gated toggle row) — default false, doctrine requires an explicit opt-in.
    autoAcceptCodex?: boolean;
}

interface UseChatMessageGenerationReturn {
    generate: (input: string, extraContext?: string) => Promise<void>;
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
    onProseProposal,
    onNoteProposal,
    onOutlineProposals,
    onLoreSuggestions,
    onOverviewProposal,
    onHandoffPackets,
    onPsychProposal,
    autoAcceptCodex
}: UseChatMessageGenerationParams): UseChatMessageGenerationReturn => {
    const [isSending, setIsSending] = useState(false);
    const { generateWithPrompt } = useGenerateWithPrompt();
    const { isStreaming, streamedText, processStream, abort: abortStream, reset } = useStreamingGeneration();
    const createProposalMutation = useCreateProposalMutation();
    const approveProposalMutation = useApproveProposalMutation(selectedChat.id);

    const abort = useCallback(() => {
        abortStream();
        setIsSending(false);
    }, [abortStream]);

    const generate = useCallback(
        async (input: string, extraContext?: string) => {
            if (!input.trim() || !selectedPrompt || !selectedModel || isStreaming || !selectedChat.id) return;

            setIsSending(true);
            const [error] = await attemptPromise(async () => {
                const afterUserMessage = await chatsApi.appendMessage(selectedChat.id, "user", input.trim());
                onChatUpdate(afterUserMessage);

                const config = createPromptConfig(selectedPrompt, extraContext);
                const response = await generateWithPrompt(config, selectedModel);

                if (response.status === 204) {
                    logger.info("Generation was aborted.");
                    reset();
                    return;
                }

                const fullResponse = await processStream(response);
                if (!fullResponse) return;

                const { cleanedContent: afterCodexStrip, proposals } = parseCodexProposals(fullResponse);
                const { cleanedContent: afterProseStrip, proseProposal } = parseProseProposal(afterCodexStrip);
                const { cleanedContent: afterNoteStrip, noteProposal } = parseNoteProposals(afterProseStrip);
                const { cleanedContent: afterOutlineStrip, proposals: outlineProposals } = parseOutlineProposals(afterNoteStrip);
                const { cleanedContent: afterLoreStrip, suggestions: loreSuggestions } = parseLoreSuggestions(afterOutlineStrip);
                const { cleanedContent: afterOverviewStrip, proposal: overviewProposal } = parseOverviewProposals(afterLoreStrip);
                const { cleanedContent: afterHandoffStrip, packets: handoffPackets } = parseHandoffPackets(afterOverviewStrip);
                const { cleanedContent, psychProposal } = parsePsychProposal(afterHandoffStrip);

                const afterAssistantMessage = await chatsApi.appendMessage(selectedChat.id, "assistant", cleanedContent);
                onChatUpdate(afterAssistantMessage);

                const assistantMessage: ChatMessage | undefined =
                    afterAssistantMessage.messages[afterAssistantMessage.messages.length - 1];

                proposals.forEach(proposal =>
                    createProposalMutation.mutate(
                        {
                            chatId: selectedChat.id,
                            data: { messageId: assistantMessage?.id, ...proposal }
                        },
                        {
                            onSuccess: result => {
                                if (autoAcceptCodex) approveProposalMutation.mutate(result.pendingChange.id);
                            }
                        }
                    )
                );

                if (proseProposal && assistantMessage) onProseProposal?.(assistantMessage.id, proseProposal);
                if (noteProposal && assistantMessage) onNoteProposal?.(assistantMessage.id, noteProposal);
                if (outlineProposals.length > 0 && assistantMessage) onOutlineProposals?.(assistantMessage.id, outlineProposals);
                if (loreSuggestions.length > 0 && assistantMessage) onLoreSuggestions?.(assistantMessage.id, loreSuggestions);
                if (overviewProposal && assistantMessage) onOverviewProposal?.(assistantMessage.id, overviewProposal);
                if (handoffPackets.length > 0 && assistantMessage) onHandoffPackets?.(assistantMessage.id, handoffPackets);
                if (psychProposal && assistantMessage) onPsychProposal?.(assistantMessage.id, psychProposal);
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
            approveProposalMutation,
            onChatUpdate,
            onProseProposal,
            onNoteProposal,
            onOutlineProposals,
            onLoreSuggestions,
            onOverviewProposal,
            onHandoffPackets,
            onPsychProposal,
            autoAcceptCodex
        ]
    );

    return {
        generate,
        isGenerating: isStreaming || isSending,
        abort,
        streamingContent: streamedText
    };
};
