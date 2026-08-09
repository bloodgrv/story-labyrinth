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
import { CodexFieldDiffLine, CodexListDiffLine } from "@/features/lorebook/utils/codexStateDiff";
import type { CodexPendingChange, CodexState } from "@/types/codex";

interface CodexPendingChangesPanelProps {
    entryId: string;
    storyId: string | undefined;
    // T5 FS8 (docs/Lore_Sheet_And_Sync_Design.md §6e: "List buckets... full replace with diff
    // shown") — the entry's own current codexState to diff each proposal's list buckets/labeled
    // fields against. undefined/null (a brand-new unsaved entry, or a caller that hasn't wired
    // this yet) degrades gracefully to the pre-FS8 "proposed value only" rendering below.
    currentState?: CodexState | null;
}

const SOURCE_LABEL: Record<CodexPendingChange["sourceType"], string> = {
    chat: "Chat proposal",
    ai: "AI suggestion (auto-compile)"
};

interface PendingChangeCardProps {
    change: CodexPendingChange;
    entryId: string;
    storyId: string | undefined;
    currentState?: CodexState | null;
}

function PendingChangeCard({ change, entryId, storyId, currentState }: PendingChangeCardProps) {
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
                        {/* A chat-emitted proposedState may only include the section(s) actually
                            changing (see CODEX_PROPOSAL_INSTRUCTIONS) — guard every key, not just
                            the object itself. */}
                        <CodexListDiffLine label="Wardrobe" current={currentState?.wardrobe} proposed={change.proposedState.wardrobe} />
                        <CodexListDiffLine label="Wounds" current={currentState?.wounds} proposed={change.proposedState.wounds} />
                        <CodexListDiffLine label="Items" current={currentState?.items} proposed={change.proposedState.items} />
                        <CodexFieldDiffLine label="Appearance" current={currentState?.appearance} proposed={change.proposedState.appearance} />
                        <CodexFieldDiffLine label="Custom fields" current={currentState?.customFields} proposed={change.proposedState.customFields} />
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
export function CodexPendingChangesPanel({ entryId, storyId, currentState }: CodexPendingChangesPanelProps) {
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
                    pending?.map(change => (
                        <PendingChangeCard key={change.id} change={change} entryId={entryId} storyId={storyId} currentState={currentState} />
                    ))
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
