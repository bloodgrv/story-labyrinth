import { Loader2, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePurgeTrashMutation, useRestoreTrashMutation, useTrashQuery } from "@/features/trash/hooks/useTrashQuery";
import type { TrashEntityType, TrashItem } from "@/types/trash";

const TYPE_LABELS: Record<TrashEntityType, string> = {
    story: "Stories",
    series: "Series",
    chapter: "Chapters",
    folder: "Folders",
    note: "Notes",
    lorebook_entry: "Lorebook Entries",
    outline_item: "Outline Items",
    prompt: "Prompts",
    playbook_pack: "Playbook Packs",
    ai_chat: "AI Chats",
    story_map: "Story Maps",
    story_timeline: "Timelines",
    timeline_pin: "Timeline Pins"
};

// Deliberately fixed, not derived from whatever types happen to be present in the current list —
// keeps section order stable as items come and go from Trash.
const TYPE_ORDER: TrashEntityType[] = [
    "story",
    "series",
    "chapter",
    "note",
    "lorebook_entry",
    "outline_item",
    "folder",
    "prompt",
    "playbook_pack",
    "ai_chat",
    "story_map",
    "story_timeline",
    "timeline_pin"
];

const daysUntil = (iso: string): number => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60_000)));
const daysAgo = (iso: string): number => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000)));

interface TrashRowProps {
    item: TrashItem;
    onRestore: (item: TrashItem) => void;
    onDeleteClick: (item: TrashItem) => void;
    isRestoring: boolean;
}

function TrashRow({ item, onRestore, onDeleteClick, isRestoring }: TrashRowProps) {
    const deletedDays = daysAgo(item.deletedAt);
    const purgeDays = daysUntil(item.purgeAt);
    return (
        <div className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
                <span className="text-sm font-medium truncate">{item.title || "(untitled)"}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {item.storyTitle && item.type !== "story" ? `${item.storyTitle} · ` : ""}
                    Deleted {deletedDays === 0 ? "today" : `${deletedDays}d ago`} · Purges in {purgeDays}d
                </p>
            </div>
            <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => onRestore(item)} disabled={isRestoring}>
                    {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    Restore
                </Button>
                <Button size="sm" variant="outline" className="hover:text-destructive" onClick={() => onDeleteClick(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete forever
                </Button>
            </div>
        </div>
    );
}

// Aggregate review/restore surface across every entity covered by the trash registry
// (server/lib/trash.ts's TRASHABLE_ENTITIES) — the trash-panel twin of ArchivedChatsCard, but
// generalized across 13 entity types instead of hardcoded to one.
export function TrashCard() {
    const { data: items = [], isLoading } = useTrashQuery();
    const restoreMutation = useRestoreTrashMutation();
    const purgeMutation = usePurgeTrashMutation();
    const [deleting, setDeleting] = useState<TrashItem | null>(null);

    const grouped = TYPE_ORDER.map(type => ({ type, items: items.filter(i => i.type === type) })).filter(g => g.items.length > 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Trash</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                    Anything you delete (stories, chapters, notes, lorebook entries, and more) lands here first and stays
                    restorable for 14 days before it's purged automatically. Delete forever to remove something immediately.
                </p>
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Trash is empty.</p>
                ) : (
                    <div className="space-y-4">
                        {grouped.map(group => (
                            <div key={group.type}>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                    {TYPE_LABELS[group.type]} ({group.items.length})
                                </h4>
                                <div className="divide-y">
                                    {group.items.map(item => (
                                        <TrashRow
                                            key={`${item.type}:${item.id}`}
                                            item={item}
                                            onRestore={i => restoreMutation.mutate({ type: i.type, id: i.id })}
                                            onDeleteClick={setDeleting}
                                            isRestoring={restoreMutation.isPending && restoreMutation.variables?.type === item.type && restoreMutation.variables?.id === item.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={open => !open && setDeleting(null)}
                title="Delete forever"
                description={`"${deleting?.title}" will be permanently deleted. This cannot be undone.`}
                onConfirm={() => {
                    if (deleting) purgeMutation.mutate({ type: deleting.type, id: deleting.id });
                    setDeleting(null);
                }}
                confirmLabel="Delete forever"
            />
        </Card>
    );
}
