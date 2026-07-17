import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OutlineCharacterChips } from "@/features/outline/components/OutlineCharacterChips";
import { OutlineItemDialog } from "@/features/outline/components/OutlineItemDialog";
import { useDeleteOutlineItemMutation, useUpdateOutlineItemMutation } from "@/features/outline/hooks/useOutlineQuery";
import { cn } from "@/lib/utils";
import type { OutlineItem } from "@/types/outline";
import type { LorebookEntry } from "@/types/story";

interface OutlineSceneRowProps {
    scene: OutlineItem;
    storyId: string;
    chapters: OutlineItem[]; // for the "Move to chapter" reparent control
    characters: LorebookEntry[];
    onMoveToChapter: (sceneId: string, newChapterId: string) => void;
}

export function OutlineSceneRow({ scene, storyId, chapters, characters, onMoveToChapter }: OutlineSceneRowProps) {
    const [editOpen, setEditOpen] = useState(false);
    const updateMutation = useUpdateOutlineItemMutation(storyId);
    const deleteMutation = useDeleteOutlineItemMutation(storyId);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    const isPending = scene.status === "pending";

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={cn(
                    "flex items-start gap-2 rounded-md border p-2",
                    isPending && "border-dashed border-amber-400/60 bg-amber-500/10"
                )}
            >
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-6 shrink-0 cursor-grab p-0 active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </Button>

                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {isPending && (
                            <Badge
                                variant="outline"
                                className="gap-1 font-normal border-amber-400/60 text-amber-600 dark:text-amber-400"
                            >
                                <Sparkles className="h-3 w-3" />
                                AI Suggested
                            </Badge>
                        )}
                        <span className="text-sm font-medium truncate">{scene.title}</span>
                        {scene.wordCountTarget ? (
                            <Badge variant="secondary" className="font-normal">
                                ~{scene.wordCountTarget.toLocaleString()} words
                            </Badge>
                        ) : null}
                    </div>
                    {scene.summary && <p className="text-xs text-muted-foreground">{scene.summary}</p>}
                    <OutlineCharacterChips outlineItemId={scene.id} storyId={storyId} characters={characters} />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    {chapters.length > 1 && (
                        <Select
                            value={scene.parentId ?? undefined}
                            onValueChange={value => onMoveToChapter(scene.id, value)}
                        >
                            <SelectTrigger className="h-7 w-32 text-xs" title="Move to chapter">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {chapters.map(chapter => (
                                    <SelectItem key={chapter.id} value={chapter.id}>
                                        {chapter.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => setEditOpen(true)}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isPending ? (
                        <>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-600"
                                title="Accept suggestion"
                                onClick={() =>
                                    updateMutation.mutate({
                                        id: scene.id,
                                        data: { status: "confirmed", source: scene.source }
                                    })
                                }
                            >
                                <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                title="Reject suggestion"
                                onClick={() => updateMutation.mutate({ id: scene.id, data: { status: "rejected" } })}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Delete"
                            onClick={() => deleteMutation.mutate(scene.id)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            <OutlineItemDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                itemType="scene"
                initialValues={scene}
                onSubmit={data => updateMutation.mutate({ id: scene.id, data })}
            />
        </div>
    );
}
