import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bot, Check, ChevronDown, ChevronUp, GripVertical, MessageSquarePlus, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutlineCharacterChips } from "@/features/outline/components/OutlineCharacterChips";
import { OutlineItemDialog } from "@/features/outline/components/OutlineItemDialog";
import { OutlineSceneRow } from "@/features/outline/components/OutlineSceneRow";
import {
    useCreateOutlineItemMutation,
    useDeleteOutlineItemMutation,
    useReorderOutlineMutation,
    useUpdateOutlineItemMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { captureOutlineItemTarget } from "@/features/rework/adapters/outlineItemAdapter";
import { requestRework } from "@/features/rework/pendingReworkStore";
import { cn } from "@/lib/utils";
import type { OutlineItem } from "@/types/outline";
import type { LorebookEntry } from "@/types/story";

interface OutlineChapterCardProps {
    chapter: OutlineItem;
    scenes: OutlineItem[];
    allChapters: OutlineItem[];
    storyId: string;
    characters: LorebookEntry[];
    onMoveSceneToChapter: (sceneId: string, newChapterId: string) => void;
}

export function OutlineChapterCard({
    chapter,
    scenes,
    allChapters,
    storyId,
    characters,
    onMoveSceneToChapter
}: OutlineChapterCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [addSceneOpen, setAddSceneOpen] = useState(false);

    const updateMutation = useUpdateOutlineItemMutation(storyId);
    const deleteMutation = useDeleteOutlineItemMutation(storyId);
    const createMutation = useCreateOutlineItemMutation(storyId);
    const reorderMutation = useReorderOutlineMutation(storyId);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const isPending = chapter.status === "pending";

    // R8 — whole-row rework, binds to the Outline chat (OutlineChatRail.tsx's pendingReworkStore
    // consumption effect). Neighbor context = adjacent chapters in story order; chapters have no
    // parent of their own (unlike scenes).
    const handleRework = () => {
        const index = allChapters.findIndex(c => c.id === chapter.id);
        const { target, packet } = captureOutlineItemTarget(
            chapter,
            undefined,
            allChapters[index - 1],
            allChapters[index + 1]
        );
        requestRework({ panel: "outline", anchorId: storyId, storyId, target, packet });
    };

    // Scenes reorder within their own chapter via a dedicated, chapter-scoped DndContext — moving
    // a scene to a DIFFERENT chapter is a separate explicit control (the "Move to chapter" select
    // on each OutlineSceneRow), not a cross-context drag. See DECISIONS.md for why.
    const handleSceneDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = scenes.findIndex(scene => scene.id === active.id);
        const newIndex = scenes.findIndex(scene => scene.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(scenes, oldIndex, newIndex);
        reorderMutation.mutate(
            reordered.map((scene, index) => ({ id: scene.id, parentId: chapter.id, order: index + 1 }))
        );
    };

    const handleAddScene = (data: { title: string; summary: string | null; wordCountTarget: number | null }) => {
        createMutation.mutate({
            storyId,
            parentId: chapter.id,
            type: "scene",
            title: data.title,
            summary: data.summary,
            wordCountTarget: data.wordCountTarget,
            order: scenes.length + 1,
            source: "manual",
            status: "confirmed",
            chapterId: null
        });
    };

    return (
        <div ref={setNodeRef} style={style} className="space-y-2">
            <div
                className={cn(
                    "rounded-lg border p-3",
                    isPending && "border-dashed border-amber-400/60 bg-amber-500/10"
                )}
            >
                <div className="flex items-start gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-6 shrink-0 cursor-grab p-0 active:cursor-grabbing"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setExpanded(value => !value)}
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                            <h3 className="truncate text-base font-semibold">
                                {chapter.order}. {chapter.title}
                            </h3>
                            {chapter.wordCountTarget ? (
                                <Badge variant="secondary" className="font-normal">
                                    ~{chapter.wordCountTarget.toLocaleString()} words
                                </Badge>
                            ) : null}
                            <Badge variant="outline" className="font-normal">
                                {scenes.length} scene{scenes.length === 1 ? "" : "s"}
                            </Badge>
                            {chapter.includeInAi && (
                                <Badge variant="outline" className="gap-1 font-normal">
                                    <Bot className="h-3 w-3" />
                                    In AI context
                                </Badge>
                            )}
                        </div>
                        {chapter.summary && <p className="text-sm text-muted-foreground">{chapter.summary}</p>}
                        <OutlineCharacterChips outlineItemId={chapter.id} storyId={storyId} characters={characters} />
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        {!isPending && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Add scene"
                                onClick={() => setAddSceneOpen(true)}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        )}
                        {!isPending && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className={cn("h-8 w-8", chapter.includeInAi && "text-primary")}
                                title={chapter.includeInAi ? "Exclude from AI chats" : "Include in AI chats (non-canon working material)"}
                                onClick={() =>
                                    updateMutation.mutate({ id: chapter.id, data: { includeInAi: !chapter.includeInAi } })
                                }
                            >
                                <Bot className="h-4 w-4" />
                            </Button>
                        )}
                        {!isPending && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Rework in chat" onClick={handleRework}>
                                <MessageSquarePlus className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => setEditOpen(true)}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        {isPending ? (
                            <>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-green-600"
                                    title="Accept suggestion"
                                    onClick={() =>
                                        updateMutation.mutate({ id: chapter.id, data: { status: "confirmed" } })
                                    }
                                >
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive"
                                    title="Reject suggestion"
                                    onClick={() =>
                                        updateMutation.mutate({ id: chapter.id, data: { status: "rejected" } })
                                    }
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Delete"
                                onClick={() => deleteMutation.mutate(chapter.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {expanded && scenes.length > 0 && (
                    <div className="ml-8 mt-3 space-y-1.5">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSceneDragEnd}>
                            <SortableContext
                                items={scenes.map(scene => scene.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {scenes.map(scene => (
                                    <OutlineSceneRow
                                        key={scene.id}
                                        scene={scene}
                                        storyId={storyId}
                                        chapters={allChapters}
                                        characters={characters}
                                        onMoveToChapter={onMoveSceneToChapter}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                )}
            </div>

            <OutlineItemDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                itemType="chapter"
                initialValues={chapter}
                onSubmit={data => updateMutation.mutate({ id: chapter.id, data })}
            />
            <OutlineItemDialog
                open={addSceneOpen}
                onOpenChange={setAddSceneOpen}
                itemType="scene"
                onSubmit={handleAddScene}
            />
        </div>
    );
}
