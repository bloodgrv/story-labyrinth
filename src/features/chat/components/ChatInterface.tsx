import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useContextMemoryExpanded } from "@/lib/useContextMemoryExpanded";
import { ChatMessageList } from "@/features/brainstorm/components/ChatMessageList";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { MessageInputArea } from "@/features/brainstorm/components/MessageInputArea";
import { useChatMessages } from "@/features/brainstorm/hooks/useChatMessages";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useAISettingsQuery } from "@/features/ai/hooks/useAISettingsQuery";
import { ContextMeterChip } from "@/features/context-meter/components/ContextMeterChip";
import { useContextEstimate } from "@/features/context-meter/hooks/useContextEstimate";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { applyChapterSelectionReplace } from "@/features/rework/adapters/chapterSelectionAdapter";
import { ReworkCard } from "@/features/rework/components/ReworkCard";
import type { InitialReworkPayload } from "@/features/rework/pendingReworkStore";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import { useCreateNoteMutation, useUpdateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import { useUpdateLorebookMutation } from "@/features/lorebook/hooks/useLorebookQuery";
import {
    useCreateOutlineItemMutation,
    useDeleteOutlineItemMutation,
    useOutlineQuery,
    useReorderOutlineMutation,
    useUpdateOutlineItemMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { brainstormApi, chatsApi, deskTransfersApi } from "@/services/api/client";
import type { ChapterSelectionTarget } from "@/types/rework";
import type { AIChat, ChatMessage, Prompt, PromptParserConfig } from "@/types/story";
import type { ChatContext } from "@/types/worldbuilding";
import { ChatSystemPromptControl } from "./ChatSystemPromptControl";
import { NameProposalCard } from "./NameProposalCard";
import { NoteProposalCard } from "./NoteProposalCard";
import { OutlineProposalCard } from "./OutlineProposalCard";
import { ProposalCard } from "./ProposalCard";
import { ProseProposalCard } from "./ProseProposalCard";
import { PsychProposalCard } from "./PsychProposalCard";
import { PlaceSheetProposalCard } from "./PlaceSheetProposalCard";
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
import type { PlaceState } from "@/types/story";

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
    guidedSetup
}: ChatInterfaceProps) {
    const [input, setInput] = useState("");
    // Only meaningful when `guidedSetup` is provided — resets to expanded on remount (chat
    // switch), same as GuidedSetupControl's own collapse used to before it moved here.
    const [headerExpanded, setHeaderExpanded] = useState(true);
    const queryClient = useQueryClient();
    // Editor chats rely entirely on the auto-pulled codexContext (chapter passages + Codex
    // entries, fetched below) instead of the manual chapter-summary/lorebook checkboxes —
    // see chatContextService.ts and DECISIONS.md's chat-context notes.
    const isEditorChat = promptType === "editor";
    // Outline diverges from Editor on some axes (still shows the Notes/Memory toggles, still uses
    // the Codex tray) but agrees on others (no manual context selector, no manual full-context
    // toggles — both get an always-on structured context pack from chatContextService.ts instead).
    // See docs/Chat_Panel_Integrations_Design.md §4 (P0.4 R5).
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
    const showContextSelector = !isEditorChat && !isOutlineChat && !isBrainstormChat && !isResearchChat && !isNotesChat;
    const forceStructuredContextOff = isEditorChat || isOutlineChat || isBrainstormChat || isResearchChat || isNotesChat;
    const usesCodexTray = isEditorChat || promptType === "worldbuilding" || isOutlineChat;

    const { entries: lorebookEntries } = useLorebookContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId ?? "");
    const { currentChapterId, setPendingChatComposerSeed, setCurrentTool, setPendingShuttleSeed } = useStoryContext();

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

    // Notes/Outline bridge chat-level gate (docs/Notes_Outline_Chat_Bridges_Design.md) — mirrors
    // the lastUsedModelId pattern above (local state, persisted via chatsApi.update). Local state
    // only updates after the PATCH resolves so the codexContext refetch effect below (which
    // depends on these) always sees the value the server actually has.
    const [includeNotes, setIncludeNotes] = useState(selectedChat.includeNotes);
    const [includeOutline, setIncludeOutline] = useState(selectedChat.includeOutline);
    // Project Memory chat-level gate (C1, Agent_Framework_And_Project_Memory_Design.md §4.5) —
    // same local-state-persisted-after-PATCH pattern as includeNotes/includeOutline above.
    const [includeMemory, setIncludeMemory] = useState(selectedChat.includeMemory);
    // Brainstorm-only opt-in gates (P0.4 B0-B4) — same local-state-persisted-after-PATCH pattern.
    // Lorebook search is ON by default for every other chat type; Brainstorm is the one exception
    // (see chatContextService.ts's entityTypes computation).
    const [includeLorebook, setIncludeLorebook] = useState(selectedChat.includeLorebook);
    const [includeChapterSummaries, setIncludeChapterSummaries] = useState(selectedChat.includeChapterSummaries);
    // P0.4 R6 — auto-insert/auto-accept toggles (docs/Chat_Panel_Integrations_Design.md doctrine
    // "no silent canon unless an explicit toggle is ON"). Same local-state-persisted-after-PATCH
    // pattern as the toggles above. autoInsertProse only rendered/used for Editor; autoAcceptOutline
    // only rendered/used for Outline; autoAcceptCodex applies to Editor/WB/Outline (usesCodexTray).
    const [autoInsertProse, setAutoInsertProse] = useState(selectedChat.autoInsertProse);
    const [autoAcceptCodex, setAutoAcceptCodex] = useState(selectedChat.autoAcceptCodex);
    const [autoAcceptOutline, setAutoAcceptOutline] = useState(selectedChat.autoAcceptOutline);
    // P0.4 S1 — Research-only off-switch for live web search, defaults true server-side (see
    // schema.ts's webSearchEnabled comment). Same local-state-persisted-after-PATCH pattern.
    const [webSearchEnabled, setWebSearchEnabled] = useState(selectedChat.webSearchEnabled);
    // Chat Shuttle H7 — Editor/Outline/WB-only "always-shuttle" pref, same local-state-persisted-
    // after-PATCH pattern as autoAcceptCodex above. Default false (schema.ts).
    const [autoShuttle, setAutoShuttle] = useState(selectedChat.autoShuttle);
    const usesShuttle = isEditorChat || isWorldBuildingChat || isOutlineChat;

    const toggleIncludeNotes = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeNotes: value }).then(() => setIncludeNotes(value));
    const toggleIncludeOutline = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeOutline: value }).then(() => setIncludeOutline(value));
    const toggleIncludeMemory = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeMemory: value }).then(() => setIncludeMemory(value));
    const toggleIncludeLorebook = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeLorebook: value }).then(() => setIncludeLorebook(value));
    const toggleIncludeChapterSummaries = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeChapterSummaries: value }).then(() => setIncludeChapterSummaries(value));
    const toggleAutoInsertProse = (value: boolean) =>
        chatsApi.update(selectedChat.id, { autoInsertProse: value }).then(() => setAutoInsertProse(value));
    const toggleAutoAcceptCodex = (value: boolean) =>
        chatsApi.update(selectedChat.id, { autoAcceptCodex: value }).then(() => setAutoAcceptCodex(value));
    const toggleAutoAcceptOutline = (value: boolean) =>
        chatsApi.update(selectedChat.id, { autoAcceptOutline: value }).then(() => setAutoAcceptOutline(value));
    const toggleWebSearchEnabled = (value: boolean) =>
        chatsApi.update(selectedChat.id, { webSearchEnabled: value }).then(() => setWebSearchEnabled(value));
    const toggleAutoShuttle = (value: boolean) =>
        chatsApi.update(selectedChat.id, { autoShuttle: value }).then(() => setAutoShuttle(value));

    // Chat chrome density (CC0) — collapsed-by-default "Context & memory" disclosure wrapping the
    // two toggle groups below; armed-only summary chips (C3) mirror each group's own render
    // conditions exactly, so a toggle only ever shows up here if it's actually rendered there too.
    const [contextMemoryExpanded, setContextMemoryExpanded] = useContextMemoryExpanded();
    const armedContextLabels = [
        !isNotesChat && includeNotes && "Notes",
        !isOutlineChat && !isResearchChat && includeOutline && "Outline",
        !isResearchChat && !isNotesChat && includeMemory && "Memory",
        (isBrainstormChat || isResearchChat || isNotesChat) && includeLorebook && "Lorebook",
        isResearchChat && webSearchEnabled && "Web search",
        isBrainstormChat && includeChapterSummaries && "Chapter summaries",
        usesCodexTray && isEditorChat && autoInsertProse && "Auto-insert prose",
        usesCodexTray && autoAcceptCodex && "Auto-accept Codex",
        usesCodexTray && isOutlineChat && autoAcceptOutline && "Auto-accept outline",
        usesCodexTray && usesShuttle && autoShuttle && "Auto-shuttle"
    ].filter((label): label is string => typeof label === "string");

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

            // Outline chat's own always-on structured reads (P0.4 R5) — only ever non-empty for
            // chatType="outline" (chatContextService.ts only populates these two for that type).
            // Reconstructs chapter/scene nesting from the flat outlineTree array so the model sees
            // real structure, not just a flat list; itemIds are called out explicitly since
            // outline-proposal edit/reorder/delete fences need to reference them exactly.
            const outlineChapters = context.outlineTree.filter(item => item.type === "chapter");
            const scenesByChapter = new Map<string, typeof context.outlineTree>();
            for (const item of context.outlineTree) {
                if (item.type !== "scene" || !item.parentId) continue;
                scenesByChapter.set(item.parentId, [...(scenesByChapter.get(item.parentId) ?? []), item]);
            }
            const outlineTreeText = outlineChapters
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
            const playbookPackText = [context.playbookPack.concrete, context.playbookPack.psych]
                .filter((p): p is NonNullable<typeof p> => p !== null)
                .map(formatPack)
                .join("\n\n");

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
                outlineTreeText &&
                    `[OUTLINE TREE — full story structure; use the id values exactly as shown when proposing edits/reorders/deletes]\n${outlineTreeText}`,
                writtenChaptersText && `[WRITTEN CHAPTERS — titles and summaries only, no full prose]\n${writtenChaptersText}`,
                chapterSummariesText && `[WRITTEN CHAPTERS — titles and summaries only, no full prose]\n${chapterSummariesText}`,
                setupSlotsText && `[PROJECT SETUP CHECKLIST — use slotKey exactly as shown when a proposal addresses one]\n${setupSlotsText}`,
                handoffStatusText && `[YOUR OWN PENDING PROPOSALS/HANDOFFS]\n${handoffStatusText}`,
                allNotesText && `[ALL STORY NOTES — titles/types only; use the id values exactly as shown if referencing one]\n${allNotesText}`,
                focusedNoteText && `[FOCUSED NOTE — currently open in the Notes tool, treat as current]\n${focusedNoteText}`,
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
        includeNotes,
        includeOutline,
        includeMemory,
        includeLorebook,
        includeChapterSummaries,
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
        // Character Guided Playbook Packs (Hybrid D) — same B5 bug class fixed once already for
        // style/psych above: this must be in the deps too, or toggling arm after the chat was
        // first selected would leave the next message's context silently stale.
        selectedChat.usePlaybookPack
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

    // N6 (Notes_Outline_Chat_Bridges_Design.md §4) — same ephemeral-state posture as
    // proseProposals above; only ever populated for non-Editor chats since
    // chatContextService.ts's NOTE_PROPOSAL_INSTRUCTIONS is never included in the Editor system
    // prompt, so the model has no reason to emit the fence there anyway.
    const [noteProposals, setNoteProposals] = useState<Record<string, ParsedNoteProposal>>({});
    const createNoteMutation = useCreateNoteMutation();
    const updateNoteMutation = useUpdateNoteMutation();

    // P0.4 B5 — Character template's opt-in psych module. Same ephemeral-state posture as
    // noteProposals above; only ever populated for WB chats since chatContextService.ts's
    // PSYCH_MODULE_INSTRUCTIONS is only ever included in the WB system prompt.
    const [psychProposals, setPsychProposals] = useState<Record<string, ParsedPsychProposal>>({});
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

    // NG6 — same ephemeral-state posture as psychProposals above. No accept/reject dismissal to
    // track: NameProposalCard itself runs the real generate call and owns its own results state.
    const [nameProposals, setNameProposals] = useState<Record<string, ParsedNameProposal>>({});

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

    // P0.4 R6 — shared "apply" core for both the manual Accept button (handleAcceptProse below)
    // and the auto-insert path (onProseProposal callback below), so the two never drift. Pure
    // side-effecting apply, no proseProposals/dismiss bookkeeping — callers own that.
    const applyProseProposal = (proposal: { text: string; target: ChapterSelectionTarget | null }): "applied" | "not-found" | "selection-changed" => {
        if (proposal.target) {
            const result = applyChapterSelectionReplace(proposal.target, proposal.text);
            return result === "replaced" ? "applied" : result;
        }
        const editor = currentChapterId ? getActiveChapterEditor(currentChapterId) : null;
        if (!editor) return "not-found";
        insertProposedProse(editor, proposal.text);
        return "applied";
    };

    const { generate, isGenerating, abort, streamingContent } = useChatMessageGeneration({
        selectedChat,
        selectedPrompt,
        selectedModel,
        onChatUpdate,
        createPromptConfig,
        autoAcceptCodex,
        onUsage: usage => setLastUsage(usage ?? null),
        onProseProposal: enableProseProposals
            ? (messageId, proposal) => {
                  // Only chapter-selection rework turns produce a prose-proposal Accept path —
                  // Lorebook/Outline rework replies via codex-proposal/outline-proposal instead
                  // (see reworkContext below), so a non-chapter-selection activeRework never
                  // carries a target here.
                  const target = activeRework && activeRework.target.kind === "chapter-selection" ? activeRework.target : null;
                  const record = { text: proposal, target };
                  if (autoInsertProse) {
                      const result = applyProseProposal(record);
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
            for (const proposal of proposals) {
                if (proposal.type === "create") {
                    // Same "persist immediately as a row" convention the retired bulk-Generate
                    // button used. Normally lands "pending" — appears instantly in the tree with
                    // the existing "AI Suggested" badge + Accept/Reject controls
                    // (OutlineChapterCard.tsx/OutlineSceneRow.tsx). When autoAcceptOutline is on,
                    // land it "confirmed" directly instead — same end state as an instant manual
                    // accept, skipping the badge entirely (P0.4 R6). `order: Date.now()` keeps
                    // successive AI creates in the order the model proposed them, appended after
                    // any existing items; the user can drag-reorder freely after accepting.
                    createOutlineItemMutation.mutate({
                        storyId,
                        parentId: proposal.parentId,
                        type: proposal.itemType,
                        title: proposal.title,
                        summary: proposal.summary,
                        wordCountTarget: proposal.wordCountTarget,
                        order: Date.now(),
                        source: "ai_suggested",
                        status: autoAcceptOutline ? "confirmed" : "pending",
                        chapterId: null
                    });
                    continue;
                }
                // P0.4 R6 — edit/reorder auto-accept immediately when the toggle is on, calling the
                // same mutations handleAcceptOutlineProposal below uses manually. delete is
                // deliberately excluded (docs/Chat_Panel_Integrations_Design.md §4: only create/
                // edit/reorder get the toggle) — always falls through to the ephemeral card.
                if (autoAcceptOutline && proposal.type !== "delete") {
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
        // query is all this component needs to do after the POST resolves.
        onOverviewProposal: (messageId, proposal) => {
            if (!storyId) return;
            brainstormApi
                .createChecklistItem({ chatId: selectedChat.id, storyId, kind: "overview_proposal", payload: proposal, sourceMessageId: messageId })
                .then(item => {
                    queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] });
                    // Transfer Log (T1) — only the "note" sub-type crosses a desk boundary (a new
                    // Note gets created); synopsis/memory write directly into story fields/Project
                    // Memory, neither of which is a "desk" in the design doc's sense, so they're
                    // deliberately not logged here. Also skip if this chat IS already Notes (Notes'
                    // own NotesChecklistTray.tsx never actually offers "note" via its own prompt
                    // instructions, but the parser is shared/defensive) — same-desk, not a transfer.
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
        onHandoffPackets: (messageId, packets) => {
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
                            // Transfer Log (T1) — one row per packet, logged the moment it's
                            // offered (the tray's later Open is the 'opened' event — see
                            // BrainstormChecklistTray.tsx/NotesChecklistTray.tsx's handleOpenHandoff).
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
            ).then(() => queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", selectedChat.id] }));
        },
        onPsychProposal: (messageId, proposal) => setPsychProposals(prev => ({ ...prev, [messageId]: proposal })),
        onPlaceSheetProposal: (messageId, proposal) => setPlaceSheetProposals(prev => ({ ...prev, [messageId]: proposal })),
        onNameProposal: (messageId, proposal) => setNameProposals(prev => ({ ...prev, [messageId]: proposal })),
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
                    if (!autoShuttle) return;
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
    const persistMessages = async (messages: ChatMessage[]) => {
        const updated = await chatsApi.update(selectedChat.id, { messages });
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

    const handleAcceptProse = (messageId: string) => {
        const proposal = proseProposals[messageId];
        if (!proposal) return;

        const result = applyProseProposal(proposal);
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
    const computeExtraContext = async (text: string): Promise<string | undefined> => {
        if (isResearchChat && text.trim()) {
            const ctx = await chatsApi.getContext(selectedChat.id, text);
            const searchText = ctx.webSearchResults.map(r => `- [${r.title}](${r.url}): ${r.snippet}`).join("\n");
            const pagesText = ctx.fetchedPages.map(p => `[FETCHED PAGE: ${p.title}](${p.url})\n${p.text}`).join("\n\n");
            return [searchText && `[WEB SEARCH RESULTS]\n${searchText}`, pagesText].filter(Boolean).join("\n\n") || undefined;
        }
        if ((isWorldBuildingChat || isEditorChat || isOutlineChat) && text.trim() && storyId) {
            const ctx = await chatsApi.getContext(selectedChat.id, text);
            const searchEntries = ctx.relevantCodexEntries.filter(e => e.role === "search");
            const searchChapters = ctx.relevantChapterPassages.filter(p => p.role === "search");
            // id included for the same reason as the mount-time formatEntry above — a
            // modify_entry codex-proposal needs a real entryId to copy, not just the name.
            const entryText = searchEntries.map(e => `- ${e.name} (${e.category}, id: ${e.entryId}): ${e.excerpt}`).join("\n");
            const chapterText = searchChapters.map(p => `- ${p.title}: ${p.excerpt}`).join("\n");
            return (
                [
                    entryText && `[UPDATED CONTEXT FOR THIS MESSAGE — Codex entries relevant to what you're currently asking]\n${entryText}`,
                    chapterText &&
                        `[UPDATED CONTEXT FOR THIS MESSAGE — chapter passages relevant to what you're currently asking]\n${chapterText}`
                ]
                    .filter(Boolean)
                    .join("\n\n") || undefined
            );
        }
        return undefined;
    };

    const doSend = async () => {
        const extraContext = await computeExtraContext(input);
        await generate(input, extraContext);
        setInput("");
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

                {(!isEditorChat || usesCodexTray) && (
                    <Collapsible open={contextMemoryExpanded} onOpenChange={setContextMemoryExpanded}>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                            <ChevronRight className={`h-4 w-4 transition-transform ${contextMemoryExpanded ? "rotate-90" : ""}`} />
                            Context &amp; memory
                            {!contextMemoryExpanded && armedContextLabels.length > 0 && (
                                <Badge variant="secondary" className="font-normal">
                                    {armedContextLabels.join(" · ")}
                                </Badge>
                            )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-3">
                {!isEditorChat && (
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                        {/* Include Notes (the bridge toggle) is meaningless for the Notes chat itself — it
                            already gets privileged always-on reads (allNotes/focusedNote) instead. */}
                        {!isNotesChat && (
                            <div className="flex items-center gap-2">
                                <Switch id={`${selectedChat.id}-include-notes`} checked={includeNotes} onCheckedChange={toggleIncludeNotes} />
                                <Label htmlFor={`${selectedChat.id}-include-notes`} className="text-sm font-normal">
                                    Include Notes (working material, not canon)
                                </Label>
                            </div>
                        )}
                        {!isOutlineChat && !isResearchChat && (
                            <div className="flex items-center gap-2">
                                <Switch id={`${selectedChat.id}-include-outline`} checked={includeOutline} onCheckedChange={toggleIncludeOutline} />
                                <Label htmlFor={`${selectedChat.id}-include-outline`} className="text-sm font-normal">
                                    Include Outline (planning intent, not canon)
                                </Label>
                            </div>
                        )}
                        {!isResearchChat && !isNotesChat && (
                            <div className="flex items-center gap-2">
                                <Switch id={`${selectedChat.id}-include-memory`} checked={includeMemory} onCheckedChange={toggleIncludeMemory} />
                                <Label htmlFor={`${selectedChat.id}-include-memory`} className="text-sm font-normal">
                                    Include Project Memory (approved facts)
                                </Label>
                            </div>
                        )}
                        {/* Lorebook is Brainstorm/Research/Notes-only opt-in — every other chat type's
                            lorebook search stays always-on (see chatContextService.ts's entityTypes computation). */}
                        {(isBrainstormChat || isResearchChat || isNotesChat) && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-include-lorebook`}
                                    checked={includeLorebook}
                                    onCheckedChange={toggleIncludeLorebook}
                                />
                                <Label htmlFor={`${selectedChat.id}-include-lorebook`} className="text-sm font-normal">
                                    Include Lorebook
                                </Label>
                            </div>
                        )}
                        {isResearchChat && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-web-search`}
                                    checked={webSearchEnabled}
                                    onCheckedChange={toggleWebSearchEnabled}
                                />
                                <Label htmlFor={`${selectedChat.id}-web-search`} className="text-sm font-normal">
                                    Web search
                                </Label>
                            </div>
                        )}
                        {isBrainstormChat && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-include-chapter-summaries`}
                                    checked={includeChapterSummaries}
                                    onCheckedChange={toggleIncludeChapterSummaries}
                                />
                                <Label htmlFor={`${selectedChat.id}-include-chapter-summaries`} className="text-sm font-normal">
                                    Include Chapter Summaries
                                </Label>
                            </div>
                        )}
                    </div>
                )}

                {usesCodexTray && (
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                        {isEditorChat && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-auto-insert-prose`}
                                    checked={autoInsertProse}
                                    onCheckedChange={toggleAutoInsertProse}
                                />
                                <Label htmlFor={`${selectedChat.id}-auto-insert-prose`} className="text-sm font-normal">
                                    Auto-insert prose (skip review)
                                </Label>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-auto-accept-codex`}
                                checked={autoAcceptCodex}
                                onCheckedChange={toggleAutoAcceptCodex}
                            />
                            <Label htmlFor={`${selectedChat.id}-auto-accept-codex`} className="text-sm font-normal">
                                Auto-accept Codex changes
                            </Label>
                        </div>
                        {isOutlineChat && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-auto-accept-outline`}
                                    checked={autoAcceptOutline}
                                    onCheckedChange={toggleAutoAcceptOutline}
                                />
                                <Label htmlFor={`${selectedChat.id}-auto-accept-outline`} className="text-sm font-normal">
                                    Auto-accept outline changes (not delete)
                                </Label>
                            </div>
                        )}
                        {usesShuttle && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`${selectedChat.id}-auto-shuttle`}
                                    checked={autoShuttle}
                                    onCheckedChange={toggleAutoShuttle}
                                />
                                <Label htmlFor={`${selectedChat.id}-auto-shuttle`} className="text-sm font-normal">
                                    Always-shuttle high-confidence lookups
                                </Label>
                            </div>
                        )}
                    </div>
                )}
                        </CollapsibleContent>
                    </Collapsible>
                )}

                {showContextSelector && (
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
                    const placeSheetProposal = placeSheetProposals[messageId];
                    const nameProposal = storyId ? nameProposals[messageId] : undefined;
                    if (
                        !proposals?.length &&
                        !proseProposal &&
                        !noteProposal &&
                        !outlineProposalsForMessage?.length &&
                        !psychProposal &&
                        !placeSheetProposal &&
                        !nameProposal
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
                            {isWorldBuildingChat && placeSheetProposal && (
                                <PlaceSheetProposalCard
                                    proposal={placeSheetProposal}
                                    onAccept={() => handleAcceptPlaceSheet(messageId)}
                                    onReject={() => dismissPlaceSheetProposal(messageId)}
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
                isGenerating={isGenerating}
                selectedPrompt={selectedPrompt}
                onInputChange={setInput}
                onSend={handleSubmit}
                onStop={abort}
            />
        </div>
    );
}
