import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { chatsApi } from "@/services/api/client";
import type { AIChat, Prompt } from "@/types/story";

// Extracted out of ChatInterface.tsx (T10 CR4, docs/Chat_Chrome_Declutter_Design.md) so a host
// that's migrated its "Context & memory" bucket onto ChatToolsRail's own modal-drawer panel (Notes
// first) can own a single instance of this state and hand it to both ChatInterface (via its
// contextToggles prop) and the rail's panel content, instead of two independent copies racing
// each other's chatsApi.update calls. ChatInterface still calls this itself by default when no
// external toggles are supplied (contextPanelMode="inline", every host not yet migrated).
//
// B26 (docs/CODE_REVIEW_2026-08-17.md H8/H11): toggles are per-chat DB columns on aiChats. Local
// React state must re-seed whenever the selected chat *identity* changes — otherwise Chat A’s
// armed switches stick on screen (and drive auto-accept) after the user picks Chat B. Parent
// selectedChat objects are also refreshed on successful PATCH via onChatUpdated + list cache
// invalidation so switch-away-and-back doesn’t re-seed from a stale list snapshot.

type ToggleField =
    | "includeNotes"
    | "includeOutline"
    | "includeMemory"
    | "includeTimeline"
    | "includeGuide"
    | "includeMcpTools"
    | "includeLorebook"
    | "includeChapterSummaries"
    | "autoInsertProse"
    | "autoAcceptCodex"
    | "autoAcceptOutline"
    | "webSearchEnabled"
    | "autoShuttle";

const readToggles = (chat: AIChat | null) => ({
    includeNotes: chat?.includeNotes ?? false,
    includeOutline: chat?.includeOutline ?? false,
    includeMemory: chat?.includeMemory ?? false,
    includeTimeline: chat?.includeTimeline ?? false,
    includeGuide: chat?.includeGuide ?? false,
    includeMcpTools: chat?.includeMcpTools ?? false,
    includeLorebook: chat?.includeLorebook ?? false,
    includeChapterSummaries: chat?.includeChapterSummaries ?? false,
    autoInsertProse: chat?.autoInsertProse ?? false,
    autoAcceptCodex: chat?.autoAcceptCodex ?? false,
    autoAcceptOutline: chat?.autoAcceptOutline ?? false,
    // Research defaults web search ON at the DB/schema layer for new research chats; UI seeds
    // from the row value when present, else false (non-research types never arm this switch).
    webSearchEnabled: chat?.webSearchEnabled ?? false,
    autoShuttle: chat?.autoShuttle ?? false
});

export function useChatContextToggles(
    selectedChat: AIChat | null,
    promptType: Prompt["promptType"],
    // Hosts that keep selectedChat in React state should pass their setter so a successful toggle
    // PATCH updates the sticky selection object (not only local boolean state / list cache).
    onChatUpdated?: (chat: AIChat) => void
) {
    const queryClient = useQueryClient();
    const isEditorChat = promptType === "editor";
    const isOutlineChat = promptType === "outline";
    const isBrainstormChat = promptType === "brainstorm";
    const isResearchChat = promptType === "research";
    const isNotesChat = promptType === "notes";
    const isWorldBuildingChat = promptType === "worldbuilding";
    const usesCodexTray = isEditorChat || isWorldBuildingChat || isOutlineChat;
    const usesShuttle = isEditorChat || isWorldBuildingChat || isOutlineChat;

    const initial = readToggles(selectedChat);
    const [includeNotes, setIncludeNotes] = useState(initial.includeNotes);
    const [includeOutline, setIncludeOutline] = useState(initial.includeOutline);
    const [includeMemory, setIncludeMemory] = useState(initial.includeMemory);
    const [includeTimeline, setIncludeTimeline] = useState(initial.includeTimeline);
    const [includeGuide, setIncludeGuide] = useState(initial.includeGuide);
    const [includeMcpTools, setIncludeMcpTools] = useState(initial.includeMcpTools);
    const [includeLorebook, setIncludeLorebook] = useState(initial.includeLorebook);
    const [includeChapterSummaries, setIncludeChapterSummaries] = useState(initial.includeChapterSummaries);
    const [autoInsertProse, setAutoInsertProse] = useState(initial.autoInsertProse);
    const [autoAcceptCodex, setAutoAcceptCodex] = useState(initial.autoAcceptCodex);
    const [autoAcceptOutline, setAutoAcceptOutline] = useState(initial.autoAcceptOutline);
    const [webSearchEnabled, setWebSearchEnabled] = useState(initial.webSearchEnabled);
    const [autoShuttle, setAutoShuttle] = useState(initial.autoShuttle);

    // Keep latest callback without re-running the seed effect when the parent inline function identity changes.
    const onChatUpdatedRef = useRef(onChatUpdated);
    onChatUpdatedRef.current = onChatUpdated;

    // Re-seed local booleans from the selected row whenever chat identity changes (A → B → A).
    // Depend on id only: field-level parent updates after our own PATCH already go through setters;
    // re-running on every selectedChat field change would fight in-flight toggles.
    useEffect(() => {
        const next = readToggles(selectedChat);
        setIncludeNotes(next.includeNotes);
        setIncludeOutline(next.includeOutline);
        setIncludeMemory(next.includeMemory);
        setIncludeTimeline(next.includeTimeline);
        setIncludeGuide(next.includeGuide);
        setIncludeMcpTools(next.includeMcpTools);
        setIncludeLorebook(next.includeLorebook);
        setIncludeChapterSummaries(next.includeChapterSummaries);
        setAutoInsertProse(next.autoInsertProse);
        setAutoAcceptCodex(next.autoAcceptCodex);
        setAutoAcceptOutline(next.autoAcceptOutline);
        setWebSearchEnabled(next.webSearchEnabled);
        setAutoShuttle(next.autoShuttle);
    }, [selectedChat?.id]);

    const withUpdate =
        (field: ToggleField, setter: (value: boolean) => void) =>
        (value: boolean) => {
            if (!selectedChat) return;
            void chatsApi
                .update(selectedChat.id, { [field]: value })
                .then(updated => {
                    setter(value);
                    onChatUpdatedRef.current?.(updated);
                    // Same prefix-invalidation shape as useUpdateChatMutation — keeps ChatList rows
                    // fresh so a later click-to-select doesn’t rehydrate stale toggle columns.
                    if (updated.storyId) {
                        void queryClient.invalidateQueries({ queryKey: ["chats", "story", updated.storyId] });
                    } else if (updated.chatType) {
                        void queryClient.invalidateQueries({ queryKey: ["chats", "global", updated.chatType] });
                    }
                })
                .catch((error: Error) => {
                    // Leave local state unchanged on failure (still the pre-click value).
                    console.error(`Failed to update chat toggle ${field}:`, error.message);
                });
        };

    const toggleIncludeNotes = withUpdate("includeNotes", setIncludeNotes);
    const toggleIncludeOutline = withUpdate("includeOutline", setIncludeOutline);
    const toggleIncludeMemory = withUpdate("includeMemory", setIncludeMemory);
    const toggleIncludeTimeline = withUpdate("includeTimeline", setIncludeTimeline);
    const toggleIncludeGuide = withUpdate("includeGuide", setIncludeGuide);
    const toggleIncludeMcpTools = withUpdate("includeMcpTools", setIncludeMcpTools);
    const toggleIncludeLorebook = withUpdate("includeLorebook", setIncludeLorebook);
    const toggleIncludeChapterSummaries = withUpdate("includeChapterSummaries", setIncludeChapterSummaries);
    const toggleAutoInsertProse = withUpdate("autoInsertProse", setAutoInsertProse);
    const toggleAutoAcceptCodex = withUpdate("autoAcceptCodex", setAutoAcceptCodex);
    const toggleAutoAcceptOutline = withUpdate("autoAcceptOutline", setAutoAcceptOutline);
    const toggleWebSearchEnabled = withUpdate("webSearchEnabled", setWebSearchEnabled);
    const toggleAutoShuttle = withUpdate("autoShuttle", setAutoShuttle);

    const armedLabels = [
        !isNotesChat && includeNotes && "Notes",
        !isOutlineChat && !isResearchChat && includeOutline && "Outline",
        !isResearchChat && !isNotesChat && includeMemory && "Memory",
        !isResearchChat && !isNotesChat && includeTimeline && "Timeline",
        includeGuide && "Guide",
        includeMcpTools && "MCP tools",
        (isBrainstormChat || isResearchChat || isNotesChat) && includeLorebook && "Lorebook",
        isResearchChat && webSearchEnabled && "Web search",
        isBrainstormChat && includeChapterSummaries && "Chapter summaries",
        usesCodexTray && isEditorChat && autoInsertProse && "Auto-insert prose",
        usesCodexTray && autoAcceptCodex && "Auto-accept Codex",
        usesCodexTray && isOutlineChat && autoAcceptOutline && "Auto-accept outline",
        usesCodexTray && usesShuttle && autoShuttle && "Auto-shuttle"
    ].filter((label): label is string => Boolean(label));

    return {
        includeNotes,
        toggleIncludeNotes,
        includeOutline,
        toggleIncludeOutline,
        includeMemory,
        toggleIncludeMemory,
        includeTimeline,
        toggleIncludeTimeline,
        includeGuide,
        toggleIncludeGuide,
        includeMcpTools,
        toggleIncludeMcpTools,
        includeLorebook,
        toggleIncludeLorebook,
        includeChapterSummaries,
        toggleIncludeChapterSummaries,
        autoInsertProse,
        toggleAutoInsertProse,
        autoAcceptCodex,
        toggleAutoAcceptCodex,
        autoAcceptOutline,
        toggleAutoAcceptOutline,
        webSearchEnabled,
        toggleWebSearchEnabled,
        autoShuttle,
        toggleAutoShuttle,
        usesCodexTray,
        usesShuttle,
        armedLabels
    };
}

export type ChatContextToggles = ReturnType<typeof useChatContextToggles>;
