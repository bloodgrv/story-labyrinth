import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STORY_GRAPH_EDGE_TYPES, STORY_GRAPH_EDGE_TYPE_LABELS } from "@/types/storyGraph";
import type { StoryGraphEdge, StoryGraphEdgeType, StoryGraphNode } from "@/types/storyGraph";
import { useCreateEdgeMutation, useDeleteEdgeMutation, useUpdateEdgeMutation } from "../hooks/useStoryGraphQuery";

interface EdgeEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storyId: string;
    nodes: StoryGraphNode[];
    // Present -> edit an existing edge. Absent -> create, using initialFromId/initialToId as
    // prefill (drag-to-connect always supplies both; "Add edge from here" supplies only from).
    edge?: StoryGraphEdge | null;
    initialFromId?: string;
    initialToId?: string;
}

export function EdgeEditDialog({ open, onOpenChange, storyId, nodes, edge, initialFromId, initialToId }: EdgeEditDialogProps) {
    const isEdit = !!edge;
    const [fromId, setFromId] = useState(edge?.fromId ?? initialFromId ?? "");
    const [toId, setToId] = useState(edge?.toId ?? initialToId ?? "");
    const [edgeType, setEdgeType] = useState<StoryGraphEdgeType>(edge?.edgeType ?? "knows");
    const [label, setLabel] = useState(edge?.label ?? "");
    const [description, setDescription] = useState(edge?.description ?? "");
    const [deleting, setDeleting] = useState(false);

    const createMutation = useCreateEdgeMutation();
    const updateMutation = useUpdateEdgeMutation();
    const deleteMutation = useDeleteEdgeMutation();

    // Re-seed local state whenever a fresh edge/prefill is handed in — this dialog instance is
    // reused across opens rather than remounted (canvas holds one instance).
    useEffect(() => {
        if (!open) return;
        setFromId(edge?.fromId ?? initialFromId ?? "");
        setToId(edge?.toId ?? initialToId ?? "");
        setEdgeType(edge?.edgeType ?? "knows");
        setLabel(edge?.label ?? "");
        setDescription(edge?.description ?? "");
    }, [open, edge, initialFromId, initialToId]);

    const nodeName = (id: string) => nodes.find(n => n.id === id)?.name ?? id;
    const fromLocked = isEdit || !!initialFromId;
    const toLocked = isEdit || !!initialToId;

    const handleSave = () => {
        if (isEdit && edge) {
            updateMutation.mutate(
                { id: edge.id, data: { edgeType, label: label.trim() || null, description: description.trim() || null } },
                { onSuccess: () => onOpenChange(false) }
            );
            return;
        }
        if (!fromId || !toId) return;
        createMutation.mutate(
            { storyId, data: { fromId, toId, edgeType, label: label.trim() || null, description: description.trim() || null } },
            { onSuccess: () => onOpenChange(false) }
        );
    };

    const handleDelete = () => {
        if (!edge) return;
        deleteMutation.mutate(edge.id, {
            onSuccess: () => {
                setDeleting(false);
                onOpenChange(false);
            }
        });
    };

    const isPending = createMutation.isPending || updateMutation.isPending;
    const canSave = isEdit || (!!fromId && !!toId && fromId !== toId);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isEdit ? "Edit Relationship" : "New Relationship"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label>From</Label>
                                {fromLocked ? (
                                    <p className="text-sm font-medium py-2 truncate">{nodeName(fromId)}</p>
                                ) : (
                                    <Select value={fromId} onValueChange={setFromId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select entry" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {nodes.map(n => (
                                                <SelectItem key={n.id} value={n.id}>
                                                    {n.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>To</Label>
                                {toLocked ? (
                                    <p className="text-sm font-medium py-2 truncate">{nodeName(toId)}</p>
                                ) : (
                                    <Select value={toId} onValueChange={setToId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select entry" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {nodes
                                                .filter(n => n.id !== fromId)
                                                .map(n => (
                                                    <SelectItem key={n.id} value={n.id}>
                                                        {n.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Type</Label>
                            <Select value={edgeType} onValueChange={value => setEdgeType(value as StoryGraphEdgeType)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STORY_GRAPH_EDGE_TYPES.map(t => (
                                        <SelectItem key={t} value={t}>
                                            {STORY_GRAPH_EDGE_TYPE_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Label (optional)</Label>
                            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Short override, e.g. 'ex-partner'" />
                        </div>
                        <div className="space-y-1">
                            <Label>Description (optional)</Label>
                            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        {isEdit ? (
                            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)} disabled={isPending}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </Button>
                        ) : (
                            <span />
                        )}
                        <Button onClick={handleSave} disabled={isPending || !canSave}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleting} onOpenChange={setDeleting}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this relationship?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
