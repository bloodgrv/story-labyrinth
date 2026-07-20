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
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import { chatsApi } from "@/services/api/client";
import type { AIChat, Prompt, PromptParserConfig } from "@/types/story";
import { ChatSystemPromptControl } from "./ChatSystemPromptControl";
import { ProposalCard } from "./ProposalCard";
import { ProseProposalCard } from "./ProseProposalCard";
import { useChatMessageGeneration } from "../hooks/useChatMessageGeneration";
import { useChatSystemPrompt } from "../hooks/useChatSystemPrompt";
import { groupProposalsByMessage, useChatProposalsQuery } from "../hooks/useCodexProposalsQuery";
import { insertProposedProse } from "../services/insertProposedProse";

interface ChatInterfaceProps {
    // Absent for global chats (Research) — chapter/lorebook context selection is simply
    // unavailable there (no single story to scope it to), not an error state.
    storyId?: string;
    promptType: Prompt["promptType"];
    selectedChat: AIChat;
    onChatUpdate: (chat: AIChat) => void;
    // Editor and Outline share the same chatType="editor" chats (see EditorChatRail.tsx), but
    // Outline items are structured data, not prose — there's no chapter editor to insert into
    // there. Defaults to true (the Editor tool's own usage); Outline's rail passes false so a
    // ```prose-proposal reply is still parsed/stripped from the visible text but never rendered
    // as an actionable card.
    enableProseProposals?: boolean;
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
    enableProseProposals = true
}: ChatInterfaceProps) {
    const [input, setInput] = useState("");
    // Editor chats rely entirely on the auto-pulled codexContext (chapter passages + Codex
    // entries, fetched below) instead of the manual chapter-summary/lorebook checkboxes —
    // see chatContextService.ts and DECISIONS.md's chat-context notes.
    const isEditorChat = promptType === "editor";

    const { entries: lorebookEntries } = useLorebookContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId ?? "");
    const { currentChapterId } = useStoryContext();

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
                    `[PROJECT MEMORY — approved facts]\nApproved project facts/notes relevant to this conversation. Treat as established unless it conflicts with the Codex, in which case the Codex wins.\n${memoriesText}`
            ].filter(Boolean);
            setCodexContext(sections.join("\n\n"));
            setFocusedOnLabel(anchorEntries[0]?.name ?? (anchorChapters[0] ? `Chapter: ${anchorChapters[0].title}` : null));
        });
        return () => {
            cancelled = true;
        };
    }, [selectedChat.id, includeNotes, includeOutline, includeMemory]);

    const createPromptConfig = useCallback(
        (prompt: Prompt): PromptParserConfig => ({
            promptId: prompt.id,
            storyId: storyId ?? "",
            scenebeat: input.trim(),
            additionalContext: {
                codexContext,
                chatHistory: selectedChat.messages.map(msg => ({ role: msg.role, content: msg.content })),
                includeFullContext: isEditorChat ? false : includeFullContext,
                selectedSummaries: isEditorChat || includeFullContext ? [] : selectedSummaries,
                selectedItems: isEditorChat || includeFullContext ? [] : selectedItems.map(item => item.id),
                selectedChapterContent: isEditorChat || includeFullContext ? [] : selectedChapterContent
            }
        }),
        [input, storyId, codexContext, selectedChat.messages, isEditorChat, includeFullContext, selectedSummaries, selectedItems, selectedChapterContent]
    );

    // Prose proposals aren't persisted server-side (unlike Codex proposals) — they live only in
    // this component's state until Accept/Reject, matching ProseProposalCard's own doc comment.
    const [proseProposals, setProseProposals] = useState<Record<string, string>>({});

    const { generate, isGenerating, abort, streamingContent } = useChatMessageGeneration({
        selectedChat,
        selectedPrompt,
        selectedModel,
        onChatUpdate,
        createPromptConfig,
        onProseProposal: enableProseProposals
            ? (messageId, proposal) => setProseProposals(prev => ({ ...prev, [messageId]: proposal }))
            : undefined
    });

    const dismissProseProposal = (messageId: string) =>
        setProseProposals(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });

    const handleAcceptProse = (messageId: string) => {
        const text = proseProposals[messageId];
        if (!text) return;
        const editor = currentChapterId ? getActiveChapterEditor(currentChapterId) : null;
        if (!editor) {
            toast.error("Open the chapter you want to insert into, then try again.");
            return;
        }
        insertProposedProse(editor, text);
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

                {!isEditorChat && (
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
                        <div className="flex items-center gap-2">
                            <Switch id={`${selectedChat.id}-include-memory`} checked={includeMemory} onCheckedChange={toggleIncludeMemory} />
                            <Label htmlFor={`${selectedChat.id}-include-memory`} className="text-sm font-normal">
                                Include Project Memory (approved facts)
                            </Label>
                        </div>
                    </div>
                )}

                {!isEditorChat && (
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
                renderProposalsForMessage={messageId => {
                    const proposals = proposalsByMessageId[messageId];
                    const proseProposal = proseProposals[messageId];
                    if (!proposals?.length && !proseProposal) return null;
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
                                    text={proseProposal}
                                    onAccept={() => handleAcceptProse(messageId)}
                                    onReject={() => dismissProseProposal(messageId)}
                                />
                            )}
                        </>
                    );
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
