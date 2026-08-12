import { useState } from "react";
import { chatsApi } from "@/services/api/client";
import type { AIChat, Prompt } from "@/types/story";

// Extracted out of ChatInterface.tsx (T10 CR4, docs/Chat_Chrome_Declutter_Design.md) so a host
// that's migrated its "Context & memory" bucket onto ChatToolsRail's own modal-drawer panel (Notes
// first) can own a single instance of this state and hand it to both ChatInterface (via its
// contextToggles prop) and the rail's panel content, instead of two independent copies racing
// each other's chatsApi.update calls. ChatInterface still calls this itself by default when no
// external toggles are supplied (contextPanelMode="inline", every host not yet migrated).
//
// Every toggle follows the same local-state-persisted-after-PATCH pattern: seed from
// selectedChat, PATCH on change, only update local state once the PATCH resolves.
export function useChatContextToggles(selectedChat: AIChat | null, promptType: Prompt["promptType"]) {
    const isEditorChat = promptType === "editor";
    const isOutlineChat = promptType === "outline";
    const isBrainstormChat = promptType === "brainstorm";
    const isResearchChat = promptType === "research";
    const isNotesChat = promptType === "notes";
    const isWorldBuildingChat = promptType === "worldbuilding";
    const usesCodexTray = isEditorChat || isWorldBuildingChat || isOutlineChat;
    const usesShuttle = isEditorChat || isWorldBuildingChat || isOutlineChat;

    const [includeNotes, setIncludeNotes] = useState(selectedChat?.includeNotes ?? false);
    const [includeOutline, setIncludeOutline] = useState(selectedChat?.includeOutline ?? false);
    const [includeMemory, setIncludeMemory] = useState(selectedChat?.includeMemory ?? false);
    const [includeTimeline, setIncludeTimeline] = useState(selectedChat?.includeTimeline ?? false);
    const [includeGuide, setIncludeGuide] = useState(selectedChat?.includeGuide ?? false);
    const [includeLorebook, setIncludeLorebook] = useState(selectedChat?.includeLorebook ?? false);
    const [includeChapterSummaries, setIncludeChapterSummaries] = useState(selectedChat?.includeChapterSummaries ?? false);
    const [autoInsertProse, setAutoInsertProse] = useState(selectedChat?.autoInsertProse ?? false);
    const [autoAcceptCodex, setAutoAcceptCodex] = useState(selectedChat?.autoAcceptCodex ?? false);
    const [autoAcceptOutline, setAutoAcceptOutline] = useState(selectedChat?.autoAcceptOutline ?? false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(selectedChat?.webSearchEnabled ?? false);
    const [autoShuttle, setAutoShuttle] = useState(selectedChat?.autoShuttle ?? false);

    const withUpdate =
        (field: string, setter: (value: boolean) => void) =>
        (value: boolean) => {
            if (!selectedChat) return;
            chatsApi.update(selectedChat.id, { [field]: value }).then(() => setter(value));
        };

    const toggleIncludeNotes = withUpdate("includeNotes", setIncludeNotes);
    const toggleIncludeOutline = withUpdate("includeOutline", setIncludeOutline);
    const toggleIncludeMemory = withUpdate("includeMemory", setIncludeMemory);
    const toggleIncludeTimeline = withUpdate("includeTimeline", setIncludeTimeline);
    const toggleIncludeGuide = withUpdate("includeGuide", setIncludeGuide);
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
