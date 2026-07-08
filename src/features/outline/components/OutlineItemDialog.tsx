import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OutlineItemType } from "@/types/outline";

export interface OutlineItemFormValues {
    title: string;
    summary: string;
    wordCountTarget: string; // kept as string in the form, parsed to number|null on submit
}

interface OutlineItemDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemType: OutlineItemType;
    initialValues?: { title: string; summary?: string | null; wordCountTarget?: number | null };
    onSubmit: (data: { title: string; summary: string | null; wordCountTarget: number | null }) => void;
}

// Handles both create and edit for a single outline row (chapter or scene) — which mode it's in
// is just whether `initialValues` is present. Reparenting a scene to a different chapter is a
// separate, dedicated control on the row itself (not a field here) — see OutlineSceneRow's "Move
// to chapter" select — so this dialog only ever edits an item's own content.
export function OutlineItemDialog({ open, onOpenChange, itemType, initialValues, onSubmit }: OutlineItemDialogProps) {
    const isEditing = Boolean(initialValues);
    const form = useForm<OutlineItemFormValues>();

    useEffect(() => {
        if (!open) return;
        form.reset({
            title: initialValues?.title ?? "",
            summary: initialValues?.summary ?? "",
            wordCountTarget: initialValues?.wordCountTarget ? String(initialValues.wordCountTarget) : ""
        });
    }, [open, initialValues, form]);

    const handleSubmit = (data: OutlineItemFormValues) => {
        const parsedTarget = Number.parseInt(data.wordCountTarget, 10);
        onSubmit({
            title: data.title.trim(),
            summary: data.summary.trim() ? data.summary.trim() : null,
            wordCountTarget: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null
        });
        onOpenChange(false);
    };

    const label = itemType === "chapter" ? "Chapter" : "Scene";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={form.handleSubmit(handleSubmit)}>
                    <DialogHeader>
                        <DialogTitle>
                            {isEditing ? "Edit" : "Add"} {label}
                        </DialogTitle>
                        <DialogDescription>
                            {itemType === "chapter"
                                ? "A top-level structural unit of your outline."
                                : "A scene nested under a chapter."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="outline-item-title">Title</Label>
                            <Input
                                id="outline-item-title"
                                placeholder={`Enter ${label.toLowerCase()} title`}
                                {...form.register("title", { required: true })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="outline-item-summary">Summary</Label>
                            <Textarea
                                id="outline-item-summary"
                                placeholder="What happens here, concretely?"
                                rows={4}
                                {...form.register("summary")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="outline-item-word-target">Word Count Target</Label>
                            <Input
                                id="outline-item-word-target"
                                type="number"
                                min={0}
                                placeholder="e.g. 2500"
                                {...form.register("wordCountTarget")}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit">{isEditing ? "Save Changes" : `Add ${label}`}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
