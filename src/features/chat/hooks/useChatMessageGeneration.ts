import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useGenerateWithPrompt } from "@/features/ai/hooks/useGenerateWithPrompt";
import { useStreamingGeneration } from "@/features/ai/hooks/useStreamingGeneration";
import { beginAiActivity, endAiActivity } from "@/features/activity/store/aiActivityStore";
import type { WorkspaceTool } from "@/features/stories/context/StoryContext";
import { brainstormApi, chatsApi, notesApi } from "@/services/api/client";
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
import type { ParsedSexualityProposal } from "../services/parseSexualityProposal";
import { parseSexualityProposal } from "../services/parseSexualityProposal";
import { parsePlaceSheetProposal } from "../services/parsePlaceSheetProposal";
import { parseSheetProposal } from "../services/parseSheetProposal";
import { parseSheetSpanProposal } from "../services/parseSheetSpanProposal";
import { parseMapSketchProposal } from "../services/parseMapSketchProposal";
import { parseShuttleProposal } from "../services/parseShuttleProposal";
import type { ParsedTimelinePinProposalItem } from "../services/parseTimelinePinProposal";
import { parseTimelinePinProposal } from "../services/parseTimelinePinProposal";
import { parseMcpToolCallProposal } from "../services/parseMcpToolCallProposal";
import type { PlaceState } from "@/types/story";
import type { McpToolCallProposal } from "@/types/mcpConnection";
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
    onSexualityProposal?: (messageId: string, proposal: ParsedSexualityProposal) => void;
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
    // Called when a reply contains a ```sheet-span-proposal block (T9, any anchored WB chat — see
    // chatContextService.ts's SHEET_SPAN_PROPOSAL_INSTRUCTIONS). Not persisted server-side —
    // ephemeral until Accept splices it into just the captured span of the anchor entry's sheetBody.
    onSheetSpanProposal?: (messageId: string, proposal: string) => void;
    // Called when a reply contains a ```timeline-pin-proposal block (WB "timeline"-template chats
    // only, TL7 — see chatContextService.ts's TIMELINE_PIN_INSTRUCTIONS). Not persisted server-side
    // — ephemeral until each item is individually accepted (creates a real pin) or rejected.
    onTimelinePinProposal?: (messageId: string, items: ParsedTimelinePinProposalItem[]) => void;
    // Called when a reply contains one or more ```mcp-tool-call-proposal blocks (any chat type
    // with includeMcpTools on, MCP M2 — see chatContextService.ts's MCP_TOOLS_INSTRUCTIONS). Not
    // persisted server-side until each item is individually Accepted (a real server-side MCP call
    // that writes a durable tool_result message) or Rejected (dismissed, no call, no message).
    onMcpToolCallProposal?: (messageId: string, proposals: McpToolCallProposal[]) => void;
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
    // WB chats only (see AUTO_TITLE_CHAT_TYPES/the auto-title block below) — the anchor entry's
    // name, prepended to the auto-generated title so it stays identifiable in a rail that lists
    // every entry's WB chats together, not just the one currently open. ChatInterface.tsx passes
    // this via its own entryLookup; every other chat type leaves it undefined.
    titlePrefix?: string;
}

interface UseChatMessageGenerationReturn {
    generate: (input: string, extraContext?: string) => Promise<void>;
    isGenerating: boolean;
    abort: () => void;
    streamingContent: string;
}

// Chat organization pass — self-naming chats. Every chat type's creation-time title is a
// placeholder (a static template/type name, a numbered "{entry} {n}" for WB, or a raw creation
// timestamp) rather than anything content-derived — this replaces it once, right after the
// chat's first real exchange, unless the user has already set a title on purpose
// (selectedChat.titleIsCustom below).
const AUTO_TITLE_CHAT_TYPES = new Set(["editor", "outline", "notes", "brainstorm", "worldbuilding", "research"]);

// AI Activity indicator — worldbuilding/general omitted (no Jump target): a WB chat is
// entry-anchored inside the Lorebook editor with no pointer here to the right entry, and general
// isn't tied to a specific tool at all. Same "omit rather than approximate" precedent
// jobPresentation.ts's JOB_TYPE_JUMP_TOOL already sets.
const CHAT_TYPE_TOOL: Partial<Record<NonNullable<AIChat["chatType"]>, WorkspaceTool>> = {
    editor: "editor",
    outline: "outline",
    notes: "notes",
    research: "research",
    brainstorm: "brainstorm"
};

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
    onSexualityProposal,
    onPlaceSheetProposal,
    onMapSketchProposal,
    onSheetProposal,
    onSheetSpanProposal,
    onNoteSplitProposal,
    onShuttleProposal,
    onNameProposal,
    onTimelinePinProposal,
    onMcpToolCallProposal,
    autoAcceptCodex,
    onUsage,
    titlePrefix
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
            // B19 fix: this used to be one combined guard that silently no-op'd on ANY of these
            // conditions — no toast, no log, no visible state change. selectedModel resolving to
            // null (e.g. a chat's persisted lastUsedModelId naming a model no longer in the
            // catalogue) was the one case with no other visible symptom: the Send button stayed
            // enabled, no spinner appeared, and every click/Enter silently did nothing. Split so
            // the two legitimately-silent cases (empty input, already streaming) stay silent, and
            // the two real failure cases tell the user why nothing happened.
            if (!input.trim() || isStreaming || !selectedChat.id) return;
            if (!selectedPrompt) {
                toast.error("Chat system prompt hasn't loaded yet — try again in a moment.");
                return;
            }
            if (!selectedModel) {
                toast.error(
                    "No AI model is selected for this chat — pick one from the model dropdown above, or check Settings → Providers & keys if the list is empty."
                );
                return;
            }

            // Captured before anything is appended below — true only on a chat's genuine first
            // exchange (never on a resumed chat, a regenerate, or a branch, which always starts
            // with an inherited, non-empty message list already). Used below to fire the one-time
            // auto-title call without any "is this title still the default" guesswork.
            const isFirstExchange = selectedChat.messages.length === 0;

            setIsSending(true);
            const activityId = beginAiActivity({
                label: selectedChat.title,
                storyId: selectedChat.storyId ?? undefined,
                tool: selectedChat.chatType ? CHAT_TYPE_TOOL[selectedChat.chatType] : undefined
            });
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
                const { cleanedContent: afterSexualityStrip, sexualityProposal } = parseSexualityProposal(afterPsychStrip);
                const { cleanedContent: afterPlaceSheetStrip, placeSheetProposal } = parsePlaceSheetProposal(afterSexualityStrip);
                const { cleanedContent: afterSheetStrip, sheetProposal } = parseSheetProposal(afterPlaceSheetStrip);
                const { cleanedContent: afterSheetSpanStrip, sheetSpanProposal } = parseSheetSpanProposal(afterSheetStrip);
                const { cleanedContent: afterMapSketchStrip, mapSketchProposal } = parseMapSketchProposal(afterSheetSpanStrip);
                const { cleanedContent: afterShuttleStrip, proposal: shuttleProposal } = parseShuttleProposal(afterMapSketchStrip);
                const { cleanedContent: afterNameStrip, proposal: nameProposal } = parseNameProposal(afterShuttleStrip);
                const { cleanedContent: afterTimelinePinStrip, timelinePinProposals } = parseTimelinePinProposal(afterNameStrip);
                const { cleanedContent, proposals: mcpToolCallProposals } = parseMcpToolCallProposal(afterTimelinePinStrip);

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
                // missed rename just leaves the existing placeholder title in place. Skipped
                // entirely once the user has set a title on purpose (titleIsCustom) — dropped the
                // old `selectedChat.storyId` guard, which would have silently excluded Research's
                // Global (storyId-less) chats from the newly-added "research" coverage below.
                if (
                    isFirstExchange &&
                    !selectedChat.titleIsCustom &&
                    selectedChat.chatType &&
                    AUTO_TITLE_CHAT_TYPES.has(selectedChat.chatType)
                ) {
                    void (async () => {
                        const rawTitle = await generateChatTitle(selectedModel.provider, selectedModel.id, input.trim(), finalContent);
                        if (!rawTitle) return;
                        const title = titlePrefix ? `${titlePrefix}: ${rawTitle}` : rawTitle;
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

                // Reliability fix (2026-08-17) — Brainstorm's own OVERVIEW_PROPOSAL_INSTRUCTIONS/
                // HANDOFF_PACKET_INSTRUCTIONS fences above are unreliable during a normal
                // conversational reply (verified live: the model skips them even with matching
                // trigger phrases). Fire an isolated server-side extraction pass as a background
                // follow-up — same technique verified to work reliably — for whichever type(s) the
                // main reply didn't already self-emit. B16 fix (2026-08-19): this used to gate on
                // BOTH types being absent (`!overviewProposal && handoffPackets.length === 0`), so
                // any turn where the model self-emitted an overview-proposal fence skipped handoff
                // extraction entirely — the exact "duplicate overview, never a real handoff" pattern
                // seen live. Now it fires whenever EITHER type is still missing, and only applies
                // whichever half of the extraction result the main reply didn't already provide, so
                // a self-emitted overview can no longer suppress handoff extraction (or vice versa)
                // and neither type can be double-applied. Fire-and-forget: the chat turn has already
                // succeeded and rendered: a missed or failed extraction should never surface as a
                // disruptive error.
                if (
                    selectedChat.chatType === "brainstorm" &&
                    assistantMessage &&
                    (!overviewProposal || handoffPackets.length === 0)
                ) {
                    const extractionMessageId = assistantMessage.id;
                    const alreadyHasOverview = !!overviewProposal;
                    const alreadyHasHandoffs = handoffPackets.length > 0;
                    void (async () => {
                        const [extractError, result] = await attemptPromise(() =>
                            brainstormApi.extractProposals(fullResponse, input.trim())
                        );
                        if (extractError) {
                            logger.warn("Brainstorm proposal extraction failed:", extractError);
                            return;
                        }
                        if (result.overview && !alreadyHasOverview) onOverviewProposal?.(extractionMessageId, result.overview);
                        if (result.handoffs.length > 0 && !alreadyHasHandoffs)
                            onHandoffPackets?.(extractionMessageId, result.handoffs);
                        if (result.droppedCount > 0)
                            toast.warning(
                                `Captured ${result.handoffs.length} hand-off item(s) from that reply — ${result.droppedCount} couldn't be parsed. Use "Propose from this reply" to retry.`
                            );
                        // B16: previously a failed extraction call looked identical to "nothing to
                        // hand off" — this couldn't be told apart from the chat UI, only from
                        // server logs. Surface it so the user knows a retry might actually help.
                        else if (result.handoffCallFailed && !alreadyHasHandoffs)
                            toast.warning('Couldn\'t check that reply for hand-off items — use "Propose from this reply" to retry.');
                    })();
                }
                if (noteSplitProposal && assistantMessage) onNoteSplitProposal?.(assistantMessage.id, noteSplitProposal);

                // Reliability fix (2026-08-23, notesExtractService.ts's own comment) — same
                // rationale as the Brainstorm extraction pass above: Notes' own
                // NOTE_PROPOSAL_INSTRUCTIONS/NOTE_SPLIT_PROPOSAL_INSTRUCTIONS are unreliable during a
                // normal conversational reply, most visibly when the composer was seeded from
                // another desk's handoff (useBrainstormChecklistActions.ts's handleOpenHandoff) —
                // the model just replies conversationally and nothing ever gets saved. Fires only
                // when the main reply didn't already self-emit either fence type. Fire-and-forget:
                // the chat turn has already succeeded and rendered.
                if (selectedChat.chatType === "notes" && assistantMessage && !noteProposal && !noteSplitProposal) {
                    const extractionMessageId = assistantMessage.id;
                    void (async () => {
                        const [extractError, result] = await attemptPromise(() => notesApi.extractProposal(fullResponse, input.trim()));
                        if (extractError) {
                            logger.warn("Notes proposal extraction failed:", extractError);
                            return;
                        }
                        if (result.note) onNoteProposal?.(extractionMessageId, result.note);
                        else if (result.split) onNoteSplitProposal?.(extractionMessageId, result.split);
                    })();
                }
                if (psychProposal && assistantMessage) onPsychProposal?.(assistantMessage.id, psychProposal);
                if (sexualityProposal && assistantMessage) onSexualityProposal?.(assistantMessage.id, sexualityProposal);
                if (placeSheetProposal && assistantMessage) onPlaceSheetProposal?.(assistantMessage.id, placeSheetProposal);
                if (sheetProposal && assistantMessage) onSheetProposal?.(assistantMessage.id, sheetProposal);
                if (sheetSpanProposal && assistantMessage) onSheetSpanProposal?.(assistantMessage.id, sheetSpanProposal);
                if (mapSketchProposal && assistantMessage) onMapSketchProposal?.(assistantMessage.id, mapSketchProposal);
                if (shuttleProposal && assistantMessage) onShuttleProposal?.(assistantMessage.id, shuttleProposal);
                if (nameProposal && assistantMessage) onNameProposal?.(assistantMessage.id, nameProposal);
                if (timelinePinProposals && timelinePinProposals.length > 0 && assistantMessage)
                    onTimelinePinProposal?.(assistantMessage.id, timelinePinProposals);
                if (mcpToolCallProposals.length > 0 && assistantMessage) onMcpToolCallProposal?.(assistantMessage.id, mcpToolCallProposals);
            });

            endAiActivity(activityId);
            if (error) {
                logger.error("Error during generation:", error);
                toast.error(error.message || "An error occurred during generation");
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
            onSexualityProposal,
            onPlaceSheetProposal,
            onMapSketchProposal,
            onSheetProposal,
            onSheetSpanProposal,
            onNoteSplitProposal,
            onShuttleProposal,
            onNameProposal,
            onTimelinePinProposal,
            onMcpToolCallProposal,
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
