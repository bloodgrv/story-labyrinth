import { ChevronDown, ChevronUp, Loader2, MessageSquare, Pencil, RotateCcw, Sparkles, User } from "lucide-react";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
    useCodexSnapshotsQuery,
    useLabelSnapshotMutation,
    useRestoreSnapshotMutation
} from "@/features/lorebook/hooks/useCodexHistoryQuery";
import type { CodexSnapshot, CodexSourceType } from "@/types/codex";

interface CodexHistoryPanelProps {
    entryId: string;
    storyId: string | undefined;
}

const SOURCE_ICON: Record<CodexSourceType, typeof User> = {
    user: User,
    chat: MessageSquare,
    ai_suggestion: Sparkles,
    restore: RotateCcw
};

const SOURCE_LABEL: Record<CodexSourceType, string> = {
    user: "Manual edit",
    chat: "Chat proposal",
    ai_suggestion: "AI suggestion",
    restore: "Restored"
};

interface SnapshotRowProps {
    entryId: string;
    storyId: string | undefined;
    snapshot: CodexSnapshot;
    isCurrent: boolean;
}

function SnapshotRow({ entryId, storyId, snapshot, isCurrent }: SnapshotRowProps) {
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelInput, setLabelInput] = useState(snapshot.label ?? "");
    const [confirmingRestore, setConfirmingRestore] = useState(false);

    const labelMutation = useLabelSnapshotMutation(entryId);
    const restoreMutation = useRestoreSnapshotMutation(entryId, storyId);

    const Icon = SOURCE_ICON[snapshot.sourceType];
    // B2: the earliest snapshot for an entry (taken before any Codex fields were ever filled
    // in) has no codexState at all — restoring it now lands on an explicit empty state rather
    // than silently wiping the live entry, but it's still worth flagging clearly here so a user
    // doesn't mistake it for a normal save with real content.
    const isEmptyState = snapshot.codexState === null;

    const saveLabel = () => {
        const trimmed = labelInput.trim();
        labelMutation.mutate({ snapshotId: snapshot.id, label: trimmed || null }, { onSuccess: () => setEditingLabel(false) });
    };

    return (
        <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
            <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    {editingLabel ? (
                        <div className="flex items-center gap-1">
                            <Input
                                value={labelInput}
                                onChange={e => setLabelInput(e.target.value)}
                                placeholder="Name this save"
                                className="h-7 w-48"
                                onKeyDown={e => {
                                    if (e.key === "Enter") saveLabel();
                                    if (e.key === "Escape") setEditingLabel(false);
                                }}
                            />
                            <Button size="sm" className="h-7" onClick={saveLabel} disabled={labelMutation.isPending}>
                                {labelMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setLabelInput(snapshot.label ?? "");
                                setEditingLabel(true);
                            }}
                            className="text-sm font-medium hover:underline flex items-center gap-1 text-left"
                        >
                            {snapshot.label ?? <span className="text-muted-foreground italic">Untitled save</span>}
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                    )}
                    <Badge variant="secondary" className="text-xs">
                        {SOURCE_LABEL[snapshot.sourceType]}
                    </Badge>
                    {isEmptyState && (
                        <Badge variant="destructive" className="text-xs">
                            Empty state
                        </Badge>
                    )}
                    {isCurrent && (
                        <Badge variant="outline" className="text-xs">
                            Current
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(snapshot.createdAt).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{snapshot.description}</p>
            </div>
            {!isCurrent && (
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmingRestore(true)}>
                    Restore
                </Button>
            )}

            <AlertDialog open={confirmingRestore} onOpenChange={setConfirmingRestore}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore this save?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isEmptyState
                                ? "This save has no Codex state recorded — restoring it will clear Wardrobe, Appearance, " +
                                  "Wounds, Items, and Core Identity back to empty. The current state isn't lost — restoring " +
                                  "creates a new save of its own, so you can always undo this too."
                                : "This will overwrite the entry's current description and Codex state with this save's " +
                                  "values. The current state isn't lost — restoring creates a new save of its own, so you " +
                                  "can always undo this too."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                restoreMutation.mutate(snapshot.id);
                                setConfirmingRestore(false);
                            }}
                        >
                            Restore
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// The Codex "visual timeline" — Project Saves Phase 1. Same Collapsible shell as
// AdvancedSettings.tsx (this form's existing collapsible-section convention).
export function CodexHistoryPanel({ entryId, storyId }: CodexHistoryPanelProps) {
    const [open, setOpen] = useState(false);
    const { data: snapshots, isLoading } = useCodexSnapshotsQuery(entryId);

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md p-2">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full justify-between p-2" type="button">
                    <span className="font-semibold">History</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : !snapshots || snapshots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No saves yet.</p>
                ) : (
                    <div>
                        {snapshots.map((snapshot, index) => (
                            <SnapshotRow
                                key={snapshot.id}
                                entryId={entryId}
                                storyId={storyId}
                                snapshot={snapshot}
                                isCurrent={index === 0}
                            />
                        ))}
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
