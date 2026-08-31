import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import type { CodexPendingStatus } from "@/types/codex";
import { useChatProposalsQuery } from "../hooks/useCodexProposalsQuery";
import { ProposalTrayCard } from "./ProposalTrayCard";

interface CodexProposalTrayProps {
    chatId: string;
}

const STATUS_TABS: CodexPendingStatus[] = ["pending", "approved", "rejected"];

// Codex proposals for this chat, moved out of ChatInterface.tsx's inline-under-message rendering
// (for Editor chats — World-Building keeps that rendering, see ChatInterface.tsx's isEditorChat
// gate) into a persistent this-chat-scoped review surface, per
// docs/Chat_Panel_Integrations_Design.md §2 ("Writes — Codex | codex-proposal → tray under chat
// list (no popup)"). Structural precedent: src/features/rag-scanner/components/RagScannerPanel.tsx.
//
// Deliberately fetches the flat proposal array via useChatProposalsQuery, NOT
// groupProposalsByMessage — that helper silently drops any proposal whose sourceRef has no
// ":msg:" segment (e.g. a chat-level proposal with no originating message), which would make
// "all proposals for this chat" an incomplete list.
export function CodexProposalTray({ chatId }: CodexProposalTrayProps) {
    const [statusTab, setStatusTab] = useState<CodexPendingStatus>("pending");
    const { data: proposals = [] } = useChatProposalsQuery(chatId, statusTab);
    const { entries: lorebookEntries } = useLorebookContext();
    const entryLookup = useMemo(() => new Map(lorebookEntries.map(e => [e.id, e])), [lorebookEntries]);

    return (
        <div className="flex min-h-0 flex-1 flex-col border-l border-t border-input">
            <Tabs value={statusTab} onValueChange={value => setStatusTab(value as CodexPendingStatus)}>
                <div className="p-2">
                    <TabsList className="w-full">
                        {STATUS_TABS.map(tab => (
                            <TabsTrigger key={tab} value={tab} className="flex-1 capitalize">
                                {tab}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
            </Tabs>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {proposals.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} Codex proposals.</p>
                ) : (
                    proposals.map(proposal => {
                        const entry = entryLookup.get(proposal.entryId);
                        return (
                            <ProposalTrayCard
                                key={proposal.id}
                                proposal={proposal}
                                chatId={chatId}
                                entryName={entry?.name ?? "Unknown entry"}
                                entryCategory={entry?.category ?? "unknown"}
                                entryCurrentState={entry?.codexState}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}
