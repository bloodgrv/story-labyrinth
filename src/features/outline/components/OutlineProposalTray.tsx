import { Sparkles } from "lucide-react";
import type { ParsedLoreSuggestion } from "@/features/chat/services/parseLoreSuggestions";
import { LoreSuggestionCard } from "./LoreSuggestionCard";

interface OutlineProposalTrayProps {
    // Accumulated across the whole chat by OutlineChatRail (see its onLoreSuggestions handler) —
    // lore suggestions are never persisted server-side, so this list lives only as long as the
    // rail stays mounted, unlike CodexProposalTray's server-backed pending/approved/rejected tabs.
    loreSuggestions: ParsedLoreSuggestion[];
    storyId: string;
    fromChatId: string;
    fromChatTitleSnapshot: string;
}

// P0.4 R8 — sits under CodexProposalTray in OutlineChatRail's sidebar column. Outline chat
// proposals split across three surfaces by durability (docs/Chat_Panel_Integrations_Design.md §4):
// Codex changes go to the existing CodexProposalTray (server-backed); outline create proposals
// appear directly in the tree via existing "AI Suggested" badges (OutlineChapterCard.tsx/
// OutlineSceneRow.tsx, no tray needed); outline edit/reorder/delete proposals render as ephemeral
// inline cards under the message that produced them (OutlineProposalCard.tsx, via ChatInterface's
// renderProposalsForMessage). Lore suggestions are the one case that's both ephemeral AND wants a
// standing tray section rather than inline-per-message, since "Open in WB" is a one-way handoff
// the user may want to revisit across several turns, not a single accept/reject decision.
export function OutlineProposalTray({ loreSuggestions, storyId, fromChatId, fromChatTitleSnapshot }: OutlineProposalTrayProps) {
    if (loreSuggestions.length === 0) return null;

    return (
        <div className="border-t p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                Lore suggestions
            </div>
            <div className="space-y-2">
                {loreSuggestions.map((suggestion, index) => (
                    // Suggestions are never persisted, so there's no stable id to key on — index
                    // is fine here since this list only ever grows (appended in OutlineChatRail),
                    // never reorders or removes an item from the middle.
                    <LoreSuggestionCard
                        key={`${suggestion.name}-${index}`}
                        suggestion={suggestion}
                        storyId={storyId}
                        fromChatId={fromChatId}
                        fromChatTitleSnapshot={fromChatTitleSnapshot}
                    />
                ))}
            </div>
        </div>
    );
}
