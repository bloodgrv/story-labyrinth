import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { ParsedLoreSuggestion } from "@/features/chat/services/parseLoreSuggestions";
import { deskTransfersApi } from "@/services/api/client";

interface LoreSuggestionCardProps {
    suggestion: ParsedLoreSuggestion;
    storyId: string;
    fromChatId: string;
    fromChatTitleSnapshot: string;
}

// P0.4 R8 — one row in OutlineProposalTray's lore-suggestion section. "Open in WB" hands the
// suggestion off to the Lorebook tool via StoryContext.pendingLorebookSeed (the same same-tab,
// same-workspace cross-tool navigation pattern the Relationships graph's "Open entry" already
// uses for pendingLorebookEntryId — see StoryContext.tsx and LorebookPage.tsx's consumption
// effect), then switches the workspace to the Lorebook tool. Never creates the entry directly —
// Outline is not a lore factory, per docs/Chat_Panel_Integrations_Design.md §4.
export function LoreSuggestionCard({ suggestion, storyId, fromChatId, fromChatTitleSnapshot }: LoreSuggestionCardProps) {
    const { setPendingLorebookSeed, setCurrentTool } = useStoryContext();

    const handleOpenInWb = () => {
        setPendingLorebookSeed({ name: suggestion.name, category: suggestion.category, blurb: suggestion.blurb });
        setCurrentTool("lorebook");
        // Transfer Log (T1) — single-step action (the suggestion itself is ephemeral, never
        // persisted server-side, so there's no earlier "propose" moment to log separately).
        for (const event of ["proposed", "opened"] as const)
            deskTransfersApi
                .log(storyId, {
                    event,
                    kind: "lore_suggestion",
                    fromDesk: "outline",
                    fromChatId,
                    fromChatTitleSnapshot,
                    toDesk: "worldbuilding",
                    subject: suggestion.name,
                    crumb: suggestion.blurb
                })
                .catch(() => {});
    };

    return (
        <div className="flex items-start gap-2 rounded-md border p-2">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{suggestion.name}</span>
                    <Badge variant="outline" className="font-normal">
                        {suggestion.category}
                    </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{suggestion.blurb}</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={handleOpenInWb}>
                <ExternalLink className="h-3 w-3" />
                Open in WB
            </Button>
        </div>
    );
}
