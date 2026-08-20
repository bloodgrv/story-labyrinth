import { attemptPromise } from "@jfdi/attempt";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useContextMemoryExpanded } from "@/lib/useContextMemoryExpanded";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { type ChatContextToggles, useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { ChatMessageList } from "@/features/brainstorm/components/ChatMessageList";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { MessageInputArea } from "@/features/brainstorm/components/MessageInputArea";
import { useChatMessages } from "@/features/brainstorm/hooks/useChatMessages";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import type { UseContextSelectionReturn } from "@/features/brainstorm/hooks/useContextSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useAISettingsQuery } from "@/features/ai/hooks/useAISettingsQuery";
import { ContextMeterChip } from "@/features/context-meter/components/ContextMeterChip";
import { useContextEstimate } from "@/features/context-meter/hooks/useContextEstimate";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { extractPlainTextFromLexical } from "@/utils/lexicalUtils";
import { applyChapterSelectionReplace } from "@/features/rework/adapters/chapterSelectionAdapter";
import { ReworkCard } from "@/features/rework/components/ReworkCard";
import type { InitialReworkPayload } from "@/features/rework/pendingReworkStore";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import { useAutoHumanizerSettingsQuery } from "@/features/auto-humanizer/hooks/useAutoHumanizerSettingsQuery";
import { useAutoHumanizeProcessMutation } from "@/features/auto-humanizer/hooks/useAutoHumanizeProcessMutation";
import { useCreateNoteMutation, useUpdateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import { useUpdateLorebookMutation } from "@/features/lorebook/hooks/useLorebookQuery";
import { codexPendingKeys } from "@/features/lorebook/hooks/useCodexHistoryQuery";
import {
    useCreateOutlineItemMutation,
    useDeleteOutlineItemMutation,
    useOutlineQuery,
    useReorderOutlineMutation,
    useUpdateOutlineItemMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { ApiError } from "@/services/api/apiFactory";
import { useBrainstormChecklistActions } from "@/features/brainstorm/hooks/useBrainstormChecklistActions";
import { brainstormApi, chatsApi, deskTransfersApi, lorebookApi } from "@/services/api/client";
import type { BrainstormChecklistItem, HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";
import type { ChapterSelectionTarget, SheetFieldReworkTarget } from "@/types/rework";
import type { AIChat, ChatMessage, LorebookEntry, Prompt, PromptParserConfig } from "@/types/story";
import type { ChatContext, ChatContextOutlineTreeItem } from "@/types/worldbuilding";
import { ChatSystemPromptControl } from "./ChatSystemPromptControl";
import { HandoffPacketCard } from "./HandoffPacketCard";
import { NameProposalCard } from "./NameProposalCard";
import { NoteProposalCard } from "./NoteProposalCard";
import { OutlineProposalCard } from "./OutlineProposalCard";
import { OverviewProposalCard } from "./OverviewProposalCard";
import { ProposalCard } from "./ProposalCard";
import { ProseProposalCard } from "./ProseProposalCard";
import { PsychProposalCard } from "./PsychProposalCard";
import { SexualityProposalCard } from "./SexualityProposalCard";
import { PlaceSheetProposalCard } from "./PlaceSheetProposalCard";
import { SheetProposalCard } from "./SheetProposalCard";
import { MapSketchProposalCard } from "./MapSketchProposalCard";
import { useResolveOrCreateMapForLocationMutation } from "@/features/story-maps/hooks/useStoryMapsQuery";
import { TimelinePinProposalCard } from "@/features/story-timeline/components/TimelinePinProposalCard";
import { useCreatePinMutation } from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import { useCreateChatMutation, useUpdateChatMutation } from "../hooks/useChatQuery";
import { useChatMessageGeneration } from "../hooks/useChatMessageGeneration";
import { useChatSystemPrompt } from "../hooks/useChatSystemPrompt";
import { groupProposalsByMessage, useChatProposalsQuery, useCreateProposalMutation } from "../hooks/useCodexProposalsQuery";
import { placeStateToCodexFields } from "@/features/lorebook/utils/placeCodexMapping";
import { EMPTY_CODEX_STATE } from "@/features/lorebook/components/form/entryFormUtils";
import { insertProposedProse } from "../services/insertProposedProse";
import type { ParsedLoreSuggestion } from "../services/parseLoreSuggestions";
import type { ParsedNameProposal } from "../services/parseNameProposal";
import type { ParsedNoteProposal } from "../services/parseNoteProposals";
import type {
    ParsedOutlineDeleteProposal,
    ParsedOutlineEditProposal,
    ParsedOutlineReorderProposal
} from "../services/parseOutlineProposals";
import type { ParsedPsychProposal } from "../services/parsePsychProposal";
import type { ParsedSexualityProposal } from "../services/parseSexualityProposal";
import type { ParsedTimelinePinProposalItem } from "../services/parseTimelinePinProposal";
import type { PlaceState } from "@/types/story";
import type { MapSketchProposal } from "@/types/storyMaps";

type NonCreateOutlineProposal = ParsedOutlineEditProposal | ParsedOutlineReorderProposal | ParsedOutlineDeleteProposal;

interface ChatInterfaceProps {
    // Absent for global chats (Research) — chapter/lorebook context selection is simply
    // unavailable there (no single story to scope it to), not an error state.
    storyId?: string;
    promptType: Prompt["promptType"];
    selectedChat: AIChat;
    onChatUpdate: (chat: AIChat) => void;
    // Outline items are structured data, not prose — there's no chapter editor to insert into
    // there. Defaults to true (the Editor tool's own usage); Outline's rail passes false so a
    // ```prose-proposal reply is still parsed/stripped from the visible text but never rendered
    // as an actionable card (P0.4 R5 — Outline has its own chatType/promptType now, see
    // OutlineChatRail.tsx; this prop predates that split and stayed since Outline still shares
    // this component).
    enableProseProposals?: boolean;
    // Outline chats only (P0.4 R8) — called with every lore-suggestion parsed from a reply, for
    // the sibling OutlineProposalTray (rendered by OutlineChatRail, not this component) to
    // accumulate. No local rendering here since lore suggestions live in the tray, not inline.
    onLoreSuggestions?: (suggestions: ParsedLoreSuggestion[]) => void;
    // A "Rework in chat" request EditorChatRail resolved to this specific chat — seeds the
    // Selection Rework Bridge's active state on mount (docs/Chat_Panel_Integrations_Design.md
    // §2.1/§3). Consumed once; absent for ordinary chat opens.
    initialRework?: InitialReworkPayload | null;
    // Prefills the composer input, distinct from initialRework — no FocusTarget/packet involved,
    // just a starting line the user can edit before sending. Powers Brainstorm's Guided Setup
    // button and the generalized Outline/Research handoff-composer-prefill consumption (P0.4
    // B0-B4, StoryContext.pendingChatComposerSeed). Consumed once per identity change, same
    // pattern as initialRework below.
    initialComposerText?: string | null;
    // Notes chats only (P0.4 K1) — whichever note is currently open in the Notes tool
    // (NotesTool.tsx's own selectedNoteId), threaded into the mount-time context fetch so the
    // desk context pack's "focused note" read (chatContextService.ts's resolveFocusedNote)
    // reflects what the user is actually looking at.
    focusedNoteId?: string;
    // Brainstorm/WB/Outline pass their own <GuidedSetupControl /> here (each owns its own
    // blurb/style-hint/opening-line text) instead of rendering it themselves above this
    // component — doing it here instead of in the host lets one collapse toggle hide the whole
    // header cluster (Guided Setup + the model row + Context & memory + Story Context) down to a
    // single line, rather than just the Guided Setup box alone. Absent for Editor/Research/Notes,
    // which keep their existing always-expanded header unchanged.
    guidedSetup?: ReactNode;
    // World-Building only — fires with the server's post-write entry after any accept action here
    // that mutates the anchor entry directly (sheet-proposal Accept/Accept & Sync today). A docked
    // WB chat lives as a SIBLING of the entry's own edit form (LorebookEntryEditor.tsx), and that
    // form's react-hook-form state is deliberately mount-time-only (see its own comment) — it has
    // no other way to learn the anchor entry changed underneath it while both stay mounted on the
    // same page. Without this, the field a user just watched the model draft stays stale until they
    // close and reopen the entry tab (forces a remount).
    onEntryUpdated?: (entry: LorebookEntry) => void;
    // T10 CR4 (docs/Chat_Chrome_Declutter_Design.md) — when a host has migrated the "Context &
    // memory" bucket onto ChatToolsRail's own modal panel (Notes first), it calls
    // useChatContextToggles itself (single source of truth) and passes the result here so this
    // component uses that instance instead of creating its own. Paired with contextPanelMode
    // below. Absent for every host still using the original inline Collapsible.
    contextToggles?: ChatContextToggles;
    // "external" suppresses this component's own inline Collapsible entirely — the host's rail
    // panel renders ChatContextPanelContent instead. Defaults to "inline" (unchanged behavior).
    contextPanelMode?: "inline" | "external";
    // T10-follow-up — same lifted-single-source-of-truth pattern as contextToggles/
    // contextPanelMode above, for the older, separate "Story Context" structured-context picker
    // (ContextSelector: Include Full Context / Chapter Summaries / Chapter Content / Lorebook
    // Entries — not part of the Context & memory toggle bucket CR4 migrated). WB's
    // WorldBuildingChatPanel and Outline's OutlineChatRail each call useContextSelection
    // themselves and pass the instance here so their own "Story Context" rail panel and this
    // component's generate() payload read the same state instead of two independent copies.
    // Absent for every other host (this selector is only offered where planning/drafting benefits
    // from manually attaching specific chapters/entries — see showContextSelector below).
    contextSelection?: UseContextSelectionReturn;
    // "external" suppresses this component's own inline <ContextSelector> render entirely — the
    // host's rail panel renders it instead. Defaults to "inline" (unchanged behavior).
    storyContextPanelMode?: "inline" | "external";
}

// B18 fix (2026-08-19) — shared by the mount-time snapshot (below) and computeExtraContext's
// per-turn refresh (further down this file) so the two can never render the tree differently.
// Reconstructs chapter/scene nesting from the flat outlineTree array so the model sees real
// structure, not just a flat list; itemIds are called out explicitly since outline-proposal
// edit/reorder/delete fences need to reference them exactly.
function formatOutlineTree(
    outlineChapters: ChatContextOutlineTreeItem[],
    scenesByChapter: Map<string, ChatContextOutlineTreeItem[]>
): string {
    return outlineChapters
        .map(chapter => {
            const sceneLines = (scenesByChapter.get(chapter.id) ?? [])
                .map(s => `  - Scene "${s.title}" (id: ${s.id}): ${s.summary ?? "(no summary)"}`)
                .join("\n");
            const writtenTag = chapter.chapterId ? " [written]" : " [not yet written]";
            return (
                `- Chapter "${chapter.title}" (id: ${chapter.id})${writtenTag}: ${chapter.summary ?? "(no summary)"}` +
                (sceneLines ? `\n${sceneLines}` : "")
            );
        })
        .join("\n");
}

// ChatInterface for chats.ts-backed chats (World-Building, Research, Editor) — reuses the same
// message-list/context-selection UI as features/brainstorm, but generates via
// useChatMessageGeneration (chatsApi) instead of brainstormApi, and renders Codex proposals
// inline under the assistant message that produced them. Message editing isn't supported here
// yet (see ChatMessageList's optional onStartEdit).
export function ChatInterface({
    storyId,
    promptType,
    selectedChat,
    onChatUpdate,
    enableProseProposals = true,
    onLoreSuggestions,
    initialRework = null,
    initialComposerText = null,
    focusedNoteId,
    guidedSetup,
    onEntryUpdated,
    contextToggles,
    contextPanelMode = "inline",
    contextSelection,
    storyContextPanelMode = "inline"
}: ChatInterfaceProps) {
    const { currentChapterId, setPendingChatComposerSeed, setCurrentTool, setPendingShuttleSeed, setPendingMapSketch, chatDrafts, setChatDraft } =
        useStoryContext();
    const [input, setInputState] = useState(() => chatDrafts[selectedChat.id] ?? "");
    // Mirrors every keystroke into StoryContext so an in-progress, unsent message survives a
    // workspace tool switch (which unmounts this component) instead of just this useState — see
    // StoryContext's chatDrafts comment.
    const setInput = (value: string) => {
        setInputState(value);
        setChatDraft(selectedChat.id, value);
    };
    // B26 companion — chatDrafts already remembers per chatId, but this useState only seeded on
    // first mount; without a re-load, switching A→B leaves A's draft in the box (or blank if B
    // never typed) until remount. Id-only dep: don't fight keystrokes that also write chatDrafts.
    useEffect(() => {
        setInputState(chatDrafts[selectedChat.id] ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally id-only
    }, [selectedChat.id]);
    // Only meaningful when `guidedSetup` is provided — expand header when the selected chat changes
    // (same "fresh chat" feel as a remount).
    const [headerExpanded, setHeaderExpanded] = useState(true);
    useEffect(() => {
        setHeaderExpanded(true);
    }, [selectedChat.id]);
    const queryClient = useQueryClient();
    // Editor chats rely entirely on the auto-pulled codexContext (chapter passages + Codex
    // entries, fetched below) instead of the manual chapter-summary/lorebook checkboxes —
    // see chatContextService.ts and DECISIONS.md's chat-context notes.
    const isEditorChat = promptType === "editor";
    // Outline diverges from Editor on some axes (still shows the Notes/Memory toggles, still uses
    // the Codex tray) but agrees on others (no manual full-context toggles — both get an always-on
    // structured context pack from chatContextService.ts instead). See
    // docs/Chat_Panel_Integrations_Design.md §4 (P0.4 R5). Unlike Editor/Brainstorm/Research/Notes
    // below, Outline *does* get the manual Story Context selector (chapters/lorebook entries to
    // pull in verbatim while planning) — added on user request, OutlineChatRail.tsx's own
    // "Story Context" rail panel, same external-render posture as WB's.
    const isOutlineChat = promptType === "outline";
    // Brainstorm agrees with Outline on "no manual context selector" (its own toggle switches
    // below replace it) but never uses the Codex tray — it has no Codex write path at all, only
    // overview-proposal/handoff-packet (P0.4 B0-B4).
    const isBrainstormChat = promptType === "brainstorm";
    const isWorldBuildingChat = promptType === "worldbuilding";
    // Research agrees with Outline/Brainstorm on "no manual context selector" (its own opt-in
    // toggles below replace it) but never uses the Codex tray — it has no Codex/outline/prose
    // write path at all, only note-proposal (P0.4 S0-S5, docs/Chat_Panel_Integrations_Design.md §6).
    const isResearchChat = promptType === "research";
    // Notes agrees with Outline/Brainstorm/Research on "no manual context selector" — its own
    // always-on desk reads (all notes + focused note) plus opt-in Lorebook/Outline toggles below
    // replace it. Never uses the Codex tray — no Codex/outline/prose write path, only
    // note-proposal/note-split-proposal/promote (P0.4 K0-K5, docs/Chat_Panel_Integrations_Design.md §7).
    const isNotesChat = promptType === "notes";
    const showContextSelector = !isEditorChat && !isBrainstormChat && !isResearchChat && !isNotesChat;
    // Outline removed from this list along with showContextSelector above — leaving it here was a
    // real bug (not caught until a user reported toggling Chapter Summaries/Chapter Content in the
    // new "Story Context" panel and seeing no difference in the reply): the panel rendered and
    // looked interactive, but every selection was silently zeroed out of the generate() payload
    // below before it ever reached the model.
    const forceStructuredContextOff = isEditorChat || isBrainstormChat || isResearchChat || isNotesChat;
    const usesCodexTray = isEditorChat || promptType === "worldbuilding" || isOutlineChat;

    const { entries: lorebookEntries } = useLorebookContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId ?? "");

    // Selection Rework Bridge (docs/Chat_Panel_Integrations_Design.md §2.1/§3) — EditorChatRail
    // hands down a fresh `initialRework` object each time a NEW rework request resolves to this
    // chat (never reusing the same object reference across two different requests), so keying
    // this effect on the prop's identity naturally gives consume-once-per-request semantics
    // without extra bookkeeping — including the case where the same already-open chat receives a
    // second, different rework request later.
    const [activeRework, setActiveRework] = useState(initialRework);
    useEffect(() => {
        if (!initialRework) return;
        setActiveRework(initialRework);
        if (initialRework.initialInstruction) setInput(initialRework.initialInstruction);
    }, [initialRework]);

    // Guided Setup button (Brainstorm) / generalized handoff-composer-prefill consumption
    // (Outline, Research — see StoryContext.pendingChatComposerSeed) both just want to seed the
    // composer with a starting line the user can edit before sending, no FocusTarget involved.
    useEffect(() => {
        if (initialComposerText) setInput(initialComposerText);
    }, [initialComposerText]);

    const {
        prompt: selectedPrompt,
        isLoading: promptLoading,
        availableModels,
        selectedModel,
        selectModel,
        mode: chatMode,
        switchMode: switchChatMode
    } = useChatSystemPrompt(promptType, selectedChat.id, selectedChat.lastUsedModelId, modelId =>
        chatsApi.update(selectedChat.id, { lastUsedModelId: modelId })
    );

    // Context/Token Meter (T4) — M3. Chip shows for Local always, or for any provider once a
    // post-turn usage is known this session (design decision #8) — lastUsage is reset per chat
    // switch since it's session-local, not persisted (only the per-message badge is persisted).
    const { data: aiSettings } = useAISettingsQuery();
    const [lastUsage, setLastUsage] = useState<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(
        null
    );
    useEffect(() => setLastUsage(null), [selectedChat.id]);

    // T10-follow-up — same internalToggles/contextToggles fallback pattern used for the Context &
    // memory bucket below: every host not yet migrated gets its own instance (byte-identical
    // behavior); WB passes its own so its "Story Context" rail panel shares the same state.
    const internalContextSelection = useContextSelection();
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
    } = contextSelection ?? internalContextSelection;

    // T10 CR4 (docs/Chat_Chrome_Declutter_Design.md) — the 11 Context & memory toggles + their
    // armed-labels computation now live in this shared hook so a host that's migrated the bucket
    // onto ChatToolsRail's own modal panel (Notes first) can call it once and hand the same
    // instance to both this component (via contextToggles below) and its rail panel content,
    // instead of two independent copies racing each other's chatsApi.update calls. Every host not
    // yet migrated gets internalToggles — behavior is unchanged (same hook, called here instead).
    // B26 — when this host owns toggles internally, still push PATCH results into onChatUpdate so the
    // sticky selectedChat object stays field-fresh for the next chat switch (lifted hosts pass
    // their own onChatUpdated into useChatContextToggles instead).
    const internalToggles = useChatContextToggles(selectedChat, promptType, onChatUpdate);
    const toggles = contextToggles ?? internalToggles;

    // Chat chrome density (CC0) — collapsed-by-default "Context & memory" disclosure wrapping the
    // two toggle groups now rendered by ChatContextPanelContent; armed-only summary chips (C3)
    // mirror each group's own render conditions exactly (see useChatContextToggles.armedLabels).
    const [contextMemoryExpanded, setContextMemoryExpanded] = useContextMemoryExpanded();

    // Grounds the AI in the chat's context (chat-type framing, project synopsis, the chat's
    // anchor entry/chapter + the entry's one-hop relationships, other relevant Codex entries, and
    // — for Editor chats only — other relevant chapter passages) plus the ```codex-proposal /
    // ```prose-proposal wire-format instructions. See chatContextService.ts.
    const [codexContext, setCodexContext] = useState<string>("");
    // The chat's anchor label (entry name for World-Building chats, "Chapter: {title}" for
    // Editor chats), if any — surfaced in the UI (see the "Focused on" line below) so anchoring
    // failing silently (e.g. the entry/chapter was deleted) is visible, not just a mysterious
    // drop in the AI's apparent knowledge. A chat only ever has one of anchorEntryId/
    // anchorChapterId set (chatType-scoped, see chatContextService.ts), so a single label sourced
    // from whichever role="anchor" list is non-empty is correct. Derived from the same context
    // fetch, no extra request.
    const [focusedOnLabel, setFocusedOnLabel] = useState<string | null>(null);
    // Context/Token Meter (T4, M1) — the raw ChatContext object, otherwise fully consumed into
    // the flattened codexContext string above and discarded. Exposed as-is so useContextEstimate
    // can derive budget slices from the same real assembly this chat actually uses, without a
    // second network fetch or a second divergent prompt builder.
    const [rawChatContext, setRawChatContext] = useState<ChatContext | null>(null);
    useEffect(() => {
        let cancelled = false;
        chatsApi.getContext(selectedChat.id, undefined, focusedNoteId).then(context => {
            if (cancelled) return;
            setRawChatContext(context);

            const anchorEntries = context.relevantCodexEntries.filter(e => e.role === "anchor");
            const relatedEntries = context.relevantCodexEntries.filter(e => e.role === "related");
            const searchEntries = context.relevantCodexEntries.filter(e => e.role === "search");
            // Only the anchor entry ever carries codexState (server-side, chatContextService.ts's
            // resolveAnchorAndRelated) — surfacing it here is what lets the model see what's
            // already established before proposing wardrobe/appearance/wounds/items changes,
            // rather than guessing blind (see CODEX_PROPOSAL_INSTRUCTIONS).
            const formatCodexState = (state: (typeof context.relevantCodexEntries)[number]["codexState"]) => {
                if (!state) return "";
                const lines: string[] = [];
                if (state.wardrobe?.length) lines.push(`  Wardrobe: ${state.wardrobe.map(i => i.value).join("; ")}`);
                if (state.appearance?.length) lines.push(`  Appearance: ${state.appearance.map(f => `${f.label}: ${f.value}`).join("; ")}`);
                if (state.wounds?.length) lines.push(`  Wounds: ${state.wounds.map(i => i.value).join("; ")}`);
                if (state.items?.length) lines.push(`  Items: ${state.items.map(i => i.value).join("; ")}`);
                if (state.customFields?.length) lines.push(`  Custom fields: ${state.customFields.map(f => `${f.label}: ${f.value}`).join("; ")}`);
                // Server already stripped every unrevealed secret before this payload was ever
                // sent (chatContextService.ts's filterRevealedSecrets) — anything present here is
                // safe to surface as an established fact, same as any other codex field.
                if (state.secrets?.length) lines.push(`  Secrets (revealed): ${state.secrets.map(s => s.value).join("; ")}`);
                return lines.length ? `\n${lines.join("\n")}` : "";
            };
            // entryId is included so "use the entryId from the Codex context below"
            // (CODEX_PROPOSAL_INSTRUCTIONS) has an actual id to copy — without it the model has
            // nothing to ground a modify_entry proposal on but the entry's name, which it would
            // sometimes send as entryId itself (a real bug: the server has no entry named that,
            // so the proposal 404s instead of ever reaching the pending-changes queue).
            const formatEntry = (e: (typeof context.relevantCodexEntries)[number]) =>
                `- ${e.name} (${e.category}, id: ${e.entryId}): ${e.excerpt}${formatCodexState(e.codexState)}`;

            const anchorChapters = context.relevantChapterPassages.filter(p => p.role === "anchor");
            const searchChapters = context.relevantChapterPassages.filter(p => p.role === "search");
            const formatChapter = (p: (typeof context.relevantChapterPassages)[number]) => `- ${p.title}: ${p.excerpt}`;

            const anchorText = anchorEntries.map(formatEntry).join("\n");
            const relatedText = relatedEntries.map(formatEntry).join("\n");
            const searchText = searchEntries.map(formatEntry).join("\n");
            const anchorChapterText = anchorChapters.map(formatChapter).join("\n");
            const searchChapterText = searchChapters.map(formatChapter).join("\n");

            // Notes/Outline bridge (docs/Notes_Outline_Chat_Bridges_Design.md) — only non-empty
            // when this chat's includeNotes/includeOutline toggle is on, since getChatContext only
            // populates these arrays in that case. Labeled explicitly as non-canon working
            // material, per the design doc's exact framing (§3), so the model never treats it as
            // established fact on its own.
            const notesText = context.relevantNotes.map(n => `- ${n.title}: ${n.excerpt}`).join("\n");
            const outlineText = context.relevantOutlineItems.map(o => `- ${o.title} (${o.type}): ${o.excerpt}`).join("\n");
            // Project Memory (C1) — only non-empty when includeMemory is on. Framed as approved
            // project fact, not "non-canon" like notes/outline, since every surfaced memory is
            // already a user-approved active row (see chatContextService.ts's resolveMemories).
            // "pinned" rows are called out explicitly (P1.1 pin semantics) so the model understands
            // they're standing facts the writer flagged as always-relevant, not just topically
            // ranked for this turn.
            const memoriesText = context.relevantMemories
                .map(m => `- ${m.title} (${m.category}${m.role === "pinned" ? ", pinned" : ""}): ${m.excerpt}`)
                .join("\n");
            // Story Timeline (TL8) — only non-empty when includeTimeline is on. Framed as
            // established fact, same posture as Project Memory above, since pins are the writer's
            // own confirmed chronology, not loose working notes. Compact: order + title + blurb,
            // never the full linked-entry body (design doc's own "not full linked bodies" line).
            const timelineText = context.relevantTimelinePins.map(p => `- ${p.title} (${p.when})${p.blurb ? `: ${p.blurb}` : ""}`).join("\n");

            // B18 fix (2026-08-19): the outline tree used to be built HERE, once, at mount/chat-
            // select time, then never rebuilt for the rest of the conversation — this effect's own
            // dependency array (below) has nothing that changes when outline items are created,
            // accepted, or rejected. On a chat opened against an empty outline, the block below
            // would say "(empty)" for the entire session even after 20 items existed, leaving the
            // model with no real item ids to reference — it could only fall back to `create`
            // fences reconstructing chapters from titles still visible in the transcript, which is
            // exactly what produced 5 duplicate appended chapters instead of a targeted edit. Moved
            // to computeExtraContext below, which already re-fetches context fresh on every real
            // turn (unlike this mount-time snapshot) — see its own `needsOutlineTree` block.
            const writtenChaptersText = context.writtenChapters
                .map(c => `- Ch. ${c.order} "${c.title}": ${c.summary ?? "(no summary)"}`)
                .join("\n");

            // Brainstorm-only reads (P0.4 B0-B4) — chapterSummaries only non-empty when this
            // chat's includeChapterSummaries toggle is on; priorSetupSlots/handoffStatus are
            // Brainstorm's own always-on structured reads (empty for every other chatType).
            const chapterSummariesText = context.chapterSummaries
                .map(c => `- Ch. ${c.order} "${c.title}": ${c.summary ?? "(no summary)"}`)
                .join("\n");
            const setupSlotsText = context.priorSetupSlots.map(s => `- ${s.label}: ${s.status}`).join("\n");
            const handoffStatusText = isBrainstormChat
                ? `${context.handoffStatus.activeCount} active, ${context.handoffStatus.doneCount} done`
                : "";

            // Notes chat's own always-on desk reads (P0.4 K1) — allNotes lists every story note's
            // title/type (not gated by includeInAi, a desk privilege), focusedNote is the full
            // body of whichever note is currently open in the Notes tool.
            const allNotesText = context.allNotes.map(n => `- ${n.title} (${n.type}) [id: ${n.id}]`).join("\n");
            const focusedNoteText = context.focusedNote
                ? `- ${context.focusedNote.title} (${context.focusedNote.type}${context.focusedNote.pinned ? ", pinned" : ""}) [id: ${context.focusedNote.id}]\n${context.focusedNote.content}`
                : "";

            // Character Guided Playbook Packs (Hybrid D) — only non-empty when this chat's
            // usePlaybookPack toggle is on (chatContextService.ts's getChatContext gate). Exact §5
            // packet format from the design doc — labeled non-canon curriculum, never established
            // fact, one block per resolved pack (concrete + optional psych).
            const formatPack = (pack: NonNullable<typeof context.playbookPack.concrete>) =>
                `[PLAYBOOK PACK — interview curriculum, not story canon]\n` +
                `playbook: ${pack.playbookKey}\n` +
                `style: ${pack.style}\n` +
                `scope: ${pack.scope}\n` +
                `Use as coverage targets and sample question angles.\n` +
                `Do not treat as established fact about the story world.\n` +
                `Propose durable character facts via codex-proposal (and psych-proposal if psych module is on).\n\n` +
                pack.body;
            const playbookPackText = [context.playbookPack.concrete, context.playbookPack.psych, context.playbookPack.sexuality]
                .filter((p): p is NonNullable<typeof p> => p !== null)
                .map(formatPack)
                .join("\n\n");

            // "Story Context" picker (ContextSelector) — see the sections.push comment below for
            // why this has to be folded into codexContext directly rather than sent as a separate
            // additionalContext field. includeFullContext mirrors BrainstormContextResolver's own
            // "full" branch: every chapter's summary + every lorebook entry, but NOT full chapter
            // content (that stays opt-in-only even under "full" — pulling every written chapter's
            // entire prose into every turn would blow the context budget on a multi-chapter story).
            const storyContextChapterSummariesText = includeFullContext
                ? chapters.map(c => `- ${c.title}: ${c.summary ?? "(no summary)"}`).join("\n")
                : selectedSummaries
                      .map(id => chapters.find(c => c.id === id))
                      .filter((c): c is NonNullable<typeof c> => !!c)
                      .map(c => `- ${c.title}: ${c.summary ?? "(no summary)"}`)
                      .join("\n");
            const storyContextChapterContentText = selectedChapterContent
                .map(id => chapters.find(c => c.id === id))
                .filter((c): c is NonNullable<typeof c> => !!c)
                .map(c => `- ${c.title}:\n${extractPlainTextFromLexical(c.content)}`)
                .join("\n\n");
            const storyContextLorebookText = includeFullContext
                ? getFilteredLorebookEntries(lorebookEntries, false)
                      .map(e => `- ${e.name} (${e.category}): ${e.description ?? ""}`)
                      .join("\n")
                : selectedItems.map(e => `- ${e.name} (${e.category}): ${e.description ?? ""}`).join("\n");

            const sections = [
                context.systemPrompt,
                context.projectSynopsis && `Project synopsis:\n${context.projectSynopsis}`,
                anchorText && `Focused entry (this chat is anchored to it — treat as current, authoritative):\n${anchorText}`,
                relatedText && `Entries connected to the focused entry:\n${relatedText}`,
                searchText && `Other relevant Codex entries:\n${searchText}`,
                anchorChapterText &&
                    `Focused chapter (this chat is anchored to it — treat as current, authoritative):\n${anchorChapterText}`,
                searchChapterText && `Other relevant chapter passages:\n${searchChapterText}`,
                notesText &&
                    `[STORY NOTES — working material, not canon]\nOnly use as ideas/constraints if relevant; do not treat as established fact unless it also appears in Codex/lorebook.\n${notesText}`,
                outlineText &&
                    `[OUTLINE — planning intent, not canon]\nOnly use as ideas/constraints if relevant; do not treat as established fact unless it also appears in Codex/lorebook.\n${outlineText}`,
                memoriesText &&
                    `[PROJECT MEMORY — approved facts]\nApproved project facts/notes relevant to this conversation. Treat as established unless it conflicts with the Codex, in which case the Codex wins.\n${memoriesText}`,
                timelineText &&
                    `[STORY TIMELINE — established chronology]\nOrdered pins from the story's Spine timeline. Treat as established unless it conflicts with the Codex, in which case the Codex wins.\n${timelineText}`,
                // Guide is deliberately NOT included in this mount-time block — see
                // computeExtraContext below, which refreshes it per-message against the user's
                // actual live text (this block only ever refetches on chat.title, same reasoning
                // P0.4 S1 already established for Research's own web search).
                // B18 fix: the OUTLINE TREE block used to live here too — moved to
                // computeExtraContext below (real per-turn refresh) since this block never
                // rebuilds mid-conversation as items are created/accepted/rejected. Sending it from
                // BOTH places would risk two disagreeing snapshots reaching the model in one prompt.
                writtenChaptersText && `[WRITTEN CHAPTERS — titles and summaries only, no full prose]\n${writtenChaptersText}`,
                chapterSummariesText && `[WRITTEN CHAPTERS — titles and summaries only, no full prose]\n${chapterSummariesText}`,
                setupSlotsText && `[PROJECT SETUP CHECKLIST — use slotKey exactly as shown when a proposal addresses one]\n${setupSlotsText}`,
                handoffStatusText && `[YOUR OWN PENDING PROPOSALS/HANDOFFS]\n${handoffStatusText}`,
                allNotesText && `[ALL STORY NOTES — titles/types only; use the id values exactly as shown if referencing one]\n${allNotesText}`,
                focusedNoteText && `[FOCUSED NOTE — currently open in the Notes tool, treat as current]\n${focusedNoteText}`,
                // The "Story Context" picker (ContextSelector, WB/Outline's own rail panel) was
                // wired to send its picks via additionalContext.selectedChapterContent/etc., but
                // neither the "worldbuilding-system" nor "outline-system" prompt template actually
                // interpolates the {{brainstorm_context}} variable that data resolves into
                // (BrainstormResolvers.ts) — that resolver is for a separate, older Brainstorm-only
                // prompt path. So the toggles rendered, looked live, and were silently discarded
                // before reaching the model. Folding the picks directly into codexContext here
                // (same mechanism every other block on this list already uses) is what actually
                // gets them into the prompt. Full chapter content — the real written prose — is
                // called out as the highest-authority source, since the model otherwise only ever
                // sees a chapter's short DB summary.
                showContextSelector &&
                    storyContextChapterSummariesText &&
                    `[STORY CONTEXT — chapter summaries manually attached by the user]\n${storyContextChapterSummariesText}`,
                showContextSelector &&
                    storyContextChapterContentText &&
                    `[STORY CONTEXT — full chapter content manually attached by the user; this is the actual written prose, ` +
                        `the highest-authority source for "what's already written" in these chapters]\n${storyContextChapterContentText}`,
                showContextSelector &&
                    storyContextLorebookText &&
                    `[STORY CONTEXT — lorebook entries manually attached by the user]\n${storyContextLorebookText}`,
                playbookPackText
            ].filter(Boolean);
            setCodexContext(sections.join("\n\n"));
            setFocusedOnLabel(anchorEntries[0]?.name ?? (anchorChapters[0] ? `Chapter: ${anchorChapters[0].title}` : null));
        });
        return () => {
            cancelled = true;
        };
    }, [
        selectedChat.id,
        toggles.includeNotes,
        toggles.includeOutline,
        toggles.includeMemory,
        toggles.includeTimeline,
        toggles.includeLorebook,
        toggles.includeChapterSummaries,
        isBrainstormChat,
        focusedNoteId,
        // Guided-start style + psych-module toggle (P0.4 B0-B5) live in the PARENT component
        // (BrainstormTool/WorldBuildingChatPanel/OutlineChatRail), not local state here — without
        // these in the dependency array, changing style/psych after the chat was first selected
        // never refetched context, so the next message sent would silently use the stale
        // system prompt until something else (e.g. a Notes/Outline toggle) happened to refire this
        // effect. Each parent's handleStyleChange/handleTogglePsychModule passes a fresh chat
        // object to onChatUpdate/setSelectedChat, so these values change reference correctly.
        selectedChat.brainstormStyle,
        selectedChat.wbStyle,
        selectedChat.outlineStyle,
        selectedChat.includePsychModule,
        // Sexuality module (docs/Sexuality_Playbook_Design.md) — exact sibling of includePsychModule
        // above; proactively added here rather than discovering the same staleness bug class a
        // third time (this dependency array has already been bitten by omissions twice — psych/
        // style first, then usePlaybookPack below).
        selectedChat.includeSexualityModule,
        // Character Guided Playbook Packs (Hybrid D) — same B5 bug class fixed once already for
        // style/psych above: this must be in the deps too, or toggling arm after the chat was
        // first selected would leave the next message's context silently stale.
        selectedChat.usePlaybookPack,
        // Story Context picker (ContextSelector) — same staleness class as the toggles above:
        // without these, changing a selection wouldn't refetch/rebuild codexContext until
        // something else happened to refire this effect.
        showContextSelector,
        includeFullContext,
        selectedSummaries,
        selectedItems,
        selectedChapterContent,
        chapters,
        lorebookEntries
    ]);

    // Context/Token Meter (T4) — M2. contextWindowOverride only applies to Local (design decision
    // #5's "store with Local / model settings"); other providers just use whatever contextLength
    // was fetched/guessed for the model, relevant only once showContextMeter is true via a known
    // post-turn usage (M3).
    const selectedAIModel = availableModels.find(m => m.id === selectedModel?.id);
    const contextLimit =
        selectedModel?.provider === "local"
            ? (aiSettings?.contextWindowOverride ?? selectedAIModel?.contextLength ?? null)
            : (selectedAIModel?.contextLength ?? null);
    const contextEstimate = useContextEstimate(rawChatContext, selectedChat.messages, input, contextLimit);
    const showContextMeter = selectedModel?.provider === "local" || lastUsage !== null;

    // Selection Rework Bridge context (docs/Chat_Panel_Integrations_Design.md §2.1) — kept
    // separate from the codexContext fetch effect above (rather than re-fetching context on every
    // rework open/close) since it's derived purely from the locally-captured FocusPacket, not
    // anything server-side.
    const reworkContext = useMemo(() => {
        if (!activeRework) return "";
        const { before, selection, after, beforeTruncated, afterTruncated } = activeRework.packet;
        const beforeLabel = `BEFORE${beforeTruncated ? " (truncated)" : ""}: ${before}`;
        const afterLabel = `AFTER${afterTruncated ? " (truncated)" : ""}: ${after}`;

        switch (activeRework.target.kind) {
            case "chapter-selection":
                return (
                    `[SELECTION REWORK]\nThe user has highlighted this passage in the chapter to rework. Propose a replacement ` +
                    `for SELECTION only — do not repeat BEFORE/AFTER in your reply.\n${beforeLabel}\nSELECTION: ${selection}\n${afterLabel}`
                );
            case "lorebook-field":
                return (
                    `[LOREBOOK FIELD REWORK]\nThe user has highlighted this passage in the entry's ${activeRework.target.field} field ` +
                    `to rework. Reply with a \`\`\`codex-proposal (modify_entry) whose proposedDescription is the COMPLETE new ` +
                    `field value with SELECTION replaced — reassemble BEFORE + your replacement + AFTER yourself; do not propose ` +
                    `only the replacement fragment.\n${beforeLabel}\nSELECTION: ${selection}\n${afterLabel}`
                );
            case "lorebook-structured-field":
                return (
                    `[LOREBOOK FIELD REWORK]\nThe user wants to rework this Codex ${activeRework.target.field} entry as a whole ` +
                    `(no sub-span). Reply with a \`\`\`codex-proposal (modify_entry) whose proposedState is the COMPLETE Codex ` +
                    `state with only this one item's value changed — leave every other category/item untouched, copying it ` +
                    `forward from the current Codex state shown in context.\nCURRENT VALUE: ${selection}`
                );
            case "lorebook-sheet-field":
                return (
                    `[LOREBOOK SHEET SPAN REWORK]\nThe user has highlighted this passage in the entry's Lore Sheet` +
                    `${activeRework.target.section ? ` (under the "${activeRework.target.section}" section)` : ""} to rework. Reply ` +
                    `with a \`\`\`sheet-span-proposal containing ONLY the replacement text for SELECTION — not the whole sheet, ` +
                    `not BEFORE/AFTER.\n${beforeLabel}\nSELECTION: ${selection}\n${afterLabel}`
                );
            case "outline-item":
                return (
                    `[OUTLINE ITEM REWORK]\nThe user wants to rework this outline item as a whole. Neighbor context is in ` +
                    `BEFORE/AFTER below. Reply with an \`\`\`outline-proposal ("edit") for itemId "${activeRework.target.outlineItemId}" ` +
                    `— only include the fields that should change.\n${beforeLabel}\nCURRENT TITLE + SUMMARY: ${selection}\n${afterLabel}`
                );
            case "note-item":
                return (
                    `[NOTE REWORK]\nThe user wants to rework this note as a whole (whole-note only, no sub-span). Reply with a ` +
                    `\`\`\`note-proposal for the COMPLETE updated note — title and content, reassembling anything unchanged ` +
                    `yourself; do not propose only a fragment.\nCURRENT TITLE + CONTENT: ${selection}`
                );
            default:
                return "";
        }
    }, [activeRework]);

    // ReworkCard's trailing hint varies per host — chapter selection replaces in place on Accept,
    // but Lorebook/Outline rework instead produces a proposal reviewed via the Codex tray or an
    // outline-proposal card elsewhere in this same rail, not a "replace" click on this card.
    const reworkHostHint = useMemo(() => {
        if (!activeRework) return undefined;
        switch (activeRework.target.kind) {
            case "lorebook-field":
            case "lorebook-structured-field":
                return "Talk through the change below — the model's reply will propose a Codex change reviewed in the tray, not replace this text directly.";
            case "lorebook-sheet-field":
                return "Talk through the change below — Accept will splice the model's reply back into just this span of the Lore Sheet.";
            case "outline-item":
                return "Talk through the change below — the model's reply will propose an outline change reviewed as a card, not replace this text directly.";
            case "note-item":
                return "Talk through the change below — the model's reply will propose an updated note reviewed here, not replace this text directly.";
            default:
                return undefined;
        }
    }, [activeRework]);

    const createPromptConfig = useCallback(
        (prompt: Prompt, extraContext?: string): PromptParserConfig => ({
            promptId: prompt.id,
            storyId: storyId ?? "",
            scenebeat: input.trim(),
            additionalContext: {
                codexContext: [codexContext, reworkContext, extraContext].filter(Boolean).join("\n\n"),
                chatHistory: selectedChat.messages.map(msg => ({ role: msg.role, content: msg.content })),
                includeFullContext: forceStructuredContextOff ? false : includeFullContext,
                selectedSummaries: forceStructuredContextOff || includeFullContext ? [] : selectedSummaries,
                selectedItems: forceStructuredContextOff || includeFullContext ? [] : selectedItems.map(item => item.id),
                selectedChapterContent: forceStructuredContextOff || includeFullContext ? [] : selectedChapterContent
            }
        }),
        [
            input,
            storyId,
            codexContext,
            reworkContext,
            selectedChat.messages,
            forceStructuredContextOff,
            includeFullContext,
            selectedSummaries,
            selectedItems,
            selectedChapterContent
        ]
    );

    // Prose proposals aren't persisted server-side (unlike Codex proposals) — they live only in
    // this component's state until Accept/Reject, matching ProseProposalCard's own doc comment.
    // Each carries the FocusTarget active when it was generated (or null for an ordinary,
    // non-rework turn), so Accept knows whether to replace that captured selection or fall back
    // to the plain insert-at-cursor-or-end path — see handleAcceptProse below.
    const [proseProposals, setProseProposals] = useState<Record<string, { text: string; target: ChapterSelectionTarget | null }>>({});
    // AH4 — tracks which prose-proposal card's Accept is currently awaiting Auto Humanizer's
    // /process call, so ProseProposalCard can show a "Humanizing..." busy state. Only ever set
    // for the manual-Accept path (the auto-insert toggle path has no card to show it on).
    const [humanizingMessageId, setHumanizingMessageId] = useState<string | null>(null);

    // N6 (Notes_Outline_Chat_Bridges_Design.md §4) — same ephemeral-state posture as
    // proseProposals above; only ever populated for non-Editor chats since
    // chatContextService.ts's NOTE_PROPOSAL_INSTRUCTIONS is never included in the Editor system
    // prompt, so the model has no reason to emit the fence there anyway.
    const [noteProposals, setNoteProposals] = useState<Record<string, ParsedNoteProposal>>({});
    const createNoteMutation = useCreateNoteMutation();
    const updateNoteMutation = useUpdateNoteMutation();

    // B3 fix (2026-08-19) — same ephemeral, message-keyed posture as noteProposals above, but for
    // Brainstorm's overview-proposal/handoff-packet fences, which used to persist correctly
    // server-side (handleOverviewProposal/handleHandoffPackets below) yet render nothing at all
    // inline in the chat transcript — only visible/actionable via the separate Approvals tray.
    // These hold the just-created BrainstormChecklistItem(s) so OverviewProposalCard/
    // HandoffPacketCard can render right under the message that produced them and perform the
    // same accept/open action the tray does (useBrainstormChecklistActions.ts). Cleared once
    // accepted/opened here — the tray remains the durable source of truth either way.
    const [overviewChecklistItemsByMessage, setOverviewChecklistItemsByMessage] = useState<Record<string, BrainstormChecklistItem>>({});
    const [handoffChecklistItemsByMessage, setHandoffChecklistItemsByMessage] = useState<Record<string, BrainstormChecklistItem[]>>({});

    // P0.4 B5 — Character template's opt-in psych module. Same ephemeral-state posture as
    // noteProposals above; only ever populated for WB chats since chatContextService.ts's
    // PSYCH_MODULE_INSTRUCTIONS is only ever included in the WB system prompt.
    const [psychProposals, setPsychProposals] = useState<Record<string, ParsedPsychProposal>>({});
    // Sibling to psychProposals above — docs/Sexuality_Playbook_Design.md, same ephemeral-state
    // posture, only ever populated for WB chats.
    const [sexualityProposals, setSexualityProposals] = useState<Record<string, ParsedSexualityProposal>>({});
    const updateLorebookMutation = useUpdateLorebookMutation();

    // L1, docs/Locations_And_Maps_Design.md — Locations template's place sheet. Same ephemeral-
    // state posture as psychProposals above; only ever populated for WB chats since
    // chatContextService.ts's PLACE_SHEET_INSTRUCTIONS is only ever included when
    // templateSlug === "locations".
    const [placeSheetProposals, setPlaceSheetProposals] = useState<Record<string, PlaceState>>({});
    // L4 — once the anchor entry is codexEnabled, handleAcceptPlaceSheet routes into
    // codexPendingChanges instead of a direct metadata merge (same mutation the codex-proposal
    // fence pathway already uses, see useChatMessageGeneration.ts).
    const createCodexProposalMutation = useCreateProposalMutation();

    // MV5, docs/Maps_V2_Sketch_Design.md — Locations template's sketch-canvas proposal. Same
    // ephemeral-state posture as placeSheetProposals above; only ever populated for WB chats since
    // chatContextService.ts's MAP_SKETCH_INSTRUCTIONS is only ever included when
    // templateSlug === "locations". Accept doesn't merge locally like psych/place-sheet — it
    // resolves/creates the anchor entry's map (a real async round-trip, unlike the synchronous
    // metadata merges above) and hands the raw skeleton off via StoryContext, then navigates to
    // the Maps tool — see handleAcceptMapSketch below.
    const [mapSketchProposals, setMapSketchProposals] = useState<Record<string, MapSketchProposal>>({});
    const resolveOrCreateMapMutation = useResolveOrCreateMapForLocationMutation(storyId ?? "");

    // T5 FS4, docs/Lore_Sheet_And_Sync_Design.md §7c — any anchored WB chat's sheet-proposal fence
    // (not template-gated like psych/place-sheet above). Same ephemeral-state posture; Accept
    // replaces the anchor entry's sheetBody wholesale (handleAcceptSheet), "Accept & Sync"
    // additionally chains the existing Sync call right after.
    const [sheetProposals, setSheetProposals] = useState<Record<string, string>>({});
    const [syncingSheetProposal, setSyncingSheetProposal] = useState<string | null>(null);

    // T9, docs/Lore_Sheet_Inline_Rework_Design.md — sub-span sibling to sheetProposals above. Each
    // record carries the FocusTarget active when it was generated (or null for a stray reply with
    // no matching rework in progress, mirroring proseProposals' own target-capture pattern), since
    // Accept needs the captured selectionStart/selectionEnd/text to splice safely.
    const [sheetSpanProposals, setSheetSpanProposals] = useState<Record<string, { text: string; target: SheetFieldReworkTarget | null }>>({});

    // NG6 — same ephemeral-state posture as psychProposals above. No accept/reject dismissal to
    // track: NameProposalCard itself runs the real generate call and owns its own results state.
    const [nameProposals, setNameProposals] = useState<Record<string, ParsedNameProposal>>({});

    // TL7, docs/Story_Timeline_Design.md — WB "timeline"-template chats' own fence. Unlike
    // psych/place-sheet (single object per message), this is an ARRAY per message — accepting or
    // rejecting one item removes it from that message's array; the card auto-hides once empty.
    const [timelinePinProposals, setTimelinePinProposals] = useState<Record<string, ParsedTimelinePinProposalItem[]>>({});
    const createTimelinePinMutation = useCreatePinMutation(storyId ?? "");

    // Outline chats only (P0.4 R5) — "create" proposals are persisted immediately (same mechanism
    // the retired bulk-Generate button used, see handleOutlineProposals below); edit/reorder/
    // delete stay ephemeral like prose/note proposals, keyed by messageId since a single reply can
    // carry more than one of them (unlike prose/note, which are singular per reply).
    const [outlineProposals, setOutlineProposals] = useState<Record<string, NonCreateOutlineProposal[]>>({});
    const { data: outlineItemsForLookup = [] } = useOutlineQuery(storyId ?? "", isOutlineChat);
    const outlineItemLookup = useMemo(() => new Map(outlineItemsForLookup.map(item => [item.id, item.title])), [outlineItemsForLookup]);
    const resolveOutlineItemTitle = (itemId: string) => outlineItemLookup.get(itemId);
    const createOutlineItemMutation = useCreateOutlineItemMutation(storyId ?? "");
    const updateOutlineItemMutation = useUpdateOutlineItemMutation(storyId ?? "");
    const reorderOutlineMutation = useReorderOutlineMutation(storyId ?? "");
    const deleteOutlineItemMutation = useDeleteOutlineItemMutation(storyId ?? "");

    // B3 fix — powers the inline OverviewProposalCard/HandoffPacketCard accept/open actions
    // below with the exact same logic the Approvals tray (BrainstormChecklistTray.tsx) uses.
    const brainstormChecklistActions = useBrainstormChecklistActions({
        chatId: selectedChat.id,
        storyId: storyId ?? "",
        fromChatTitleSnapshot: selectedChat.title
    });

    // P0.4 R6 — shared "apply" core for both the manual Accept button (handleAcceptProse below)
    // and the auto-insert path (onProseProposal callback below), so the two never drift. Pure
    // side-effecting apply, no proseProposals/dismiss bookkeeping — callers own that.
    // AH4 — Auto Humanizer's commit-time filter hooks in here, and only here: a plain insert
    // (proposal.target === null) is the one prose-accept shape it's allowed to touch. Selection
    // Rework Accept (proposal.target !== null) is explicitly out of scope (design decision #10 —
    // before/after must stay visible), so it skips straight past the humanize call below.
    const autoHumanizerSettingsQuery = useAutoHumanizerSettingsQuery();
    const autoHumanizeMutation = useAutoHumanizeProcessMutation();

    const applyProseProposal = async (proposal: {
        text: string;
        target: ChapterSelectionTarget | null;
    }): Promise<"applied" | "not-found" | "selection-changed"> => {
        if (proposal.target) {
            const result = applyChapterSelectionReplace(proposal.target, proposal.text);
            return result === "replaced" ? "applied" : result;
        }

        let finalText = proposal.text;
        if (autoHumanizerSettingsQuery.data?.enabled) {
            const result = await autoHumanizeMutation.mutateAsync(proposal.text);
            finalText = result.text ?? proposal.text;
            if (!result.success) toast.error(result.message ?? "Auto Humanizer failed — inserted original text");
        }

        const editor = currentChapterId ? getActiveChapterEditor(currentChapterId) : null;
        if (!editor) return "not-found";
        insertProposedProse(editor, finalText);
        return "applied";
    };

    // Extracted from useChatMessageGeneration's onOverviewProposal/onHandoffPackets config (below)
    // so the manual "Propose from this reply" retry (handleProposeFromReply, ChatMessageList.tsx's
    // hover action) can reuse the exact same persist-and-log logic instead of duplicating it —
    // both the model's own (rare) self-emitted fence and the automatic/manual extraction-pass
    // results need to land in the checklist tray identically.
    const handleOverviewProposal = useCallback(
        (messageId: string, proposal: OverviewProposalPayload) => {
            if (!storyId) return;
            brainstormApi
                .createChecklistItem({ chatId: selectedChat.id, storyId, kind: "overview_proposal", payload: proposal, sourceMessageId: messageId })
                .then(item => {
                    queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] });
                    setOverviewChecklistItemsByMessage(prev => ({ ...prev, [messageId]: item }));
                    const fromDesk = selectedChat.chatType ?? "general";
                    if (proposal.proposalType !== "note" || fromDesk === "notes") return;
                    deskTransfersApi
                        .log(storyId, {
                            event: "proposed",
                            kind: "overview_proposal",
                            fromDesk,
                            fromChatId: selectedChat.id,
                            fromChatTitleSnapshot: selectedChat.title,
                            toDesk: "notes",
                            subject: proposal.title,
                            sourceChecklistItemId: item.id
                        })
                        .catch(() => {});
                });
        },
        [storyId, selectedChat.id, selectedChat.chatType, selectedChat.title, queryClient]
    );

    const handleHandoffPackets = useCallback(
        (messageId: string, packets: HandoffPacket[]) => {
            if (!storyId) return;
            Promise.all(
                packets.map(packet =>
                    brainstormApi
                        .createChecklistItem({
                            chatId: selectedChat.id,
                            storyId,
                            kind: "handoff",
                            payload: packet,
                            sourceMessageId: messageId
                        })
                        .then(item => {
                            deskTransfersApi
                                .log(storyId, {
                                    event: "proposed",
                                    kind: "handoff",
                                    fromDesk: selectedChat.chatType ?? "general",
                                    fromChatId: selectedChat.id,
                                    fromChatTitleSnapshot: selectedChat.title,
                                    toDesk: packet.destination,
                                    subject: packet.summary,
                                    crumb: packet.detail,
                                    sourceChecklistItemId: item.id
                                })
                                .catch(() => {});
                            return item;
                        })
                )
            ).then(items => {
                queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] });
                setHandoffChecklistItemsByMessage(prev => ({ ...prev, [messageId]: items }));
            });
        },
        [storyId, selectedChat.id, selectedChat.chatType, selectedChat.title, queryClient]
    );

    const dismissOverviewChecklistItem = (messageId: string) =>
        setOverviewChecklistItemsByMessage(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // Manual backstop for the automatic extraction pass (useChatMessageGeneration.ts) — a per-
    // message "Propose from this reply" retry (ChatMessageList.tsx hover action) for when the
    // automatic pass judged there was nothing to propose but the user disagrees, or a prior pass
    // reported a partial-failure drop. Calls the identical server-side extraction endpoint.
    const [proposingMessageId, setProposingMessageId] = useState<string | null>(null);
    const handleProposeFromReply = useCallback(
        async (messageId: string, replyText: string) => {
            setProposingMessageId(messageId);
            // B16: the automatic pass (useChatMessageGeneration.ts) passes the triggering user
            // message as extraction context — this manual retry used to omit it entirely, so an
            // escalating "please make a handoff card" instruction typed by the user (exactly the
            // kind of message someone types right before hitting this retry) was invisible to the
            // extractor. Find the nearest preceding user turn and pass it the same way.
            const replyIndex = selectedChat.messages.findIndex(m => m.id === messageId);
            const precedingUserMessage =
                replyIndex >= 0
                    ? [...selectedChat.messages.slice(0, replyIndex)].reverse().find(m => m.role === "user")
                    : undefined;
            const [error, result] = await attemptPromise(() =>
                brainstormApi.extractProposals(replyText, precedingUserMessage?.content)
            );
            setProposingMessageId(null);
            if (error) {
                toast.error("Couldn't extract proposals from that reply — try again.");
                return;
            }
            if (result.overview) handleOverviewProposal(messageId, result.overview);
            if (result.handoffs.length > 0) handleHandoffPackets(messageId, result.handoffs);
            if (!result.overview && result.handoffs.length === 0 && result.droppedCount === 0) {
                toast.info("Nothing to propose in that reply.");
                return;
            }
            if (result.droppedCount > 0)
                toast.warning(`Captured ${result.handoffs.length} hand-off item(s) — ${result.droppedCount} couldn't be parsed.`);
        },
        [handleOverviewProposal, handleHandoffPackets, selectedChat.messages]
    );

    const { generate, isGenerating, abort, streamingContent } = useChatMessageGeneration({
        selectedChat,
        selectedPrompt,
        selectedModel,
        onChatUpdate,
        createPromptConfig,
        autoAcceptCodex: toggles.autoAcceptCodex,
        onUsage: usage => setLastUsage(usage ?? null),
        onProseProposal: enableProseProposals
            ? async (messageId, proposal) => {
                  // Only chapter-selection rework turns produce a prose-proposal Accept path —
                  // Lorebook/Outline rework replies via codex-proposal/outline-proposal instead
                  // (see reworkContext below), so a non-chapter-selection activeRework never
                  // carries a target here.
                  const target = activeRework && activeRework.target.kind === "chapter-selection" ? activeRework.target : null;
                  const record = { text: proposal, target };
                  if (toggles.autoInsertProse) {
                      const result = await applyProseProposal(record);
                      if (result === "applied") {
                          if (target) setActiveRework(null);
                          toast.success("Auto-inserted into chapter");
                          return;
                      }
                      if (result === "selection-changed") {
                          toast.warning(
                              "Your selection changed since this rework started — inserted instead of replacing; please check placement."
                          );
                          setActiveRework(null);
                          return;
                      }
                      // "not-found" (no matching chapter editor open) — fall through to the manual
                      // card below so the proposed text is never silently dropped.
                  }
                  setProseProposals(prev => ({ ...prev, [messageId]: record }));
              }
            : undefined,
        onNoteProposal: (messageId, proposal) => setNoteProposals(prev => ({ ...prev, [messageId]: proposal })),
        onOutlineProposals: (messageId, proposals) => {
            if (!storyId) return;
            const rest: NonCreateOutlineProposal[] = [];
            // Sequential per-parent order counters, seeded from the current outline (siblingCount +
            // 1, matching OutlinePage.tsx's manual "Add Chapter" convention) and bumped for each
            // create so multiple siblings proposed in the same reply don't collide. A raw
            // `Date.now()` here previously leaked into the UI as the displayed chapter/scene number
            // (e.g. "1786572555602. The Drop" — OutlineChapterCard.tsx/OutlineSceneRow.tsx render
            // `{item.order}. {item.title}`), since `order` is a real display position, not just a
            // sort key. Sibling count must exclude rejected items — outlineItemsForLookup (unlike
            // the tree the model sees) includes every status, so without this a story with a few
            // rejected drafts started numbering brand-new chapters "9." instead of "1." even though
            // the tree only shows the one real chapter.
            const nextOrderByParent = new Map<string, number>();
            const nextOrder = (parentId: string | null): number => {
                const key = parentId ?? "";
                const current =
                    nextOrderByParent.get(key) ??
                    outlineItemsForLookup.filter(item => (item.parentId ?? null) === parentId && item.status !== "rejected").length + 1;
                nextOrderByParent.set(key, current + 1);
                return current;
            };
            // A chapter and its scenes can now arrive as separate "create" proposals in the same
            // reply (OUTLINE_PROPOSAL_INSTRUCTIONS's `tempId` protocol) — the chapter's real id
            // doesn't exist until its own mutation resolves, so creates run sequentially and each
            // scene's parentId is resolved from the map of tempId -> real id built up as we go.
            const tempIdToRealId = new Map<string, string>();
            const resolveParentId = (parentId: string | null): string | null =>
                parentId !== null && tempIdToRealId.has(parentId) ? tempIdToRealId.get(parentId)! : parentId;
            const applyCreates = async () => {
                for (const proposal of proposals) {
                    if (proposal.type !== "create") continue;
                    const parentId = resolveParentId(proposal.parentId);
                    // Same "persist immediately as a row" convention the retired bulk-Generate
                    // button used. Normally lands "pending" — appears instantly in the tree with
                    // the existing "AI Suggested" badge + Accept/Reject controls
                    // (OutlineChapterCard.tsx/OutlineSceneRow.tsx). When autoAcceptOutline is on,
                    // land it "confirmed" directly instead — same end state as an instant manual
                    // accept, skipping the badge entirely (P0.4 R6).
                    const created = await createOutlineItemMutation.mutateAsync({
                        storyId,
                        parentId,
                        type: proposal.itemType,
                        title: proposal.title,
                        summary: proposal.summary,
                        wordCountTarget: proposal.wordCountTarget,
                        order: nextOrder(parentId),
                        source: "ai_suggested",
                        status: toggles.autoAcceptOutline ? "confirmed" : "pending",
                        chapterId: null
                    });
                    if (proposal.tempId) tempIdToRealId.set(proposal.tempId, created.id);
                }
            };
            // Errors already surface via createOutlineItemMutation's own onError toast; a rejected
            // create just stops the rest of this reply's batch (e.g. its scenes) rather than
            // throwing an unhandled rejection.
            void applyCreates().catch(() => {});
            for (const proposal of proposals) {
                if (proposal.type === "create") continue;
                // P0.4 R6 — edit/reorder auto-accept immediately when the toggle is on, calling the
                // same mutations handleAcceptOutlineProposal below uses manually. delete is
                // deliberately excluded (docs/Chat_Panel_Integrations_Design.md §4: only create/
                // edit/reorder get the toggle) — always falls through to the ephemeral card.
                if (toggles.autoAcceptOutline && proposal.type !== "delete") {
                    if (proposal.type === "edit") {
                        const { itemId, type: _type, ...fields } = proposal;
                        updateOutlineItemMutation.mutate({ id: itemId, data: fields });
                    } else {
                        reorderOutlineMutation.mutate(proposal.updates);
                    }
                    continue;
                }
                rest.push(proposal);
            }
            if (rest.length > 0) setOutlineProposals(prev => ({ ...prev, [messageId]: rest }));
        },
        onLoreSuggestions: (_messageId, suggestions) => onLoreSuggestions?.(suggestions),
        // Brainstorm chats only (P0.4 B0-B4) — unlike prose/note/outline-edit proposals, these are
        // persisted immediately as durable brainstormChecklist rows the moment they're parsed
        // (B4's tray needs them durable across reloads, not ephemeral component state); the tray
        // itself queries the server directly (BrainstormChecklistTray.tsx), so invalidating its
        // query is all this component needs to do after the POST resolves. Extracted above
        // (handleOverviewProposal/handleHandoffPackets) so the automatic/manual extraction-pass
        // results (useChatMessageGeneration.ts's background follow-up, handleProposeFromReply's
        // manual retry) share this exact persist-and-log logic instead of duplicating it.
        onOverviewProposal: handleOverviewProposal,
        onHandoffPackets: handleHandoffPackets,
        onPsychProposal: (messageId, proposal) => setPsychProposals(prev => ({ ...prev, [messageId]: proposal })),
        onSexualityProposal: (messageId, proposal) => setSexualityProposals(prev => ({ ...prev, [messageId]: proposal })),
        onPlaceSheetProposal: (messageId, proposal) => setPlaceSheetProposals(prev => ({ ...prev, [messageId]: proposal })),
        onSheetProposal: (messageId, proposal) => setSheetProposals(prev => ({ ...prev, [messageId]: proposal })),
        onSheetSpanProposal: (messageId, proposal) => {
            // Only a "lorebook-sheet-field" rework turn produces a splice-able target — a stray
            // sheet-span-proposal with no matching activeRework (e.g. the model emitted one
            // unprompted) still shows a card, but Accept has nothing to splice against and degrades
            // (see handleAcceptSheetSpan below), same posture as onProseProposal's target capture.
            const target = activeRework && activeRework.target.kind === "lorebook-sheet-field" ? activeRework.target : null;
            setSheetSpanProposals(prev => ({ ...prev, [messageId]: { text: proposal, target } }));
        },
        onMapSketchProposal: (messageId, proposal) => setMapSketchProposals(prev => ({ ...prev, [messageId]: proposal })),
        onNameProposal: (messageId, proposal) => setNameProposals(prev => ({ ...prev, [messageId]: proposal })),
        onTimelinePinProposal: (messageId, items) => setTimelinePinProposals(prev => ({ ...prev, [messageId]: items })),
        // Notes chats only (P0.4 K2/K4) — same "persist immediately as a durable checklist row"
        // posture as onOverviewProposal/onHandoffPackets above; NotesChecklistTray.tsx handles the
        // "Accept all" write.
        onNoteSplitProposal: (messageId, proposal) => {
            if (!storyId) return;
            brainstormApi
                .createChecklistItem({ chatId: selectedChat.id, storyId, kind: "note_split", payload: proposal, sourceMessageId: messageId })
                .then(() => queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] }));
        },
        // Chat Shuttle (Editor/Outline/WB only, H1/H4) — same "persist immediately as a durable
        // checklist row" posture as onOverviewProposal/onHandoffPackets above; ShuttleTray.tsx
        // (rendered by each host's own rail, alongside CodexProposalTray) handles Open/Answer
        // here/Mark done. H7's autoShuttle pref only skips the tray's manual "Open" click (item
        // lands "opened" + Research gets pre-seeded) — never auto-sends/generates a Research
        // answer and never force-switches the user's current tool (decision #1).
        onShuttleProposal: (messageId, proposal) => {
            if (!storyId) return;
            brainstormApi
                .createChecklistItem({ chatId: selectedChat.id, storyId, kind: "shuttle", payload: proposal, sourceMessageId: messageId })
                .then(item => {
                    queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] });
                    // Transfer Log (T1) — 'proposed' fires here regardless of autoShuttle; the
                    // manual-Open path's 'opened' event lives in ShuttleTray.tsx's handleOpen.
                    deskTransfersApi
                        .log(storyId, {
                            event: "proposed",
                            kind: "shuttle",
                            fromDesk: selectedChat.chatType ?? "general",
                            fromChatId: selectedChat.id,
                            fromChatTitleSnapshot: selectedChat.title,
                            toDesk: "research",
                            subject: proposal.question,
                            crumb: proposal.crumb ?? null,
                            sourceChecklistItemId: item.id
                        })
                        .catch(() => {});
                    if (!toggles.autoShuttle) return;
                    const text = proposal.crumb ? `${proposal.question}\n\n(Scene context: ${proposal.crumb})` : proposal.question;
                    setPendingShuttleSeed({ originChatId: selectedChat.id, shuttleItemId: item.id, text });
                    brainstormApi
                        .updateChecklistStatus(item.id, "opened")
                        .then(() => queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] }));
                    deskTransfersApi
                        .log(storyId, {
                            event: "opened",
                            kind: "shuttle",
                            fromDesk: selectedChat.chatType ?? "general",
                            fromChatId: selectedChat.id,
                            fromChatTitleSnapshot: selectedChat.title,
                            toDesk: "research",
                            subject: proposal.question,
                            crumb: proposal.crumb ?? null,
                            sourceChecklistItemId: item.id
                        })
                        .catch(() => {});
                    toast.info("Auto-shuttled to Research — question is ready there whenever you switch over.");
                });
        }
    });

    const dismissOutlineProposal = (messageId: string, index: number) =>
        setOutlineProposals(prev => {
            const next = (prev[messageId] ?? []).filter((_, i) => i !== index);
            if (next.length === 0) {
                const { [messageId]: _removed, ...rest } = prev;
                return rest;
            }
            return { ...prev, [messageId]: next };
        });

    const handleAcceptOutlineProposal = (messageId: string, index: number) => {
        const proposal = outlineProposals[messageId]?.[index];
        if (!proposal) return;

        if (proposal.type === "edit") {
            const { itemId, type: _type, ...fields } = proposal;
            updateOutlineItemMutation.mutate({ id: itemId, data: fields });
        } else if (proposal.type === "reorder") {
            reorderOutlineMutation.mutate(proposal.updates);
        } else if (proposal.type === "delete") {
            deleteOutlineItemMutation.mutate(proposal.itemId);
        }

        dismissOutlineProposal(messageId, index);
    };

    // TL7 — same per-message-array + remove-one-item posture as dismissOutlineProposal above,
    // keyed by object identity (parsed items have no id of their own until accepted) rather than
    // index, so a reject after an accept elsewhere in the same array doesn't shift indices.
    const dismissTimelinePinProposal = (messageId: string, item: ParsedTimelinePinProposalItem) =>
        setTimelinePinProposals(prev => {
            const next = (prev[messageId] ?? []).filter(existing => existing !== item);
            if (next.length === 0) {
                const { [messageId]: _removed, ...rest } = prev;
                return rest;
            }
            return { ...prev, [messageId]: next };
        });

    // Reuses the same createPin mutation PlaceOnTimelineButton.tsx uses — no timelineId means it
    // defaults to the story's Spine timeline server-side (ensureSpineTimeline).
    const handleAcceptTimelinePin = (messageId: string, item: ParsedTimelinePinProposalItem) => {
        createTimelinePinMutation.mutate(
            {
                title: item.title,
                blurb: item.blurb ?? null,
                whenKind: item.whenKind,
                relativeOffsetYears: item.relativeOffsetYears ?? null,
                fuzzyPhrase: item.fuzzyPhrase ?? null,
                civilDate: item.civilDate ?? null
            },
            { onSuccess: () => dismissTimelinePinProposal(messageId, item) }
        );
    };

    const handleAcceptAllTimelinePins = (messageId: string) => {
        const items = timelinePinProposals[messageId] ?? [];
        items.forEach(item => handleAcceptTimelinePin(messageId, item));
    };

    const dismissNoteProposal = (messageId: string) =>
        setNoteProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // P0.4 K2 — a note-item rework in progress means this note-proposal is the UPDATED note, not
    // a new one; same activeRework-branching pattern handleAcceptProse uses for chapter-selection
    // rework. No fence format change — note-proposal's {title, content, type} payload is reused
    // as-is, only the Accept target differs.
    const handleAcceptNote = (messageId: string) => {
        const proposal = noteProposals[messageId];
        if (!proposal || !storyId) return;
        if (activeRework && activeRework.target.kind === "note-item") {
            updateNoteMutation.mutate({ id: activeRework.target.noteId, data: { title: proposal.title, content: proposal.content } });
            setActiveRework(null);
        } else {
            createNoteMutation.mutate({ storyId, title: proposal.title, content: proposal.content, type: proposal.type });
        }
        dismissNoteProposal(messageId);
    };

    const dismissPsychProposal = (messageId: string) =>
        setPsychProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // P0.4 B5 — merges into the anchor entry's existing metadata rather than replacing it
    // wholesale (metadata also holds unrelated relationships/importance/customFields — see
    // schema.ts's lorebookEntries.metadata comment), via the same generic entry-update mutation
    // every other lorebook edit uses. Never goes through codexPendingChanges/codexService, which
    // stays concrete-state-only (see chatContextService.ts's PSYCH_MODULE_INSTRUCTIONS comment).
    const handleAcceptPsych = (messageId: string) => {
        const proposal = psychProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId) return;
        const entry = entryLookup.get(entryId);
        updateLorebookMutation.mutate({
            id: entryId,
            data: {
                metadata: {
                    ...entry?.metadata,
                    psychProfile: { ...entry?.metadata?.psychProfile, ...proposal }
                }
            }
        });
        dismissPsychProposal(messageId);
    };

    const dismissSexualityProposal = (messageId: string) =>
        setSexualityProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // Exact sibling of handleAcceptPsych above (docs/Sexuality_Playbook_Design.md) — merges into
    // the anchor entry's existing metadata rather than replacing it wholesale, via the same
    // generic entry-update mutation. Never goes through codexPendingChanges/codexService.
    const handleAcceptSexuality = (messageId: string) => {
        const proposal = sexualityProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId) return;
        const entry = entryLookup.get(entryId);
        updateLorebookMutation.mutate({
            id: entryId,
            data: {
                metadata: {
                    ...entry?.metadata,
                    sexualityProfile: { ...entry?.metadata?.sexualityProfile, ...proposal }
                }
            }
        });
        dismissSexualityProposal(messageId);
    };

    const dismissPlaceSheetProposal = (messageId: string) =>
        setPlaceSheetProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // L1/L4, docs/Locations_And_Maps_Design.md — two-tier accept, branching on whether the anchor
    // entry has graduated to versioned place-Codex tracking (PlaceCodexStateEditor.tsx):
    //   - not codexEnabled: same merge-not-replace posture as handleAcceptPsych above, direct into
    //     metadata.placeState (L1, unchanged).
    //   - codexEnabled: routes through codexPendingChanges instead (same mutation the
    //     codex-proposal fence pathway uses), so it gets real Approve/Reject/Edit-First review via
    //     CodexProposalTray.tsx / CodexPendingChangesPanel.tsx rather than an ephemeral auto-merge.
    //     proposedState is a full CodexState replacement server-side (codexService.ts's
    //     approvePendingChange), so existing wardrobe/appearance/wounds are carried through
    //     untouched and customFields are merged by key (upsert) rather than duplicated.
    const handleAcceptPlaceSheet = (messageId: string) => {
        const proposal = placeSheetProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId) return;
        const entry = entryLookup.get(entryId);

        if (entry?.codexEnabled) {
            const existing = entry.codexState ?? EMPTY_CODEX_STATE;
            const proposed = placeStateToCodexFields(proposal);
            const customFields = [...existing.customFields];
            for (const field of proposed.customFields) {
                const i = customFields.findIndex(f => f.key === field.key);
                if (i >= 0) customFields[i] = field;
                else customFields.push(field);
            }
            const existingLandmarks = new Set(existing.items.map(item => item.value));
            const items = [...existing.items, ...proposed.items.filter(item => !existingLandmarks.has(item.value))];
            createCodexProposalMutation.mutate({
                chatId: selectedChat.id,
                data: {
                    type: "modify_entry",
                    entryId,
                    messageId,
                    proposedState: { ...existing, customFields, items }
                }
            });
        } else {
            updateLorebookMutation.mutate({
                id: entryId,
                data: {
                    metadata: {
                        ...entry?.metadata,
                        placeState: { ...entry?.metadata?.placeState, ...proposal }
                    }
                }
            });
        }
        dismissPlaceSheetProposal(messageId);
    };

    const dismissSheetProposal = (messageId: string) =>
        setSheetProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // T5 FS4 — a wholesale sheetBody replace, not a merge (the model is instructed to emit the
    // whole sheet each time — see chatContextService.ts's SHEET_PROPOSAL_INSTRUCTIONS). Plain
    // metadata-free field update via the generic entry-update mutation, same posture as
    // handleAcceptPsych's non-Codex write.
    const handleAcceptSheet = (messageId: string) => {
        const proposal = sheetProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId) return;
        void updateLorebookMutation.mutateAsync({ id: entryId, data: { sheetBody: proposal } }).then(updated => onEntryUpdated?.(updated));
        dismissSheetProposal(messageId);
    };

    // "Accept & Sync" — a convenience chain, not a bypass: writes sheetBody (same as Accept above),
    // then immediately calls the existing Sync endpoint. Sync's own output still lands as a
    // separate codexPendingChanges row requiring its own Approve — two real gates, one click (§7c's
    // "two gates, one convenience click"). Button stays disabled (SheetProposalCard's isSyncing
    // prop) while the chained call is in flight so a slow connection can't double-fire it.
    const handleAcceptSheetAndSync = async (messageId: string) => {
        const proposal = sheetProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId) return;
        const entry = entryLookup.get(entryId);
        setSyncingSheetProposal(messageId);
        const [error] = await attemptPromise(async () => {
            const updated = await updateLorebookMutation.mutateAsync({ id: entryId, data: { sheetBody: proposal } });
            onEntryUpdated?.(updated);
            const result = await lorebookApi.syncSheet(entryId, { sheetBody: proposal, category: entry?.category ?? "character" });
            if (result.success) {
                await queryClient.invalidateQueries({ queryKey: codexPendingKeys.list(entryId) });
                toast.success("Sheet saved and synced — review the proposal below.");
            } else {
                toast.error(result.message || "Sheet saved, but nothing to sync");
            }
        });
        if (error) toast.error(error.message || "Couldn't sync the sheet");
        setSyncingSheetProposal(null);
        dismissSheetProposal(messageId);
    };

    const dismissSheetSpanProposal = (messageId: string) =>
        setSheetSpanProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // T9, IR4 — unlike handleAcceptSheet's wholesale replace, this splices only the reworked span
    // back into the CURRENT sheetBody (fetched fresh from entryLookup, not the possibly-stale value
    // captured at selection time). Re-checks the captured text still matches at the recorded
    // offsets first; if the sheet was edited since capture (by the user, or by a whole-sheet
    // sheet-proposal landing in between), degrades with a toast instead of guessing at a new
    // splice point — the same exact-match-or-degrade doctrine RagIssueMarkNode's highlight match
    // already uses (docs/Lore_Sheet_Inline_Rework_Design.md §3 risk #1). No target (a stray reply
    // with no matching rework in progress) degrades the same way.
    const handleAcceptSheetSpan = (messageId: string) => {
        const record = sheetSpanProposals[messageId];
        const target = record?.target;
        if (!record || !target) {
            toast.error("Couldn't apply this edit — the original selection is no longer available.");
            dismissSheetSpanProposal(messageId);
            return;
        }
        const currentSheetBody = entryLookup.get(target.entryId)?.sheetBody ?? "";
        const { selectionStart, selectionEnd, text } = target;
        if (currentSheetBody.slice(selectionStart, selectionEnd) !== text) {
            toast.error("The Lore Sheet changed since this rework started — couldn't safely apply the edit.");
            dismissSheetSpanProposal(messageId);
            return;
        }
        const spliced = currentSheetBody.slice(0, selectionStart) + record.text + currentSheetBody.slice(selectionEnd);
        void updateLorebookMutation.mutateAsync({ id: target.entryId, data: { sheetBody: spliced } }).then(updated => {
            onEntryUpdated?.(updated);
        });
        setActiveRework(null);
        dismissSheetSpanProposal(messageId);
    };

    const dismissMapSketchProposal = (messageId: string) =>
        setMapSketchProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    // MV5 — unlike handleAcceptPsych/handleAcceptPlaceSheet above (synchronous metadata merges),
    // this needs a real round-trip first: find-or-create the anchor location's map (same logic
    // OpenMapButton.tsx's MV3 flow already established, just as an awaitable mutation), THEN hand
    // the raw element skeleton off via a one-shot StoryContext pointer and switch tools —
    // MapsTool.tsx picks it up and MapCanvas.tsx (inside its own lazy chunk) is the only place
    // `convertToExcalidrawElements` ever actually runs. The proposal card's Accept button stays
    // disabled while this is in flight (see the render gate below) so a slow connection can't
    // produce a double-create.
    const handleAcceptMapSketch = (messageId: string) => {
        const proposal = mapSketchProposals[messageId];
        const entryId = selectedChat.anchorEntryId;
        if (!proposal || !entryId || !storyId) return;
        const entry = entryLookup.get(entryId);
        resolveOrCreateMapMutation.mutate(
            { locationId: entryId, title: proposal.title || entry?.name || "Untitled location" },
            {
                onSuccess: map => {
                    setPendingMapSketch({ mapId: map.id, elements: proposal.elements });
                    setCurrentTool("story-map");
                }
            }
        );
        dismissMapSketchProposal(messageId);
    };

    // N5 (Notes_Outline_Chat_Bridges_Design.md §4) — manual "Save message as note". Reuses
    // NoteFormDialog (the same title/type picker the Notes tool's own "New Note" flow uses) so a
    // second bespoke dialog isn't needed; the message's own content is the note body, not editable
    // here (the user can edit the note afterward in the Notes tool if needed).
    const [noteSourceMessage, setNoteSourceMessage] = useState<ChatMessage | null>(null);
    const handleSaveMessageAsNote = (title: string, type: "idea" | "research" | "todo" | "other") => {
        if (!noteSourceMessage || !storyId) return;
        createNoteMutation.mutate({ storyId, title, content: noteSourceMessage.content, type });
        setNoteSourceMessage(null);
    };

    // P1.5 — per-message action bar (Copy shipped as MB0; this is MB1-MB4). Messages live as a
    // single JSON array on the aiChats row (no per-message table), and the generic
    // `PATCH /:chatId {messages}` full-array-replace already exists (chatsApi.update) — so no new
    // server routes were needed for delete/edit/regenerate, just client-side array mutation +
    // that one existing endpoint.
    // B27 (docs/CODE_REVIEW_2026-08-17.md) — sends the version this pane last saw so a stale
    // edit/delete/regenerate/resend (this chat open in another tab/pane, or the in-flight
    // streaming reply this same tab just sent, wrote a message this array doesn't know about)
    // gets rejected instead of silently clobbering it. On conflict, push the server's current
    // state straight into this component via onChatUpdate — unlike the chapter-editor equivalent
    // (B24), there's no separate Lexical/cache duality to reconcile here, so this alone re-renders
    // the message list with the real current state; no extra "reload" click needed.
    const persistMessages = async (messages: ChatMessage[]) => {
        const [error, updated] = await attemptPromise(() =>
            chatsApi.update(selectedChat.id, { messages, expectedMessagesVersion: selectedChat.messagesVersion })
        );
        if (error) {
            if (error instanceof ApiError && error.status === 409) {
                const latest = (error.body as { latest?: AIChat } | undefined)?.latest;
                if (latest) onChatUpdate(latest);
                toast.warning("This chat changed elsewhere — your action didn't apply. Showing the current state.");
                return latest ?? selectedChat;
            }
            throw error;
        }
        onChatUpdate(updated);
        return updated;
    };

    // MB3 — edit, both roles. Assistant edits rewrite content in place (they never fed back into
    // the model's own context). User edits also truncate everything after them: once the user's
    // own turn changes, whatever the model replied with next was responding to text that no
    // longer exists, so keeping it around would be stale/misleading (LM Studio's own convention).
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
    const handleStartEdit = (message: ChatMessage) => {
        setEditingMessageId(message.id);
        setEditingContent(message.content);
    };
    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingContent("");
    };
    const handleSaveEdit = async (messageId: string) => {
        const idx = selectedChat.messages.findIndex(m => m.id === messageId);
        const trimmed = editingContent.trim();
        if (idx === -1 || !trimmed) return;
        const target = selectedChat.messages[idx];
        const editedMessage: ChatMessage = {
            ...target,
            content: trimmed,
            originalContent: target.originalContent ?? target.content,
            editedAt: new Date().toISOString(),
            editedBy: "user",
            edited: true
        };
        const newMessages =
            target.role === "user"
                ? [...selectedChat.messages.slice(0, idx), editedMessage]
                : selectedChat.messages.map((m, i) => (i === idx ? editedMessage : m));
        await persistMessages(newMessages);
        handleCancelEdit();
    };

    // MB2 — delete, both roles. Deleting a user message orphans nothing (no branching concept in
    // this app), but stays confirm-gated since it's destructive and unrecoverable either way.
    const [pendingDeleteMessage, setPendingDeleteMessage] = useState<ChatMessage | null>(null);
    const handleConfirmDelete = async () => {
        if (!pendingDeleteMessage) return;
        const newMessages = selectedChat.messages.filter(m => m.id !== pendingDeleteMessage.id);
        await persistMessages(newMessages);
        setPendingDeleteMessage(null);
    };

    // MB4 — regenerate, assistant messages only. Deletes the target reply and everything after it
    // (truncateMessagesAfter-equivalent, inline), then re-invokes generate() with the preceding
    // user message's own text — same path a fresh send takes, so it picks up fresh RAG/web-search
    // extraContext rather than replaying whatever was current at the original send time.
    const handleRegenerateMessage = async (message: ChatMessage) => {
        if (isGenerating) return;
        const idx = selectedChat.messages.findIndex(m => m.id === message.id);
        if (idx === -1) return;
        let userIdx = -1;
        for (let i = idx - 1; i >= 0; i--) {
            if (selectedChat.messages[i].role === "user") {
                userIdx = i;
                break;
            }
        }
        if (userIdx === -1) {
            toast.error("No prior message to regenerate from");
            return;
        }
        const userContent = selectedChat.messages[userIdx].content;
        await persistMessages(selectedChat.messages.slice(0, userIdx));
        const extraContext = await computeExtraContext(userContent);
        await generate(userContent, extraContext);
    };

    // Resend — user messages only. Same shape as regenerate above, just anchored at the user
    // message itself rather than the one before it: deletes this message and everything after,
    // then re-sends its own text through generate() so it (and whatever follows) is redone with
    // fresh RAG/web-search extraContext.
    const handleResendMessage = async (message: ChatMessage) => {
        if (isGenerating) return;
        const idx = selectedChat.messages.findIndex(m => m.id === message.id);
        if (idx === -1) return;
        const userContent = message.content;
        await persistMessages(selectedChat.messages.slice(0, idx));
        const extraContext = await computeExtraContext(userContent);
        await generate(userContent, extraContext);
    };

    // Branch — forks the conversation into a new sibling chat carrying everything up to and
    // including the chosen message, so two directions can be explored from the same point without
    // losing either. Only wired up when storyId is present (global chats, e.g. Research's Global
    // mode, have no chat list to branch into — see the ChatMessageList prop gate below).
    const createChatMutation = useCreateChatMutation();
    const updateChatMutation = useUpdateChatMutation();
    const handleBranchMessage = async (message: ChatMessage) => {
        if (!storyId) return;
        const idx = selectedChat.messages.findIndex(m => m.id === message.id);
        if (idx === -1) return;
        const branchedMessages = selectedChat.messages.slice(0, idx + 1);
        const newChat = await createChatMutation.mutateAsync({
            storyId,
            chatType: selectedChat.chatType ?? undefined,
            templateSlug: selectedChat.templateSlug ?? undefined,
            title: `${selectedChat.title} (branch)`,
            anchorEntryId: selectedChat.anchorEntryId ?? null,
            anchorChapterId: selectedChat.anchorChapterId ?? null
        });
        const updatedChat = await updateChatMutation.mutateAsync({ id: newChat.id, data: { messages: branchedMessages } });
        onChatUpdate(updatedChat);
        toast.success(`Branched into "${updatedChat.title}"`);
    };

    // Chat Shuttle H6 — the "chat bubble selection" half of highlight → Note (ChatMessageList.tsx's
    // window.getSelection()-based bar), a span-level sibling to N5's whole-message save above.
    // Same NoteFormDialog reuse; "Send to Notes chat" reuses the generic pendingChatComposerSeed
    // handoff (same mechanism Brainstorm's tray already uses for its own Notes destination).
    const [selectionNoteText, setSelectionNoteText] = useState<string | null>(null);
    const handleSaveSelectionAsNote = (text: string) => setSelectionNoteText(text);
    const handleSendSelectionToNotesChat = (text: string) => {
        setPendingChatComposerSeed({ tool: "notes", text });
        setCurrentTool("notes");
        // Transfer Log (T1) — single-step action (no separate propose/open moment, unlike the
        // tray-backed mechanisms above), so both events log together here.
        if (storyId)
            for (const event of ["proposed", "opened"] as const)
                deskTransfersApi
                    .log(storyId, {
                        event,
                        kind: "highlight_to_notes",
                        fromDesk: selectedChat.chatType ?? "general",
                        fromChatId: selectedChat.id,
                        fromChatTitleSnapshot: selectedChat.title,
                        toDesk: "notes",
                        subject: text
                    })
                    .catch(() => {});
    };
    const handleSubmitSelectionNote = (title: string, type: "idea" | "research" | "todo" | "other") => {
        if (!selectionNoteText || !storyId) return;
        createNoteMutation.mutate({ storyId, title, content: selectionNoteText, type });
        setSelectionNoteText(null);
    };

    const dismissProseProposal = (messageId: string) =>
        setProseProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    const handleAcceptProse = async (messageId: string) => {
        const proposal = proseProposals[messageId];
        if (!proposal) return;

        // Busy "Humanizing..." only applies to the plain-insert path (Auto Humanizer never
        // touches a rework target) — see applyProseProposal's own guard.
        const willHumanize = !proposal.target && autoHumanizerSettingsQuery.data?.enabled;
        if (willHumanize) setHumanizingMessageId(messageId);

        const result = await applyProseProposal(proposal);

        if (willHumanize) setHumanizingMessageId(null);

        if (result === "not-found") {
            toast.error(
                proposal.target
                    ? "Open the chapter you want to apply this to, then try again."
                    : "Open the chapter you want to insert into, then try again."
            );
            return; // keep the card so the user can retry after opening the chapter
        }
        if (result === "selection-changed")
            toast.warning("Your selection changed since this rework started — inserted instead of replacing; please check placement.");
        if (proposal.target) setActiveRework(null);
        dismissProseProposal(messageId);
    };

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

    // P0.4 S1 — Research's live web search must reflect THIS message's text, not whatever the
    // mount-time codexContext effect last fetched (that effect never passes a query, see below).
    // Fetched fresh here and threaded straight into generate() as extraContext rather than via
    // React state, since a setState right before calling generate() wouldn't be visible in
    // createPromptConfig's closure until the next render — see useChatMessageGeneration.ts.
    //
    // P1.3 — same pattern for WB/Editor/Outline's RAG "search"-role results, which the mount-time
    // effect seeds once from the chat's title and never refreshes as the conversation drifts topic
    // (see DECISIONS.md's "Chat Context Anchoring" entry, where this was deliberately deferred).
    // Filtered to role==="search" only — anchor/related content is already unconditional in the
    // mount-time codexContext block, so re-including it here would just duplicate it.
    //
    // Guide (includeGuide) follows the exact same "refresh per-message, not per-mount" reasoning,
    // additively across every chat type — including this in the SAME fetch as Research's web
    // search (rather than a separate call) also fixes a real bug found in testing: a stale
    // mount-time Guide excerpt sat next to a FRESH web-search block whose results were about
    // unrelated third-party tools (e.g. other AI writing apps that also use the word "lorebook"),
    // and the model blended/hallucinated citations across the two. The explicit framing below is
    // what actually stops that — not just separating the fetches.
    const computeExtraContext = async (text: string): Promise<string | undefined> => {
        const needsResearch = isResearchChat && text.trim();
        const needsCodexSearch = (isWorldBuildingChat || isEditorChat || isOutlineChat) && text.trim() && storyId;
        const needsGuide = toggles.includeGuide && text.trim();
        // B18 fix (2026-08-19) — see formatOutlineTree's own comment above and the removed
        // mount-time block: this is now the ONLY place the outline tree is sent, always rebuilt
        // fresh from this exact turn's real context, so item ids the model needs for
        // edit/reorder/delete fences are never more than one message stale.
        const needsOutlineTree = isOutlineChat && text.trim() && storyId;
        // B6 (docs/BUGS_2026-08-19.md) — same "is lorebook in scope" condition needsCodexSearch
        // uses, extended to Brainstorm (the other surface B6 reproduced on) when its own
        // includeLorebook toggle is on. Fetched fresh every turn like needsOutlineTree above,
        // not from the mount-time codexContext snapshot — same staleness class B18 already fixed
        // once for the outline tree.
        const needsCharacterRoster =
            (isWorldBuildingChat || isEditorChat || isOutlineChat || (isBrainstormChat && toggles.includeLorebook)) && text.trim() && storyId;
        if (!needsResearch && !needsCodexSearch && !needsGuide && !needsOutlineTree && !needsCharacterRoster) return undefined;

        const ctx = await chatsApi.getContext(selectedChat.id, text);
        const blocks: (string | false | undefined)[] = [];

        if (needsOutlineTree) {
            const outlineChapters = ctx.outlineTree.filter(item => item.type === "chapter");
            const scenesByChapter = new Map<string, typeof ctx.outlineTree>();
            for (const item of ctx.outlineTree) {
                if (item.type !== "scene" || !item.parentId) continue;
                scenesByChapter.set(item.parentId, [...(scenesByChapter.get(item.parentId) ?? []), item]);
            }
            const outlineTreeText = formatOutlineTree(outlineChapters, scenesByChapter);
            blocks.push(
                `[OUTLINE TREE — full story structure, current as of this message; use the id values exactly as shown when ` +
                    `proposing edits/reorders/deletes. This is the live source of truth — if something you proposed earlier in ` +
                    `this conversation (a chapter, scene, or edit) isn't listed here, the user rejected it or hasn't accepted it ` +
                    `yet; don't treat it as created, and don't describe it as "already in the tree." If the user asks you to ` +
                    `change something that already exists here, use an edit/reorder/delete fence referencing its id — never a ` +
                    `create fence. If you can't find the item's id here, say so and ask, rather than creating a replacement.]\n` +
                    `${outlineTreeText || "(empty — no chapters or scenes yet)"}`
            );
        }

        if (needsResearch) {
            const searchText = ctx.webSearchResults.map(r => `- [${r.title}](${r.url}): ${r.snippet}`).join("\n");
            const pagesText = ctx.fetchedPages.map(p => `[FETCHED PAGE: ${p.title}](${p.url})\n${p.text}`).join("\n\n");
            blocks.push(
                searchText &&
                    `[WEB SEARCH RESULTS — the public internet, not this app's own documentation]\nThese may include unrelated third-party tools that happen to use similar terms (e.g. "lorebook", "character card") — do not assume a result describes Story Labyrinth's own features unless it's clearly about Story Labyrinth specifically.\n${searchText}`
            );
            blocks.push(pagesText);
        }

        if (needsCodexSearch) {
            const searchEntries = ctx.relevantCodexEntries.filter(e => e.role === "search");
            const searchChapters = ctx.relevantChapterPassages.filter(p => p.role === "search");
            // id included for the same reason as the mount-time formatEntry above — a
            // modify_entry codex-proposal needs a real entryId to copy, not just the name.
            const entryText = searchEntries.map(e => `- ${e.name} (${e.category}, id: ${e.entryId}): ${e.excerpt}`).join("\n");
            const chapterText = searchChapters.map(p => `- ${p.title}: ${p.excerpt}`).join("\n");
            blocks.push(
                entryText && `[UPDATED CONTEXT FOR THIS MESSAGE — Codex entries relevant to what you're currently asking]\n${entryText}`
            );
            blocks.push(
                chapterText &&
                    `[UPDATED CONTEXT FOR THIS MESSAGE — chapter passages relevant to what you're currently asking]\n${chapterText}`
            );
        }

        if (needsCharacterRoster) {
            const rosterText = ctx.characterRoster.map(c => `- ${c.name}`).join("\n");
            const truncatedNote = ctx.characterRosterTruncated ? `\n(+ more not shown)` : "";
            blocks.push(
                rosterText &&
                    `[ESTABLISHED CAST — every real character-category Lorebook entry in this story; the complete list, not just what's contextually relevant right now]\nDo not invent a new named character, and do not present a name that isn't in this list as if it were already established. If you need a character who genuinely isn't here, either ask the user or clearly flag them as new (propose via a codex-proposal new_entry, or say explicitly "this is a new character") — never silently treat an unlisted name as canon. This applies just as much to minor, incidental, or one-line characters (a caller, a bystander, a voice on a recording) as to major ones — a quick walk-on doesn't exempt a name from this list. Before naming any new character, check it against every name below: never reuse an established name for a different person, and never coin a name that's a near-miss of one already on this list (a shared surname, a one-letter variant, a homophone) — that kind of near-duplicate is more confusing than an unrelated new name, since it reads as the same person until a reader checks closely.\n${rosterText}${truncatedNote}`
            );
        }

        if (needsGuide) {
            const guideText = ctx.relevantGuideSections
                .map(s => `- ${s.topicLabel}${s.subTabLabel ? ` › ${s.subTabLabel}` : ""} — ${s.heading}: ${s.excerpt}`)
                .join("\n");
            blocks.push(
                guideText &&
                    `[STORY LABYRINTH GUIDE — app usage reference, not story content]\nThe ONLY authoritative source for how Story Labyrinth's own features actually work. Never conflate this with web search results, fetched pages, or your own outside knowledge of other similar tools (SillyTavern, other AI writing/roleplay apps, etc.) even if they use similar terms — they are NOT this app. If this excerpt doesn't fully answer the question, say so rather than filling the gap from an unrelated tool.\n${guideText}`
            );
        }

        return blocks.filter(Boolean).join("\n\n") || undefined;
    };

    // B21/B14 — the composer's Send button gave zero visual feedback (not disabled, icon
    // unchanged, text uncleared) during computeExtraContext's network round-trip (context/RAG
    // search for WB/Editor/Outline/Research chats) that runs BEFORE generate() ever sets
    // isGenerating true. A real click there looked like it had done nothing, so a second click —
    // landing on this same still-"Send" button before the first click's work resolved — was the
    // natural response; without a re-entrancy guard that second click re-ran doSend concurrently
    // instead of being a no-op. isSubmittingRef guards synchronously (state alone lags a render
    // behind a same-tick second click); isSubmitting drives the composer's isGenerating prop so
    // it flips to its "Stop" rendering the instant Send is clicked, not once generate() begins.
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const doSend = async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        try {
            const extraContext = await computeExtraContext(input);
            await generate(input, extraContext);
            setInput("");
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    // Context/Token Meter (T4, M4) — soft-warn confirm only, never a hard block on the estimate
    // (design decision #7 / non-goal #2). Off by default (aiSettings.softWarnNearLimit); Local
    // only, since that's the only provider with a real n_ctx concept in v1.
    const [pendingSendConfirm, setPendingSendConfirm] = useState(false);
    const handleSubmit = async () => {
        const softWarnOn = selectedModel?.provider === "local" && aiSettings?.softWarnNearLimit;
        const threshold = aiSettings?.softWarnThreshold ?? 0.9;
        if (softWarnOn && contextEstimate.pctUsed !== null && contextEstimate.pctUsed >= threshold) {
            setPendingSendConfirm(true);
            return;
        }
        await doSend();
    };

    const handleItemSelect = (itemId: string) => {
        const item = getFilteredLorebookEntries(lorebookEntries, false).find(entry => entry.id === itemId);
        if (item) addItem(item);
    };

    return (
        <div className="flex flex-col h-full">
            {guidedSetup && !headerExpanded ? (
                <div className="p-4 pb-0">
                    <button
                        type="button"
                        onClick={() => setHeaderExpanded(true)}
                        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                        Guided setup
                    </button>
                </div>
            ) : (
            <div className="p-4 space-y-4">
                {guidedSetup && (
                    <div className="flex items-start gap-2">
                        <button
                            type="button"
                            onClick={() => setHeaderExpanded(false)}
                            className="mt-3 shrink-0 text-muted-foreground hover:text-foreground"
                            title="Collapse guided setup"
                        >
                            <ChevronUp className="h-4 w-4" />
                        </button>
                        <div className="flex-1 min-w-0">{guidedSetup}</div>
                    </div>
                )}
                {focusedOnLabel && (
                    <p className="text-xs text-muted-foreground">Focused on: {focusedOnLabel}</p>
                )}
                <ChatSystemPromptControl
                    prompt={selectedPrompt}
                    isLoading={promptLoading}
                    availableModels={availableModels}
                    selectedModel={selectedModel}
                    onSelectModel={selectModel}
                    mode={chatMode}
                    onModeChange={switchChatMode}
                />

                {activeRework && (
                    <ReworkCard packet={activeRework.packet} onClear={() => setActiveRework(null)} hostHint={reworkHostHint} />
                )}

                {/* T10 CR4 — when a host has migrated this bucket onto ChatToolsRail's own modal
                    panel (contextPanelMode="external"), that panel renders ChatContextPanelContent
                    itself; this component renders nothing here to avoid a duplicate. Every host
                    not yet migrated keeps the original inline Collapsible unchanged. */}
                {contextPanelMode !== "external" && (!isEditorChat || usesCodexTray) && (
                    <Collapsible open={contextMemoryExpanded} onOpenChange={setContextMemoryExpanded}>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                            <ChevronRight className={`h-4 w-4 transition-transform ${contextMemoryExpanded ? "rotate-90" : ""}`} />
                            Context &amp; memory
                            {!contextMemoryExpanded && toggles.armedLabels.length > 0 && (
                                <Badge variant="secondary" className="font-normal">
                                    {toggles.armedLabels.join(" · ")}
                                </Badge>
                            )}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <ChatContextPanelContent selectedChat={selectedChat} promptType={promptType} toggles={toggles} />
                        </CollapsibleContent>
                    </Collapsible>
                )}

                {/* T10-follow-up — when the host has migrated this bucket onto ChatToolsRail's own
                    "Story Context" panel (storyContextPanelMode="external"), that panel renders
                    <ContextSelector> itself; this component renders nothing here to avoid a
                    duplicate, same posture as the Context & memory Collapsible above. */}
                {showContextSelector && storyContextPanelMode !== "external" && (
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
                )}
            </div>
            )}

            <ChatMessageList
                messages={displayMessages}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                streamingMessageId={isGenerating ? "streaming" : null}
                storyId={storyId ?? ""}
                onStartEdit={handleStartEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onEditContentChange={setEditingContent}
                editingTextareaRef={editingTextareaRef}
                onDeleteMessage={setPendingDeleteMessage}
                onRegenerateMessage={handleRegenerateMessage}
                onResendMessage={handleResendMessage}
                onBranchMessage={storyId ? handleBranchMessage : undefined}
                // Manual backstop for the automatic extraction pass (useChatMessageGeneration.ts)
                // — Brainstorm assistant messages only, same gate every other Brainstorm-only
                // affordance in this file uses.
                onProposeFromReply={
                    selectedChat.chatType === "brainstorm" ? message => handleProposeFromReply(message.id, message.content) : undefined
                }
                proposingMessageId={proposingMessageId}
                // N5 — hidden entirely for Editor chats (stay canon-only) and for global chats
                // with no storyId (Research Global mode has none to save a note against; Story
                // mode gets a real storyId from ResearchTool.tsx, so this starts working there
                // with no extra gating needed, P0.4 S3).
                onSaveAsNote={!isEditorChat && storyId ? message => setNoteSourceMessage(message) : undefined}
                // P0.4 S5 — Research-only copy-friendly blocks, self-contained in ChatMessageList
                // (no callback needed, unlike onSaveAsNote which needs parent state).
                // Chat Shuttle H6 — same gate as onSaveAsNote above (Editor stays canon-only;
                // global chats with no storyId have nowhere to save a note against).
                onSaveSelectionAsNote={!isEditorChat && storyId ? handleSaveSelectionAsNote : undefined}
                onSendSelectionToNotesChat={!isEditorChat && storyId ? handleSendSelectionToNotesChat : undefined}
                renderProposalsForMessage={messageId => {
                    // Editor/World-Building/Outline chats show Codex proposals in the
                    // CodexProposalTray under the chat list instead (docs/
                    // Chat_Panel_Integrations_Design.md §2/§4 — "tray under chat list, no popup");
                    // Research/general chats keep this inline rendering.
                    const proposals = usesCodexTray ? undefined : proposalsByMessageId[messageId];
                    const proseProposal = proseProposals[messageId];
                    const noteProposal = noteProposals[messageId];
                    const outlineProposalsForMessage = outlineProposals[messageId];
                    const psychProposal = psychProposals[messageId];
                    const sexualityProposal = sexualityProposals[messageId];
                    const placeSheetProposal = placeSheetProposals[messageId];
                    const sheetProposal = sheetProposals[messageId];
                    const sheetSpanProposal = sheetSpanProposals[messageId];
                    const mapSketchProposal = mapSketchProposals[messageId];
                    const nameProposal = storyId ? nameProposals[messageId] : undefined;
                    const timelinePinProposalsForMessage = storyId ? timelinePinProposals[messageId] : undefined;
                    const overviewChecklistItem = overviewChecklistItemsByMessage[messageId];
                    const handoffChecklistItems = handoffChecklistItemsByMessage[messageId];
                    if (
                        !proposals?.length &&
                        !proseProposal &&
                        !noteProposal &&
                        !outlineProposalsForMessage?.length &&
                        !psychProposal &&
                        !sexualityProposal &&
                        !placeSheetProposal &&
                        !sheetProposal &&
                        !sheetSpanProposal &&
                        !mapSketchProposal &&
                        !nameProposal &&
                        !timelinePinProposalsForMessage?.length &&
                        !overviewChecklistItem &&
                        !handoffChecklistItems?.length
                    )
                        return null;
                    return (
                        <>
                            {proposals?.map(proposal => {
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
                            })}
                            {proseProposal && (
                                <ProseProposalCard
                                    text={proseProposal.text}
                                    replacesSelection={proseProposal.target !== null}
                                    isBusy={humanizingMessageId === messageId}
                                    onAccept={() => handleAcceptProse(messageId)}
                                    onReject={() => dismissProseProposal(messageId)}
                                />
                            )}
                            {noteProposal && (
                                <NoteProposalCard
                                    proposal={noteProposal}
                                    onAccept={() => handleAcceptNote(messageId)}
                                    onReject={() => dismissNoteProposal(messageId)}
                                />
                            )}
                            {overviewChecklistItem && (
                                <OverviewProposalCard
                                    item={overviewChecklistItem}
                                    disabled={brainstormChecklistActions.isBusy}
                                    onAccept={item => {
                                        brainstormChecklistActions.handleAcceptOverview(item);
                                        dismissOverviewChecklistItem(messageId);
                                    }}
                                />
                            )}
                            {handoffChecklistItems && handoffChecklistItems.length > 0 && (
                                <HandoffPacketCard
                                    items={handoffChecklistItems}
                                    disabled={brainstormChecklistActions.isBusy}
                                    onOpen={item => {
                                        brainstormChecklistActions.handleOpenHandoff(item);
                                        // Drop just this one item — the others in the same reply
                                        // (e.g. a WB handoff and a Notes handoff from one packet)
                                        // stay visible/actionable until opened themselves.
                                        setHandoffChecklistItemsByMessage(prev => ({
                                            ...prev,
                                            [messageId]: (prev[messageId] ?? []).filter(candidate => candidate.id !== item.id)
                                        }));
                                    }}
                                />
                            )}
                            {outlineProposalsForMessage?.map((proposal, index) => (
                                <OutlineProposalCard
                                    key={`${messageId}-${index}`}
                                    proposal={proposal}
                                    resolveItemTitle={resolveOutlineItemTitle}
                                    onAccept={() => handleAcceptOutlineProposal(messageId, index)}
                                    onReject={() => dismissOutlineProposal(messageId, index)}
                                />
                            ))}
                            {isWorldBuildingChat && psychProposal && (
                                <PsychProposalCard
                                    proposal={psychProposal}
                                    onAccept={() => handleAcceptPsych(messageId)}
                                    onReject={() => dismissPsychProposal(messageId)}
                                />
                            )}
                            {isWorldBuildingChat && sexualityProposal && (
                                <SexualityProposalCard
                                    proposal={sexualityProposal}
                                    onAccept={() => handleAcceptSexuality(messageId)}
                                    onReject={() => dismissSexualityProposal(messageId)}
                                />
                            )}
                            {isWorldBuildingChat && placeSheetProposal && (
                                <PlaceSheetProposalCard
                                    proposal={placeSheetProposal}
                                    onAccept={() => handleAcceptPlaceSheet(messageId)}
                                    onReject={() => dismissPlaceSheetProposal(messageId)}
                                />
                            )}
                            {isWorldBuildingChat && sheetProposal && (
                                <SheetProposalCard
                                    proposal={sheetProposal}
                                    onAccept={() => handleAcceptSheet(messageId)}
                                    onAcceptAndSync={() => void handleAcceptSheetAndSync(messageId)}
                                    onReject={() => dismissSheetProposal(messageId)}
                                    isSyncing={syncingSheetProposal === messageId}
                                />
                            )}
                            {isWorldBuildingChat && sheetSpanProposal && (
                                <ProseProposalCard
                                    text={sheetSpanProposal.text}
                                    replacesSelection
                                    onAccept={() => handleAcceptSheetSpan(messageId)}
                                    onReject={() => dismissSheetSpanProposal(messageId)}
                                />
                            )}
                            {isWorldBuildingChat && mapSketchProposal && (
                                <MapSketchProposalCard
                                    proposal={mapSketchProposal}
                                    onAccept={() => handleAcceptMapSketch(messageId)}
                                    onReject={() => dismissMapSketchProposal(messageId)}
                                />
                            )}
                            {nameProposal && storyId && (
                                <NameProposalCard
                                    proposal={nameProposal}
                                    storyId={storyId}
                                    anchorEntryId={selectedChat.anchorEntryId ?? undefined}
                                    anchorEntryName={
                                        selectedChat.anchorEntryId ? entryLookup.get(selectedChat.anchorEntryId)?.name : undefined
                                    }
                                />
                            )}
                            {isWorldBuildingChat && timelinePinProposalsForMessage && timelinePinProposalsForMessage.length > 0 && (
                                <TimelinePinProposalCard
                                    items={timelinePinProposalsForMessage}
                                    onAccept={item => handleAcceptTimelinePin(messageId, item)}
                                    onReject={item => dismissTimelinePinProposal(messageId, item)}
                                    onAcceptAll={() => handleAcceptAllTimelinePins(messageId)}
                                    isSubmitting={createTimelinePinMutation.isPending}
                                />
                            )}
                        </>
                    );
                }}
            />

            <NoteFormDialog
                open={noteSourceMessage !== null}
                onOpenChange={open => {
                    if (!open) setNoteSourceMessage(null);
                }}
                title="Save message as note"
                submitLabel="Save note"
                initialTitle={noteSourceMessage?.content.slice(0, 60) ?? ""}
                onSubmit={handleSaveMessageAsNote}
            />

            <NoteFormDialog
                open={selectionNoteText !== null}
                onOpenChange={open => {
                    if (!open) setSelectionNoteText(null);
                }}
                title="Save selection as note"
                submitLabel="Save note"
                initialTitle={selectionNoteText?.slice(0, 60) ?? ""}
                onSubmit={handleSubmitSelectionNote}
            />

            {showContextMeter && (
                <div className="px-3 pb-1 flex justify-end">
                    <ContextMeterChip estimate={contextEstimate} />
                </div>
            )}

            <ConfirmDialog
                open={pendingSendConfirm}
                onOpenChange={setPendingSendConfirm}
                title="Near the context limit"
                description={`This message would use an estimated ${Math.round((contextEstimate.pctUsed ?? 0) * 100)}% of the model's context window. You can send anyway — nothing is blocked.`}
                confirmLabel="Send anyway"
                onConfirm={() => {
                    setPendingSendConfirm(false);
                    doSend();
                }}
            />

            <ConfirmDialog
                open={pendingDeleteMessage !== null}
                onOpenChange={open => {
                    if (!open) setPendingDeleteMessage(null);
                }}
                title="Delete message?"
                description="This permanently removes the message from the chat. This can't be undone."
                confirmLabel="Delete"
                onConfirm={handleConfirmDelete}
            />
            <MessageInputArea
                input={input}
                isGenerating={isGenerating || isSubmitting}
                selectedPrompt={selectedPrompt}
                onInputChange={setInput}
                onSend={handleSubmit}
                onStop={abort}
                chatId={selectedChat.id}
                hasModel={!!selectedModel}
            />
        </div>
    );
}
