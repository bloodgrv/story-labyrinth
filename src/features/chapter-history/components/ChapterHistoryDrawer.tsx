import { Clock, Loader2, Pencil, RotateCcw, Save } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
    useChapterHistoryQuery,
    useRestoreSnapshotMutation,
    useSaveChapterVersionMutation,
    useSetSnapshotLabelMutation
} from "@/features/chapter-history/hooks/useChapterHistoryQuery";
import type { ChapterSnapshot, ChapterSnapshotSourceType } from "@/types/chapterSnapshot";

const SOURCE_ICON: Record<ChapterSnapshotSourceType, typeof Clock> = {
    auto: Clock,
    manual: Save,
    restore: RotateCcw
};

const SOURCE_LABEL: Record<ChapterSnapshotSourceType, string> = {
    auto: "Auto checkpoint",
    manual: "Manual save",
    restore: "Restored"
};

interface SaveVersionRowProps {
    chapterId: string;
}

function SaveVersionRow({ chapterId }: SaveVersionRowProps) {
    const [label, setLabel] = useState("");
    const saveMutation = useSaveChapterVersionMutation(chapterId);

    const handleSave = () => {
        saveMutation.mutate(label.trim() || undefined, { onSuccess: () => setLabel("") });
    };

    return (
        <div className="flex items-center gap-2 border-b pb-3">
            <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Name this save (optional)"
                className="h-8"
                onKeyDown={e => {
                    if (e.key === "Enter") handleSave();
                }}
            />
            <Button size="sm" className="h-8 shrink-0" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save Version
            </Button>
        </div>
    );
}

interface SnapshotRowProps {
    chapterId: string;
    snapshot: ChapterSnapshot;
    isCurrent: boolean;
}

function SnapshotRow({ chapterId, snapshot, isCurrent }: SnapshotRowProps) {
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelInput, setLabelInput] = useState(snapshot.label ?? "");
    const [confirmingRestore, setConfirmingRestore] = useState(false);

    const labelMutation = useSetSnapshotLabelMutation(chapterId);
    const restoreMutation = useRestoreSnapshotMutation(chapterId);

    const Icon = SOURCE_ICON[snapshot.sourceType];

    const saveLabel = () => {
        const trimmed = labelInput.trim();
        labelMutation.mutate({ snapshotId: snapshot.id, label: trimmed || null }, { onSuccess: () => setEditingLabel(false) });
    };

    return (
        <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
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
                            className="flex items-center gap-1 text-left text-sm font-medium hover:underline"
                        >
                            {snapshot.label ?? <span className="italic text-muted-foreground">Untitled save</span>}
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                    )}
                    <Badge variant="secondary" className="text-xs">
                        {SOURCE_LABEL[snapshot.sourceType]}
                    </Badge>
                    {isCurrent && (
                        <Badge variant="outline" className="text-xs">
                            Current
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(snapshot.createdAt).toLocaleString()}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{snapshot.preview}</p>
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
                            This overwrites the chapter's current content with this save's version. A safety checkpoint
                            of the current content is taken automatically first, so nothing is lost — restoring also
                            creates a new save of its own, so you can undo this too.
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

interface ChapterHistoryDrawerProps {
    chapterId: string;
    // The chapter's actual live content, so "Current" can be based on a real content match
    // rather than "newest in the list" — unlike Codex (every mutation snapshotted, so the
    // newest snapshot really is always current), chapter 'auto' snapshots are throttled, so the
    // live chapter can easily have moved on from the most recent snapshot without a new one
    // existing yet. Confirmed live: right after a manual save, editing the chapter further (no
    // new snapshot yet, by design) still showed the stale save as "Current" under the old
    // index-based check.
    currentContent: string | undefined;
}

// Linear undo history for the main chapter's own content (P0.2b) — same Snapshot+restore shape
// as CodexHistoryPanel.tsx, plus a manual "Save Version" trigger Codex doesn't need (Codex saves
// happen automatically on every discrete mutation; a chapter autosaves continuously while typing,
// so there's no equivalent "moment of intent" without an explicit action).
export function ChapterHistoryDrawer({ chapterId, currentContent }: ChapterHistoryDrawerProps) {
    const { data, isLoading } = useChapterHistoryQuery(chapterId);
    const snapshots = data?.snapshots ?? [];

    return (
        <div className="space-y-1">
            <SaveVersionRow chapterId={chapterId} />
            {isLoading ? (
                <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : snapshots.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No history yet.</p>
            ) : (
                <div>
                    {snapshots.map(snapshot => (
                        <SnapshotRow
                            key={snapshot.id}
                            chapterId={chapterId}
                            snapshot={snapshot}
                            isCurrent={snapshot.content === currentContent}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
