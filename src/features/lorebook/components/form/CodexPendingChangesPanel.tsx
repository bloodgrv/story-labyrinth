import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    useApprovePendingChangeMutation,
    useCodexPendingQuery,
    useRejectPendingChangeMutation
} from "@/features/lorebook/hooks/useCodexHistoryQuery";
import type { CodexPendingChange } from "@/types/codex";

interface CodexPendingChangesPanelProps {
    entryId: string;
    storyId: string | undefined;
}

const SOURCE_LABEL: Record<CodexPendingChange["sourceType"], string> = {
    chat: "Chat proposal",
    ai: "AI suggestion (auto-compile)"
};

interface PendingChangeCardProps {
    change: CodexPendingChange;
    entryId: string;
    storyId: string | undefined;
}

function PendingChangeCard({ change, entryId, storyId }: PendingChangeCardProps) {
    const approveMutation = useApprovePendingChangeMutation(entryId, storyId);
    const rejectMutation = useRejectPendingChangeMutation(entryId, storyId);
    const isUpdating = approveMutation.isPending || rejectMutation.isPending;

    return (
        <Card>
            <CardHeader className="pb-2">
                <Badge variant="outline" className="w-fit">
                    {SOURCE_LABEL[change.sourceType]}
                </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
                {change.proposedDescription && <p className="text-sm whitespace-pre-wrap">{change.proposedDescription}</p>}
                {change.proposedState && (
                    <div className="text-xs text-muted-foreground space-y-1">
                        {change.proposedState.wardrobe.length > 0 && (
                            <p>Wardrobe: {change.proposedState.wardrobe.map(i => i.value).join(", ")}</p>
                        )}
                        {change.proposedState.wounds.length > 0 && <p>Wounds: {change.proposedState.wounds.map(i => i.value).join(", ")}</p>}
                        {change.proposedState.items.length > 0 && <p>Items: {change.proposedState.items.map(i => i.value).join(", ")}</p>}
                        {change.proposedState.appearance.length > 0 && (
                            <p>Appearance: {change.proposedState.appearance.map(f => `${f.label}: ${f.value}`).join("; ")}</p>
                        )}
                    </div>
                )}
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => approveMutation.mutate(change.id)} disabled={isUpdating}>
                        {approveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate(change.id)} disabled={isUpdating}>
                        {rejectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                        Reject
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// C5 (docs/CURRENT_BACKLOG.md P0.3) — entry-scoped pending Codex changes, source-agnostic. The
// existing chat proposal tray (CodexProposalTray.tsx) only ever shows proposals scoped to one
// chat's sourceRef prefix, so a suggest_codex_updates job's "ai"-sourced proposals (no chat
// involved) had no review surface at all before this — this panel is that surface, living right
// next to CodexHistoryPanel.tsx (approving here creates the exact same "AI suggestion"-labeled
// snapshot that panel already knew how to render, since codexService.ts's
// pendingSourceToCodexSource already mapped "ai" -> "ai_suggestion" before any job used it).
export function CodexPendingChangesPanel({ entryId, storyId }: CodexPendingChangesPanelProps) {
    const [open, setOpen] = useState(true);
    const { data: pending, isLoading } = useCodexPendingQuery(entryId);

    if (!isLoading && (!pending || pending.length === 0)) return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md p-2">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full justify-between p-2" type="button">
                    <span className="font-semibold">Pending Codex updates{pending?.length ? ` (${pending.length})` : ""}</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    pending?.map(change => <PendingChangeCard key={change.id} change={change} entryId={entryId} storyId={storyId} />)
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
