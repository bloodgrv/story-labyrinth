import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { attemptPromise } from "@jfdi/attempt";
import { Flag, GripVertical, LayoutGrid, Rows3 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { groupPinsByTier, sortPins } from "@/features/story-timeline/lib/sortPins";
import type { StoryTimeline, TimelinePin } from "@/types/storyTimeline";
import { useCreatePinMutation, useDeletePinMutation, useUpdatePinMutation, useUpdateTimelineMutation } from "../hooks/useStoryTimelineQuery";
import { PinCard } from "./PinCard";
import { PinFormDialog } from "./PinFormDialog";
import { StoryStartControl } from "./StoryStartControl";

const tierLabel = { civil: "Dated", relative: "Relative to Story-start", fuzzy: "Unordered / fuzzy" };

// Drag-reorder target within the fuzzy tier only — civil/relative tiers sort by their own computed
// values, not manualOrder (sortPins.ts's tiered pipeline), so dragging only makes sense there.
// Listeners/attributes go on a dedicated grip handle (PinCard's dragHandle prop), NOT the whole
// card — wrapping the entire card intercepted every click on its own Edit/Remove/Open-link
// buttons (found live during verification: dnd-kit's PointerSensor swallowed the click before it
// ever reached the button underneath).
function SortablePinCard({ pin, onEdit, onDelete }: { pin: TimelinePin; onEdit: (pin: TimelinePin) => void; onDelete: (pin: TimelinePin) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style}>
            <PinCard
                pin={pin}
                onEdit={onEdit}
                onDelete={onDelete}
                dragHandle={
                    <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 mt-0.5" title="Drag to reorder">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                }
            />
        </div>
    );
}

interface TimelineBoardProps {
    storyId: string;
    timeline: StoryTimeline;
    pins: TimelinePin[];
}

// Story Timeline (T6, TL1/TL4) — sorted pin render, H|V toggle (per-timeline, decision #5),
// Story-start marker chrome. TL0-TL4 scope: single (spine) board only, no board switcher (TL5).
export function TimelineBoard({ storyId, timeline, pins }: TimelineBoardProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editingPin, setEditingPin] = useState<TimelinePin | null>(null);
    const [deletingPin, setDeletingPin] = useState<TimelinePin | null>(null);
    const createMutation = useCreatePinMutation(storyId);
    const updateMutation = useUpdatePinMutation(storyId);
    const deleteMutation = useDeletePinMutation(storyId);
    const updateTimelineMutation = useUpdateTimelineMutation(storyId);

    const sorted = sortPins(pins);
    const groups = groupPinsByTier(sorted);
    const fuzzyPinIds = sorted.filter(p => groupPinsByTier([p])[0]?.tier === "fuzzy").map(p => p.id);

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const fuzzyPins = sorted.filter(p => fuzzyPinIds.includes(p.id));
        const oldIndex = fuzzyPins.findIndex(p => p.id === active.id);
        const newIndex = fuzzyPins.findIndex(p => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(fuzzyPins, oldIndex, newIndex);

        const [error] = await attemptPromise(() =>
            Promise.all(reordered.map((pin, index) => updateMutation.mutateAsync({ id: pin.id, data: { manualOrder: index + 1 } })))
        );
        if (error) toast.error("Failed to reorder pins");
    };

    const handleEdit = (pin: TimelinePin) => {
        setEditingPin(pin);
        setFormOpen(true);
    };

    const handleDelete = (pin: TimelinePin) => setDeletingPin(pin);

    const confirmDelete = () => {
        if (!deletingPin) return;
        deleteMutation.mutate(deletingPin.id, { onSuccess: () => setDeletingPin(null) });
    };

    const handleSubmit = (values: Parameters<NonNullable<React.ComponentProps<typeof PinFormDialog>["onSubmit"]>>[0]) => {
        if (editingPin) updateMutation.mutate({ id: editingPin.id, data: values }, { onSuccess: () => setFormOpen(false) });
        else createMutation.mutate({ ...values, timelineId: timeline.id }, { onSuccess: () => setFormOpen(false) });
    };

    const orientation = timeline.orientation;
    const containerClass =
        orientation === "horizontal" ? "flex flex-row gap-6 overflow-x-auto pb-4" : "flex flex-col gap-6 overflow-y-auto";
    const groupClass = orientation === "horizontal" ? "flex flex-row items-start gap-3 shrink-0" : "flex flex-col items-stretch gap-3";

    return (
        <div className="h-full flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">{timeline.title}</h2>
                <div className="flex items-center gap-2">
                    <StoryStartControl storyId={storyId} timeline={timeline} pins={pins} />
                    <div className="flex rounded-md border overflow-hidden">
                        <Button
                            variant={orientation === "horizontal" ? "secondary" : "ghost"}
                            size="sm"
                            className="rounded-none gap-1.5"
                            title="Horizontal"
                            onClick={() => updateTimelineMutation.mutate({ id: timeline.id, data: { orientation: "horizontal" } })}
                        >
                            <Rows3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant={orientation === "vertical" ? "secondary" : "ghost"}
                            size="sm"
                            className="rounded-none gap-1.5"
                            title="Vertical"
                            onClick={() => updateTimelineMutation.mutate({ id: timeline.id, data: { orientation: "vertical" } })}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Button size="sm" onClick={() => { setEditingPin(null); setFormOpen(true); }}>
                        Add pin
                    </Button>
                </div>
            </div>

            {pins.length === 0 ? (
                <EmptyState
                    message="No pins yet. Add a native pin, or place a chapter, lorebook entry, or note on the timeline."
                    actionLabel="Add pin"
                    onAction={() => { setEditingPin(null); setFormOpen(true); }}
                />
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className={containerClass}>
                        {groups.map((group, groupIndex) => (
                            <div key={`${group.tier}-${groupIndex}`} className={groupClass}>
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                                    {tierLabel[group.tier]}
                                </span>
                                {group.tier === "relative" ? (
                                    <RelativeTierWithMarker
                                        pins={group.pins}
                                        timeline={timeline}
                                        orientation={orientation}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                    />
                                ) : group.tier === "fuzzy" ? (
                                    <SortableContext items={fuzzyPinIds}>
                                        <div className={orientation === "horizontal" ? "flex flex-row gap-3" : "flex flex-col gap-3"}>
                                            {group.pins.map(pin => (
                                                <SortablePinCard key={pin.id} pin={pin} onEdit={handleEdit} onDelete={handleDelete} />
                                            ))}
                                        </div>
                                    </SortableContext>
                                ) : (
                                    <div className={orientation === "horizontal" ? "flex flex-row gap-3" : "flex flex-col gap-3"}>
                                        {group.pins.map(pin => (
                                            <PinCard key={pin.id} pin={pin} onEdit={handleEdit} onDelete={handleDelete} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </DndContext>
            )}

            <PinFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                pin={editingPin}
                onSubmit={handleSubmit}
                isSubmitting={updateMutation.isPending || createMutation.isPending}
            />

            <ConfirmDialog
                open={!!deletingPin}
                onOpenChange={open => { if (!open) setDeletingPin(null); }}
                title="Remove timeline pin?"
                description={deletingPin ? `Remove "${deletingPin.title}" from the timeline?` : ""}
                onConfirm={confirmDelete}
                confirmLabel="Remove"
            />
        </div>
    );
}

// Inserts the "Story starts" marker at relativeOffsetYears=0 within the relative tier — the
// marker always sits there by definition (TL2's sort pipeline note), so no extra resolution is
// needed beyond splitting this already-sorted group at the first non-negative offset.
function RelativeTierWithMarker({
    pins,
    timeline,
    orientation,
    onEdit,
    onDelete
}: {
    pins: TimelinePin[];
    timeline: StoryTimeline;
    orientation: "horizontal" | "vertical";
    onEdit: (pin: TimelinePin) => void;
    onDelete: (pin: TimelinePin) => void;
}) {
    const showMarker = timeline.storyStartMode === "chapter_one" || timeline.storyStartMode === "manual_time";
    const splitIndex = pins.findIndex(p => (p.relativeOffsetYears ?? 0) >= 0);
    const before = splitIndex === -1 ? pins : pins.slice(0, splitIndex);
    const after = splitIndex === -1 ? [] : pins.slice(splitIndex);

    const marker = showMarker ? (
        <div
            className={
                orientation === "horizontal"
                    ? "flex flex-col items-center justify-center px-2 border-l-2 border-r-2 border-primary/50 shrink-0"
                    : "flex flex-row items-center gap-2 py-1 border-t-2 border-b-2 border-primary/50"
            }
        >
            <Flag className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary whitespace-nowrap">Story starts</span>
        </div>
    ) : null;

    const cards = (list: TimelinePin[]) => list.map(pin => <PinCard key={pin.id} pin={pin} onEdit={onEdit} onDelete={onDelete} />);

    return (
        <div className={orientation === "horizontal" ? "flex flex-row items-start gap-3" : "flex flex-col gap-3"}>
            {cards(before)}
            {marker}
            {cards(after)}
        </div>
    );
}
