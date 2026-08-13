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
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useMemo, useRef } from "react";
import { OutlineChapterCard } from "@/features/outline/components/OutlineChapterCard";
import { useReorderOutlineMutation } from "@/features/outline/hooks/useOutlineQuery";
import { groupOutlineItems } from "@/features/outline/utils/groupOutlineItems";
import type { OutlineItem } from "@/types/outline";
import type { LorebookEntry } from "@/types/story";

interface OutlineTreeProps {
    storyId: string;
    items: OutlineItem[];
    characters: LorebookEntry[];
}

// Top-level chapter reordering lives in its own DndContext here; each chapter's own scene list
// gets its own nested DndContext (see OutlineChapterCard) — two independent sortable scopes
// rather than one unified cross-level tree-DnD system. Moving a scene to a different chapter is
// the one operation that can't be expressed as a drag within either scope alone, so it's a
// dedicated reparent handler (handleMoveSceneToChapter) wired to the row's "Move to chapter"
// select instead — see DECISIONS.md for the full reasoning.
export function OutlineTree({ storyId, items, characters }: OutlineTreeProps) {
    const { chapters, scenesByChapter } = useMemo(() => groupOutlineItems(items), [items]);
    const reorderMutation = useReorderOutlineMutation(storyId);
    // Chapter cards default to collapsed on mount (see OutlineChapterCard.tsx) so a page
    // refresh doesn't re-expand every chapter's scene list — but a chapter created after this
    // tree first mounted (a fresh "Add Chapter" or an AI outline-proposal landing) should still
    // open expanded so the user actually sees what just got added, without needing an extra
    // click. One timestamp captured once per page load, compared against each chapter's own
    // createdAt in OutlineChapterCard's expanded-state initializer.
    const sessionStartedAt = useRef(Date.now()).current;

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleChapterDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = chapters.findIndex(chapter => chapter.id === active.id);
        const newIndex = chapters.findIndex(chapter => chapter.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(chapters, oldIndex, newIndex);
        reorderMutation.mutate(reordered.map((chapter, index) => ({ id: chapter.id, order: index + 1 })));
    };

    const handleMoveSceneToChapter = (sceneId: string, newChapterId: string) => {
        const targetScenes = scenesByChapter.get(newChapterId) ?? [];
        reorderMutation.mutate([{ id: sceneId, parentId: newChapterId, order: targetScenes.length + 1 }]);
    };

    if (chapters.length === 0) return null;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
            <SortableContext items={chapters.map(chapter => chapter.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                    {chapters.map(chapter => (
                        <OutlineChapterCard
                            key={chapter.id}
                            chapter={chapter}
                            scenes={scenesByChapter.get(chapter.id) ?? []}
                            allChapters={chapters}
                            storyId={storyId}
                            characters={characters}
                            onMoveSceneToChapter={handleMoveSceneToChapter}
                            sessionStartedAt={sessionStartedAt}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
