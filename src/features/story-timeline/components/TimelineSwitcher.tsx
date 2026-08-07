import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StoryTimeline } from "@/types/storyTimeline";
import {
    useCreateTimelineMutation,
    useDeleteTimelineMutation,
    useUpdateTimelineMutation
} from "../hooks/useStoryTimelineQuery";

interface TimelineSwitcherProps {
    storyId: string;
    timelines: StoryTimeline[];
    activeTimelineId: string;
    onSelect: (timelineId: string) => void;
}

// Story Timeline (T6, TL5) — board switcher: Spine (always first, never renamable/deletable) +
// named timelines, "New timeline" create, rename/delete for the active named timeline. Spine is
// distinguished by `isDefault`, never by position/name, since a story is never guaranteed to keep
// its spine literally titled "Spine" forever (title is editable like any other timeline's).
export function TimelineSwitcher({ storyId, timelines, activeTimelineId, onSelect }: TimelineSwitcherProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);

    const createMutation = useCreateTimelineMutation(storyId);
    const updateMutation = useUpdateTimelineMutation(storyId);
    const deleteMutation = useDeleteTimelineMutation(storyId);

    const sorted = [...timelines].sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1));
    const active = timelines.find(t => t.id === activeTimelineId);

    const handleCreate = () => {
        if (!newTitle.trim()) return;
        createMutation.mutate(newTitle.trim(), {
            onSuccess: created => {
                setNewTitle("");
                setCreateOpen(false);
                onSelect(created.id);
            }
        });
    };

    const startRename = () => {
        if (!active) return;
        setRenameValue(active.title);
        setRenaming(true);
    };

    const submitRename = () => {
        if (!active || !renameValue.trim()) return;
        updateMutation.mutate({ id: active.id, data: { title: renameValue.trim() } }, { onSuccess: () => setRenaming(false) });
    };

    const confirmDelete = () => {
        if (!active) return;
        deleteMutation.mutate(active.id, {
            onSuccess: () => {
                setDeleteOpen(false);
                onSelect(timelines.find(t => t.isDefault)?.id ?? "");
            }
        });
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-md border overflow-hidden">
                {sorted.map(timeline => (
                    <Button
                        key={timeline.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn("rounded-none", timeline.id === activeTimelineId && "bg-secondary")}
                        onClick={() => onSelect(timeline.id)}
                    >
                        {timeline.title}
                    </Button>
                ))}
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8" title="New timeline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
            </Button>

            {active && !active.isDefault && (
                <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename timeline" onClick={startRename}>
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete timeline" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New timeline</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="e.g. Lizzy — prior ops"
                        onKeyDown={e => {
                            if (e.key === "Enter") handleCreate();
                        }}
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={!newTitle.trim() || createMutation.isPending}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={renaming} onOpenChange={setRenaming}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename timeline</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") submitRename();
                        }}
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenaming(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submitRename} disabled={!renameValue.trim() || updateMutation.isPending}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete timeline?"
                description={
                    active
                        ? `Delete "${active.title}"? Pins that only appear on this timeline will be kept on Spine instead of being deleted.`
                        : ""
                }
                onConfirm={confirmDelete}
                confirmLabel="Delete"
            />
        </div>
    );
}
