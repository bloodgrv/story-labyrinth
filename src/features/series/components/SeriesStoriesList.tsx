import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { attemptPromise } from "@jfdi/attempt";
import { GripVertical, PenLine } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/urls";
import { seriesKeys, useSeriesStoriesQuery } from "@/features/series/hooks/useSeriesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { storiesApi } from "@/services/api/client";
import type { Story } from "@/types/story";
import { logger } from "@/utils/logger";

interface SeriesStoryRowProps {
    story: Story;
    index: number;
    onOpenEditor: (e: MouseEvent, storyId: string) => void;
}

function SeriesStoryRow({ story, index, onOpenEditor }: SeriesStoryRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5 bg-background/50"
        >
            <Button
                variant="ghost"
                size="sm"
                className="cursor-grab active:cursor-grabbing shrink-0 h-6 w-6 p-0"
                title="Drag to reorder"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground shrink-0 w-5">{index + 1}.</span>
            <span className="flex-1 min-w-0 truncate text-sm">{story.title}</span>
            <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 shrink-0"
                title="Open Editor"
                onClick={e => onOpenEditor(e, story.id)}
            >
                <PenLine className="h-3 w-3" />
            </Button>
        </div>
    );
}

interface SeriesStoriesListProps {
    seriesId: string;
}

// Book-order listing of a series' stories, with drag-to-reorder (persisted to each story's
// seriesOrder). Embedded inside both series cards (workspace SeriesTool.tsx's inline card and
// the standalone SeriesCard.tsx) — series membership itself is still only set from a story's own
// Edit/Create dialog (its Series field); this list only orders stories already in the series.
export function SeriesStoriesList({ seriesId }: SeriesStoriesListProps) {
    const { data: stories = [] } = useSeriesStoriesQuery(seriesId);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { setCurrentStoryId, setCurrentTool } = useStoryContext();
    // Local optimistic order while a drag's reorder mutations are in flight, so the list doesn't
    // snap back to the stale server order between the drop and the refetch landing.
    const [orderedStories, setOrderedStories] = useState<Story[] | null>(null);

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const displayStories = orderedStories ?? stories;

    const handleOpenEditor = (e: MouseEvent, storyId: string) => {
        e.stopPropagation();
        setCurrentStoryId(storyId);
        setCurrentTool("editor");
        navigate(ROUTES.HOME);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        const activeId = active.id.toString();
        const overId = over?.id.toString();

        if (!over || activeId === overId) return;

        const oldIndex = displayStories.findIndex(story => story.id === activeId);
        const newIndex = displayStories.findIndex(story => story.id === overId);

        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(displayStories, oldIndex, newIndex);
        setOrderedStories(reordered);

        // Bulk-persist every row's new position (not just the moved one), same reasoning as
        // ChaptersTool's own drag handler — a single insert can shift every sibling's index.
        // Calls storiesApi directly rather than useUpdateStoryMutation to avoid an N-toast spam
        // from one drag (that hook's onSuccess toasts on every field update).
        const [error] = await attemptPromise(async () => {
            await Promise.all(reordered.map((story, index) => storiesApi.update(story.id, { seriesOrder: index + 1 })));
        });

        if (error) {
            logger.error("Failed to update series book order:", error);
            toast.error("Failed to update book order");
        }

        await queryClient.invalidateQueries({ queryKey: seriesKeys.stories(seriesId) });
        setOrderedStories(null);
    };

    if (stories.length === 0) return <p className="text-xs text-muted-foreground italic">No stories in this series yet.</p>;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayStories.map(story => story.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                    {displayStories.map((story, index) => (
                        <SeriesStoryRow key={story.id} story={story} index={index} onOpenEditor={handleOpenEditor} />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
