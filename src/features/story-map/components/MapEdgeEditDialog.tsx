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
import { STORY_MAP_EDGE_TYPES, STORY_MAP_EDGE_TYPE_LABELS } from "@/types/storyMap";
import type { StoryMapEdge, StoryMapEdgeType, StoryMapNode } from "@/types/storyMap";
import { useCreateMapEdgeMutation, useDeleteMapEdgeMutation, useUpdateMapEdgeMutation } from "../hooks/useStoryMapQuery";

interface MapEdgeEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storyId: string;
    nodes: StoryMapNode[];
    edge?: StoryMapEdge | null;
    initialFromId?: string;
    initialToId?: string;
}

// Mirrors story-graph/components/EdgeEditDialog.tsx, minus the "Propose for review" pending
// toggle — Story Map ships manual-CRUD-only this pass, no pending lane (see storyMapEdges'
// schema.ts comment).
export function MapEdgeEditDialog({ open, onOpenChange, storyId, nodes, edge, initialFromId, initialToId }: MapEdgeEditDialogProps) {
    const isEdit = !!edge;
    const [fromId, setFromId] = useState(edge?.fromId ?? initialFromId ?? "");
    const [toId, setToId] = useState(edge?.toId ?? initialToId ?? "");
    const [edgeType, setEdgeType] = useState<StoryMapEdgeType>(edge?.edgeType ?? "contains");
    const [label, setLabel] = useState(edge?.label ?? "");
    const [description, setDescription] = useState(edge?.description ?? "");
    const [deleting, setDeleting] = useState(false);

    const createMutation = useCreateMapEdgeMutation();
    const updateMutation = useUpdateMapEdgeMutation();
    const deleteMutation = useDeleteMapEdgeMutation();

    useEffect(() => {
        if (!open) return;
        setFromId(edge?.fromId ?? initialFromId ?? "");
        setToId(edge?.toId ?? initialToId ?? "");
        setEdgeType(edge?.edgeType ?? "contains");
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
                        <DialogTitle>{isEdit ? "Edit Map Link" : "New Map Link"}</DialogTitle>
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
                                            <SelectValue placeholder="Select location" />
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
                                            <SelectValue placeholder="Select location" />
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
                            <Select value={edgeType} onValueChange={value => setEdgeType(value as StoryMapEdgeType)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STORY_MAP_EDGE_TYPES.map(t => (
                                        <SelectItem key={t} value={t}>
                                            {STORY_MAP_EDGE_TYPE_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Label (optional)</Label>
                            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Short override, e.g. 'the old road'" />
                        </div>
                        <div className="space-y-1">
                            <Label>Description (optional)</Label>
                            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        {isEdit ? (
                            <Button
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleting(true)}
                                disabled={isPending}
                            >
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
                        <AlertDialogTitle>Delete this map link?</AlertDialogTitle>
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
