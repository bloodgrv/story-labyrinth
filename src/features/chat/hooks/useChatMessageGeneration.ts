import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useGenerateWithPrompt } from "@/features/ai/hooks/useGenerateWithPrompt";
import { useStreamingGeneration } from "@/features/ai/hooks/useStreamingGeneration";
import { chatsApi } from "@/services/api/client";
import type { AIChat, AllowedModel, ChatMessage, Prompt, PromptParserConfig } from "@/types/story";
import { logger } from "@/utils/logger";
import { useUpdateChatMutation } from "./useChatQuery";
import { generateChatTitle } from "../services/generateChatTitle";
import { parseCodexProposals } from "../services/parseCodexProposals";
import { parseHandoffPackets } from "../services/parseHandoffPackets";
import type { ParsedLoreSuggestion } from "../services/parseLoreSuggestions";
import { parseLoreSuggestions } from "../services/parseLoreSuggestions";
import { parseNoteSplitProposal } from "../services/parseNoteSplitProposal";
import type { ParsedNoteProposal } from "../services/parseNoteProposals";
import { parseNoteProposals } from "../services/parseNoteProposals";
import type { ParsedNameProposal } from "../services/parseNameProposal";
import { parseNameProposal } from "../services/parseNameProposal";
import type { ParsedOutlineProposal } from "../services/parseOutlineProposals";
import { parseOutlineProposals } from "../services/parseOutlineProposals";
import { parseOverviewProposals } from "../services/parseOverviewProposals";
import { parseProseProposal } from "../services/parseProseProposal";
import type { ParsedPsychProposal } from "../services/parsePsychProposal";
import { parsePsychProposal } from "../services/parsePsychProposal";
import { parsePlaceSheetProposal } from "../services/parsePlaceSheetProposal";
import { parseSheetProposal } from "../services/parseSheetProposal";
import { parseMapSketchProposal } from "../services/parseMapSketchProposal";
import { parseShuttleProposal } from "../services/parseShuttleProposal";
import type { ParsedTimelinePinProposalItem } from "../services/parseTimelinePinProposal";
import { parseTimelinePinProposal } from "../services/parseTimelinePinProposal";
import type { PlaceState } from "@/types/story";
import type { MapSketchProposal } from "@/types/storyMaps";
import { useApproveProposalMutation, useCreateProposalMutation } from "./useCodexProposalsQuery";
import type { HandoffPacket, NoteSplitProposalPayload, OverviewProposalPayload, ShuttlePayload } from "@/types/brainstorm";

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
    // Called when a reply contains a ```place-sheet-proposal block (WB Locations-template chats
    // only, L1 — see chatContextService.ts's PLACE_SHEET_INSTRUCTIONS). Not persisted server-side
    // — ephemeral until Accept merges it into the anchor entry's own metadata.placeState.
    onPlaceSheetProposal?: (messageId: string, proposal: PlaceState) => void;
    // Called when a reply contains a ```map-sketch-proposal block (WB Locations-template chats
    // only, MV5 — see chatContextService.ts's MAP_SKETCH_INSTRUCTIONS). Not persisted server-side
    // — ephemeral until Accept resolves/creates the anchor location's map and applies it.
    onMapSketchProposal?: (messageId: string, proposal: MapSketchProposal) => void;
    // Called when a reply contains a ```sheet-proposal block (any anchored WB chat, T5 FS4 — see
    // chatContextService.ts's SHEET_PROPOSAL_INSTRUCTIONS). Not persisted server-side — ephemeral
    // until Accept (or Accept & Sync) replaces the anchor entry's sheetBody wholesale.
    onSheetProposal?: (messageId: string, proposal: string) => void;
    // Called when a reply contains a ```timeline-pin-proposal block (WB "timeline"-template chats
    // only, TL7 — see chatContextService.ts's TIMELINE_PIN_INSTRUCTIONS). Not persisted server-side
    // — ephemeral until each item is individually accepted (creates a real pin) or rejected.
    onTimelinePinProposal?: (messageId: string, items: ParsedTimelinePinProposalItem[]) => void;
    // Called when a reply contains a ```note-split-proposal block (Notes chats only, P0.4 K2 —
    // see chatContextService.ts's NOTE_SPLIT_PROPOSAL_INSTRUCTIONS). Same "persist immediately as
    // a durable brainstormChecklist row" posture as onOverviewProposal/onHandoffPackets above.
    onNoteSplitProposal?: (messageId: string, proposal: NoteSplitProposalPayload) => void;
    // Called when a reply contains a ```shuttle-proposal block (Editor/Outline/WB chats only,
    // Chat Shuttle H1/H4 — see chatContextService.ts's SHUTTLE_PROPOSAL_INSTRUCTIONS). Same
    // "persist immediately as a durable brainstormChecklist row" posture as onOverviewProposal/
    // onHandoffPackets above.
    onShuttleProposal?: (messageId: string, proposal: ShuttlePayload) => void;
    // Called when a reply contains a ```name-proposal block (NG6, Editor/WB/Outline/Brainstorm
    // chats — see chatContextService.ts's NAME_PROPOSAL_INSTRUCTIONS). Not persisted server-side —
    // NameProposalCard runs the real generate call itself on mount and renders results directly,
    // there's no separate "pending" state to track here.
    onNameProposal?: (messageId: string, proposal: ParsedNameProposal) => void;
    // P0.4 R6 — when true, every ```codex-proposal parsed from a reply is approved immediately
    // after its pending row is created (same call ProposalTrayCard's Approve button makes), instead
    // of waiting for a manual tray click. Editor/WB/Outline chats only (see ChatInterface.tsx's
    // usesCodexTray-gated toggle row) — default false, doctrine requires an explicit opt-in.
    autoAcceptCodex?: boolean;
    // Context/Token Meter (T4, M3) — fires when this turn's response carried real usage (Local
    // only this pass). Caller uses it to refresh its "last known usage" chip state.
    onUsage?: (usage: ChatMessage["usage"]) => void;
}

interface UseChatMessageGenerationReturn {
    generate: (input: string, extraContext?: string) => Promise<void>;
    isGenerating: boolean;
    abort: () => void;
    streamingContent: string;
}

// Chat organization pass — self-naming chats. WB already gets descriptive template-derived
// titles (createWorldBuildingChat) and Research has no manual "new chat" list at all, so both are
// left alone; Editor/Outline/Notes/Brainstorm all default new chats to a generic
// "New Chat <timestamp>" title today, which is the one this auto-titles over.
const AUTO_TITLE_CHAT_TYPES = new Set(["editor", "outline", "notes", "brainstorm"]);

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
    onPlaceSheetProposal,
    onMapSketchProposal,
    onSheetProposal,
    onNoteSplitProposal,
    onShuttleProposal,
    onNameProposal,
    onTimelinePinProposal,
    autoAcceptCodex,
    onUsage
}: UseChatMessageGenerationParams): UseChatMessageGenerationReturn => {
    const [isSending, setIsSending] = useState(false);
    const { generateWithPrompt } = useGenerateWithPrompt();
    const { isStreaming, streamedText, processStream, abort: abortStream, reset } = useStreamingGeneration();
    const createProposalMutation = useCreateProposalMutation();
    const approveProposalMutation = useApproveProposalMutation(selectedChat.id);
    const updateChatMutation = useUpdateChatMutation();

    const abort = useCallback(() => {
        abortStream();
        setIsSending(false);
    }, [abortStream]);

    const generate = useCallback(
        async (input: string, extraContext?: string) => {
            if (!input.trim() || !selectedPrompt || !selectedModel || isStreaming || !selectedChat.id) return;

            // Captured before anything is appended below — true only on a chat's genuine first
            // exchange (never on a resumed chat, a regenerate, or a branch, which always starts
            // with an inherited, non-empty message list already). Used below to fire the one-time
            // auto-title call without any "is this title still the default" guesswork.
            const isFirstExchange = selectedChat.messages.length === 0;

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

                const { text: fullResponse, usage } = await processStream(response);
                if (!fullResponse) {
                    // Silent before this fix — a reasoning-capable local model can spend its
                    // entire generation budget on internal reasoning and never reach visible
                    // content, especially with a long chat system prompt (WB/Editor chats
                    // especially). The user message above is already persisted; only the reply
                    // is missing, so surface that clearly instead of leaving it looking like
                    // nothing happened.
                    toast.error(
                        "The model didn't return a reply. If you're on a local reasoning model, it may have used its " +
                            "full token budget on internal reasoning — try raising \"Max output tokens\" in Settings → Local."
                    );
                    return;
                }

                const { cleanedContent: afterCodexStrip, proposals } = parseCodexProposals(fullResponse);
                const { cleanedContent: afterProseStrip, proseProposal } = parseProseProposal(afterCodexStrip);
                const { cleanedContent: afterNoteStrip, noteProposal } = parseNoteProposals(afterProseStrip);
                const { cleanedContent: afterOutlineStrip, proposals: outlineProposals } = parseOutlineProposals(afterNoteStrip);
                const { cleanedContent: afterLoreStrip, suggestions: loreSuggestions } = parseLoreSuggestions(afterOutlineStrip);
                const { cleanedContent: afterOverviewStrip, proposal: overviewProposal } = parseOverviewProposals(afterLoreStrip);
                const { cleanedContent: afterHandoffStrip, packets: handoffPackets } = parseHandoffPackets(afterOverviewStrip);
                const { cleanedContent: afterSplitStrip, proposal: noteSplitProposal } = parseNoteSplitProposal(afterHandoffStrip);
                const { cleanedContent: afterPsychStrip, psychProposal } = parsePsychProposal(afterSplitStrip);
                const { cleanedContent: afterPlaceSheetStrip, placeSheetProposal } = parsePlaceSheetProposal(afterPsychStrip);
                const { cleanedContent: afterSheetStrip, sheetProposal } = parseSheetProposal(afterPlaceSheetStrip);
                const { cleanedContent: afterMapSketchStrip, mapSketchProposal } = parseMapSketchProposal(afterSheetStrip);
                const { cleanedContent: afterShuttleStrip, proposal: shuttleProposal } = parseShuttleProposal(afterMapSketchStrip);
                const { cleanedContent: afterNameStrip, proposal: nameProposal } = parseNameProposal(afterShuttleStrip);
                const { cleanedContent, timelinePinProposals } = parseTimelinePinProposal(afterNameStrip);

                // A reply that's ENTIRELY a fenced block (no conversational wrapper at all) strips
                // down to an empty string here — the server's message-append route rejects empty
                // content outright, which previously crashed the whole turn and silently dropped
                // whatever proposal had just been parsed. Any non-empty placeholder is fine; the
                // proposal card itself carries the real content below this bubble.
                const finalContent = cleanedContent.trim() || "Here's what I found:";

                const afterAssistantMessage = await chatsApi.appendMessage(
                    selectedChat.id,
                    "assistant",
                    finalContent,
                    usage ?? undefined
                );
                onChatUpdate(afterAssistantMessage);

                // Self-naming chats — fire-and-forget, one small extra completion call after a
                // chat's genuine first exchange (see isFirstExchange/AUTO_TITLE_CHAT_TYPES above).
                // Never awaited by the main turn and never surfaces an error toast on failure — a
                // missed rename just leaves the generic default title in place.
                if (isFirstExchange && selectedChat.storyId && selectedChat.chatType && AUTO_TITLE_CHAT_TYPES.has(selectedChat.chatType)) {
                    void (async () => {
                        const title = await generateChatTitle(selectedModel.provider, selectedModel.id, input.trim(), finalContent);
                        if (!title) return;
                        const [titleError, updated] = await attemptPromise(() =>
                            updateChatMutation.mutateAsync({ id: selectedChat.id, data: { title } })
                        );
                        if (titleError) {
                            logger.warn("Failed to persist generated chat title:", titleError);
                            return;
                        }
                        onChatUpdate(updated);
                    })();
                }

                const assistantMessage: ChatMessage | undefined =
                    afterAssistantMessage.messages[afterAssistantMessage.messages.length - 1];
                // Context/Token Meter (T4, M3) — Local only this pass (see streamUtils.ts).
                if (usage) onUsage?.(usage);

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
                if (noteSplitProposal && assistantMessage) onNoteSplitProposal?.(assistantMessage.id, noteSplitProposal);
                if (psychProposal && assistantMessage) onPsychProposal?.(assistantMessage.id, psychProposal);
                if (placeSheetProposal && assistantMessage) onPlaceSheetProposal?.(assistantMessage.id, placeSheetProposal);
                if (sheetProposal && assistantMessage) onSheetProposal?.(assistantMessage.id, sheetProposal);
                if (mapSketchProposal && assistantMessage) onMapSketchProposal?.(assistantMessage.id, mapSketchProposal);
                if (shuttleProposal && assistantMessage) onShuttleProposal?.(assistantMessage.id, shuttleProposal);
                if (nameProposal && assistantMessage) onNameProposal?.(assistantMessage.id, nameProposal);
                if (timelinePinProposals && timelinePinProposals.length > 0 && assistantMessage)
                    onTimelinePinProposal?.(assistantMessage.id, timelinePinProposals);
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
            onPlaceSheetProposal,
            onMapSketchProposal,
            onSheetProposal,
            onNoteSplitProposal,
            onShuttleProposal,
            onNameProposal,
            onTimelinePinProposal,
            autoAcceptCodex,
            onUsage
        ]
    );

    return {
        generate,
        isGenerating: isStreaming || isSending,
        abort,
        streamingContent: streamedText
    };
};
