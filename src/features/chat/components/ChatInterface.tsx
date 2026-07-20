import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChatMessageList } from "@/features/brainstorm/components/ChatMessageList";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { MessageInputArea } from "@/features/brainstorm/components/MessageInputArea";
import { useChatMessages } from "@/features/brainstorm/hooks/useChatMessages";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { applyChapterSelectionReplace } from "@/features/rework/adapters/chapterSelectionAdapter";
import { ReworkCard } from "@/features/rework/components/ReworkCard";
import type { InitialReworkPayload } from "@/features/rework/pendingReworkStore";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import {
    useCreateOutlineItemMutation,
    useDeleteOutlineItemMutation,
    useOutlineQuery,
    useReorderOutlineMutation,
    useUpdateOutlineItemMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { chatsApi } from "@/services/api/client";
import type { ChapterSelectionTarget } from "@/types/rework";
import type { AIChat, ChatMessage, Prompt, PromptParserConfig } from "@/types/story";
import { ChatSystemPromptControl } from "./ChatSystemPromptControl";
import { NoteProposalCard } from "./NoteProposalCard";
import { OutlineProposalCard } from "./OutlineProposalCard";
import { ProposalCard } from "./ProposalCard";
import { ProseProposalCard } from "./ProseProposalCard";
import { useChatMessageGeneration } from "../hooks/useChatMessageGeneration";
import { useChatSystemPrompt } from "../hooks/useChatSystemPrompt";
import { groupProposalsByMessage, useChatProposalsQuery } from "../hooks/useCodexProposalsQuery";
import { insertProposedProse } from "../services/insertProposedProse";
import type { ParsedLoreSuggestion } from "../services/parseLoreSuggestions";
import type { ParsedNoteProposal } from "../services/parseNoteProposals";
import type {
    ParsedOutlineDeleteProposal,
    ParsedOutlineEditProposal,
    ParsedOutlineReorderProposal
} from "../services/parseOutlineProposals";

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
    initialRework = null
}: ChatInterfaceProps) {
    const [input, setInput] = useState("");
    // Editor chats rely entirely on the auto-pulled codexContext (chapter passages + Codex
    // entries, fetched below) instead of the manual chapter-summary/lorebook checkboxes —
    // see chatContextService.ts and DECISIONS.md's chat-context notes.
    const isEditorChat = promptType === "editor";
    // Outline diverges from Editor on some axes (still shows the Notes/Memory toggles, still uses
    // the Codex tray) but agrees on others (no manual context selector, no manual full-context
    // toggles — both get an always-on structured context pack from chatContextService.ts instead).
    // See docs/Chat_Panel_Integrations_Design.md §4 (P0.4 R5).
    const isOutlineChat = promptType === "outline";
    const showContextSelector = !isEditorChat && !isOutlineChat;
    const forceStructuredContextOff = isEditorChat || isOutlineChat;
    const usesCodexTray = isEditorChat || promptType === "worldbuilding" || isOutlineChat;

    const { entries: lorebookEntries } = useLorebookContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId ?? "");
    const { currentChapterId } = useStoryContext();

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

    const {
        prompt: selectedPrompt,
        isLoading: promptLoading,
        availableModels,
        selectedModel,
        selectModel
    } = useChatSystemPrompt(promptType, selectedChat.lastUsedModelId, modelId =>
        chatsApi.update(selectedChat.id, { lastUsedModelId: modelId })
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

    // Notes/Outline bridge chat-level gate (docs/Notes_Outline_Chat_Bridges_Design.md) — mirrors
    // the lastUsedModelId pattern above (local state, persisted via chatsApi.update). Local state
    // only updates after the PATCH resolves so the codexContext refetch effect below (which
    // depends on these) always sees the value the server actually has.
    const [includeNotes, setIncludeNotes] = useState(selectedChat.includeNotes);
    const [includeOutline, setIncludeOutline] = useState(selectedChat.includeOutline);
    // Project Memory chat-level gate (C1, Agent_Framework_And_Project_Memory_Design.md §4.5) —
    // same local-state-persisted-after-PATCH pattern as includeNotes/includeOutline above.
    const [includeMemory, setIncludeMemory] = useState(selectedChat.includeMemory);

    const toggleIncludeNotes = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeNotes: value }).then(() => setIncludeNotes(value));
    const toggleIncludeOutline = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeOutline: value }).then(() => setIncludeOutline(value));
    const toggleIncludeMemory = (value: boolean) =>
        chatsApi.update(selectedChat.id, { includeMemory: value }).then(() => setIncludeMemory(value));

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
    useEffect(() => {
        let cancelled = false;
        chatsApi.getContext(selectedChat.id).then(context => {
            if (cancelled) return;

            const anchorEntries = context.relevantCodexEntries.filter(e => e.role === "anchor");
            const relatedEntries = context.relevantCodexEntries.filter(e => e.role === "related");
            const searchEntries = context.relevantCodexEntries.filter(e => e.role === "search");
            const formatEntry = (e: (typeof context.relevantCodexEntries)[number]) => `- ${e.name} (${e.category}): ${e.excerpt}`;

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
            const memoriesText = context.relevantMemories.map(m => `- ${m.title} (${m.category}): ${m.excerpt}`).join("\n");

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
                writtenChaptersText && `[WRITTEN CHAPTERS — titles and summaries only, no full prose]\n${writtenChaptersText}`
            ].filter(Boolean);
            setCodexContext(sections.join("\n\n"));
            setFocusedOnLabel(anchorEntries[0]?.name ?? (anchorChapters[0] ? `Chapter: ${anchorChapters[0].title}` : null));
        });
        return () => {
            cancelled = true;
        };
    }, [selectedChat.id, includeNotes, includeOutline, includeMemory]);

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
            default:
                return undefined;
        }
    }, [activeRework]);

    const createPromptConfig = useCallback(
        (prompt: Prompt): PromptParserConfig => ({
            promptId: prompt.id,
            storyId: storyId ?? "",
            scenebeat: input.trim(),
            additionalContext: {
                codexContext: [codexContext, reworkContext].filter(Boolean).join("\n\n"),
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

    const { generate, isGenerating, abort, streamingContent } = useChatMessageGeneration({
        selectedChat,
        selectedPrompt,
        selectedModel,
        onChatUpdate,
        createPromptConfig,
        onProseProposal: enableProseProposals
            ? (messageId, proposal) =>
                  setProseProposals(prev => ({
                      ...prev,
                      [messageId]: {
                          text: proposal,
                          // Only chapter-selection rework turns produce a prose-proposal Accept
                          // path — Lorebook/Outline rework replies via codex-proposal/outline-
                          // proposal instead (see reworkContext below), so a non-chapter-selection
                          // activeRework never carries a target here.
                          target: activeRework && activeRework.target.kind === "chapter-selection" ? activeRework.target : null
                      }
                  }))
            : undefined,
        onNoteProposal: (messageId, proposal) => setNoteProposals(prev => ({ ...prev, [messageId]: proposal })),
        onOutlineProposals: (messageId, proposals) => {
            if (!storyId) return;
            const rest: NonCreateOutlineProposal[] = [];
            for (const proposal of proposals) {
                if (proposal.type !== "create") {
                    rest.push(proposal);
                    continue;
                }
                // Same "persist immediately as a pending row" convention the retired bulk-Generate
                // button used — appears instantly in the tree with the existing "AI Suggested"
                // badge + Accept/Reject controls (OutlineChapterCard.tsx/OutlineSceneRow.tsx), no
                // card needed here. `order: Date.now()` keeps successive AI creates in the order
                // the model proposed them, appended after any existing items; the user can drag-
                // reorder freely after accepting.
                createOutlineItemMutation.mutate({
                    storyId,
                    parentId: proposal.parentId,
                    type: proposal.itemType,
                    title: proposal.title,
                    summary: proposal.summary,
                    wordCountTarget: proposal.wordCountTarget,
                    order: Date.now(),
                    source: "ai_suggested",
                    status: "pending",
                    chapterId: null
                });
            }
            if (rest.length > 0) setOutlineProposals(prev => ({ ...prev, [messageId]: rest }));
        },
        onLoreSuggestions: (_messageId, suggestions) => onLoreSuggestions?.(suggestions)
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

    const handleAcceptNote = (messageId: string) => {
        const proposal = noteProposals[messageId];
        if (!proposal || !storyId) return;
        createNoteMutation.mutate({ storyId, title: proposal.title, content: proposal.content, type: proposal.type });
        dismissNoteProposal(messageId);
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

    const dismissProseProposal = (messageId: string) =>
        setProseProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    const handleAcceptProse = (messageId: string) => {
        const proposal = proseProposals[messageId];
        if (!proposal) return;

        if (proposal.target) {
            const result = applyChapterSelectionReplace(proposal.target, proposal.text);
            if (result === "not-found") {
                toast.error("Open the chapter you want to apply this to, then try again.");
                return; // keep the card so the user can retry after opening the chapter
            }
            if (result === "selection-changed")
                toast.warning("Your selection changed since this rework started — inserted instead of replacing; please check placement.");
            setActiveRework(null);
            dismissProseProposal(messageId);
            return;
        }

        const editor = currentChapterId ? getActiveChapterEditor(currentChapterId) : null;
        if (!editor) {
            toast.error("Open the chapter you want to insert into, then try again.");
            return;
        }
        insertProposedProse(editor, proposal.text);
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
                {focusedOnLabel && (
                    <p className="text-xs text-muted-foreground">Focused on: {focusedOnLabel}</p>
                )}
                <ChatSystemPromptControl
                    prompt={selectedPrompt}
                    isLoading={promptLoading}
                    availableModels={availableModels}
                    selectedModel={selectedModel}
                    onSelectModel={selectModel}
                />

                {activeRework && (
                    <ReworkCard packet={activeRework.packet} onClear={() => setActiveRework(null)} hostHint={reworkHostHint} />
                )}

                {!isEditorChat && (
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                            <Switch id={`${selectedChat.id}-include-notes`} checked={includeNotes} onCheckedChange={toggleIncludeNotes} />
                            <Label htmlFor={`${selectedChat.id}-include-notes`} className="text-sm font-normal">
                                Include Notes (working material, not canon)
                            </Label>
                        </div>
                        {!isOutlineChat && (
                            <div className="flex items-center gap-2">
                                <Switch id={`${selectedChat.id}-include-outline`} checked={includeOutline} onCheckedChange={toggleIncludeOutline} />
                                <Label htmlFor={`${selectedChat.id}-include-outline`} className="text-sm font-normal">
                                    Include Outline (planning intent, not canon)
                                </Label>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Switch id={`${selectedChat.id}-include-memory`} checked={includeMemory} onCheckedChange={toggleIncludeMemory} />
                            <Label htmlFor={`${selectedChat.id}-include-memory`} className="text-sm font-normal">
                                Include Project Memory (approved facts)
                            </Label>
                        </div>
                    </div>
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
                // N5 — hidden entirely for Editor chats (stay canon-only) and for global chats
                // with no storyId (Research has none to save a note against).
                onSaveAsNote={!isEditorChat && storyId ? message => setNoteSourceMessage(message) : undefined}
                renderProposalsForMessage={messageId => {
                    // Editor/World-Building/Outline chats show Codex proposals in the
                    // CodexProposalTray under the chat list instead (docs/
                    // Chat_Panel_Integrations_Design.md §2/§4 — "tray under chat list, no popup");
                    // Research/general chats keep this inline rendering.
                    const proposals = usesCodexTray ? undefined : proposalsByMessageId[messageId];
                    const proseProposal = proseProposals[messageId];
                    const noteProposal = noteProposals[messageId];
                    const outlineProposalsForMessage = outlineProposals[messageId];
                    if (!proposals?.length && !proseProposal && !noteProposal && !outlineProposalsForMessage?.length) return null;
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
