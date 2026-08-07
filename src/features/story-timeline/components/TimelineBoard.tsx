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
import { toPng } from "html-to-image";
import { Download, Flag, GripVertical, LayoutGrid, Loader2, Rows3 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/switch";
import { groupPinsByTier, sortPins } from "@/features/story-timeline/lib/sortPins";
import type { StoryTimeline, TimelinePin } from "@/types/storyTimeline";
import { useCreatePinMutation, useDeletePinMutation, useUpdatePinMutation, useUpdateTimelineMutation } from "../hooks/useStoryTimelineQuery";
import { PinCard } from "./PinCard";
import { PinFormDialog } from "./PinFormDialog";
import { StoryStartControl } from "./StoryStartControl";
import { TimelineOverviewStrip } from "./TimelineOverviewStrip";

const tierLabel = { civil: "Dated", relative: "Relative to Story-start", fuzzy: "Unordered / fuzzy" };
const UNASSIGNED_LANE = "__unassigned__";

// Drag-reorder target within the fuzzy tier only — civil/relative tiers sort by their own computed
// values, not manualOrder (sortPins.ts's tiered pipeline), so dragging only makes sense there.
// Listeners/attributes go on a dedicated grip handle (PinCard's dragHandle prop), NOT the whole
// card — wrapping the entire card intercepted every click on its own Edit/Remove/Open-link
// buttons (found live during verification: dnd-kit's PointerSensor swallowed the click before it
// ever reached the button underneath).
function SortablePinCard({
    storyId,
    pin,
    onEdit,
    onDelete
}: {
    storyId: string;
    pin: TimelinePin;
    onEdit: (pin: TimelinePin) => void;
    onDelete: (pin: TimelinePin) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style}>
            <PinCard
                storyId={storyId}
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

// One tiered strip (civil group -> relative group w/ Story-start marker -> fuzzy group), with its
// own drag-reorder context. Reused both for the plain (no-swimlanes) board and for each lane row
// when swimlanes are on (TL6) — each lane is its own independent tiered strip/drag context.
function TieredBoard({
    storyId,
    pins,
    timeline,
    orientation,
    onEdit,
    onDelete
}: {
    storyId: string;
    pins: TimelinePin[];
    timeline: StoryTimeline;
    orientation: "horizontal" | "vertical";
    onEdit: (pin: TimelinePin) => void;
    onDelete: (pin: TimelinePin) => void;
}) {
    const updateMutation = useUpdatePinMutation(storyId);
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

    const containerClass = orientation === "horizontal" ? "flex flex-row gap-6 overflow-x-auto pb-4" : "flex flex-col gap-6 overflow-y-auto";
    const groupClass = orientation === "horizontal" ? "flex flex-row items-start gap-3 shrink-0" : "flex flex-col items-stretch gap-3";

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className={containerClass}>
                {groups.map((group, groupIndex) => (
                    <div key={`${group.tier}-${groupIndex}`} className={groupClass}>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{tierLabel[group.tier]}</span>
                        {group.tier === "relative" ? (
                            <RelativeTierWithMarker pins={group.pins} timeline={timeline} orientation={orientation} storyId={storyId} onEdit={onEdit} onDelete={onDelete} />
                        ) : group.tier === "fuzzy" ? (
                            <SortableContext items={fuzzyPinIds}>
                                <div className={orientation === "horizontal" ? "flex flex-row gap-3" : "flex flex-col gap-3"}>
                                    {group.pins.map(pin => (
                                        <SortablePinCard key={pin.id} storyId={storyId} pin={pin} onEdit={onEdit} onDelete={onDelete} />
                                    ))}
                                </div>
                            </SortableContext>
                        ) : (
                            <div className={orientation === "horizontal" ? "flex flex-row gap-3" : "flex flex-col gap-3"}>
                                {group.pins.map(pin => (
                                    <PinCard key={pin.id} storyId={storyId} pin={pin} onEdit={onEdit} onDelete={onDelete} />
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </DndContext>
    );
}

interface TimelineBoardProps {
    storyId: string;
    timeline: StoryTimeline;
    pins: TimelinePin[];
}

// Story Timeline (T6, TL1/TL4/TL6) — sorted pin render, H|V toggle (per-timeline, decision #5),
// Story-start marker chrome, swimlanes (TL6). Board switching itself lives in TimelineTool.tsx
// (TL5) — this component always renders exactly one timeline's board.
export function TimelineBoard({ storyId, timeline, pins }: TimelineBoardProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editingPin, setEditingPin] = useState<TimelinePin | null>(null);
    const [deletingPin, setDeletingPin] = useState<TimelinePin | null>(null);
    const [isExportingImage, setIsExportingImage] = useState(false);
    const boardRef = useRef<HTMLDivElement>(null);
    const createMutation = useCreatePinMutation(storyId);
    const updateMutation = useUpdatePinMutation(storyId);
    const deleteMutation = useDeletePinMutation(storyId);
    const updateTimelineMutation = useUpdateTimelineMutation(storyId);

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

    // TL10 — illustration-only export (same "images never SoT" doctrine as Story Map's own
    // handleExportImage, src/features/story-map/components/StoryMapCanvas.tsx). Simpler than that
    // version: this board is a plain scrolling DOM layout, not a pan/zoom React Flow canvas, so no
    // getNodesBounds/getViewportForBounds math is needed — just toPng directly against the ref'd
    // board container. Same timeout race: toPng can hang indefinitely rather than reject in some
    // environments (observed live for the Story Map equivalent).
    const handleExportImage = async () => {
        if (!boardRef.current) return;
        setIsExportingImage(true);
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Image export timed out")), 15_000));
        const [error, dataUrl] = await attemptPromise(() => Promise.race([toPng(boardRef.current!), timeout]));
        setIsExportingImage(false);
        if (error || !dataUrl) {
            toast.error("Failed to export image");
            return;
        }
        const link = document.createElement("a");
        link.download = `timeline-${timeline.title}-${storyId}.png`;
        link.href = dataUrl;
        link.click();
    };

    const orientation = timeline.orientation;

    // TL6 — lanes are inferred from whichever laneId strings appear among THIS timeline's own
    // memberships (no separate lane-definitions table this pass, see DECISIONS.md), sorted
    // alphabetically with "Unassigned" trailing. Swimlanes force a horizontal-per-lane layout —
    // the H|V toggle is hidden while they're on (deliberate simplification, see DECISIONS.md).
    const laneGroups = (() => {
        if (!timeline.swimlanesEnabled) return null;
        const byLane = new Map<string, TimelinePin[]>();
        for (const pin of pins) {
            const laneId = pin.memberships.find(m => m.timelineId === timeline.id)?.laneId ?? UNASSIGNED_LANE;
            const list = byLane.get(laneId) ?? [];
            list.push(pin);
            byLane.set(laneId, list);
        }
        return [...byLane.entries()]
            .sort(([a], [b]) => {
                if (a === UNASSIGNED_LANE) return 1;
                if (b === UNASSIGNED_LANE) return -1;
                return a.localeCompare(b);
            })
            .map(([laneId, laneIdPins]) => ({ label: laneId === UNASSIGNED_LANE ? "Unassigned" : laneId, pins: laneIdPins }));
    })();

    return (
        <div className="h-full flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">{timeline.title}</h2>
                <div className="flex items-center gap-2">
                    <StoryStartControl storyId={storyId} timeline={timeline} pins={pins} />
                    <label className="flex items-center gap-1.5 text-sm px-2">
                        <Switch
                            checked={timeline.swimlanesEnabled}
                            onCheckedChange={checked => updateTimelineMutation.mutate({ id: timeline.id, data: { swimlanesEnabled: checked } })}
                        />
                        Swimlanes
                    </label>
                    {!timeline.swimlanesEnabled && (
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
                    )}
                    {pins.length > 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={isExportingImage}
                            onClick={handleExportImage}
                            title="Export the current board as a PNG image — illustration only, never re-imported"
                        >
                            {isExportingImage ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                            Export as image
                        </Button>
                    )}
                    <Button size="sm" onClick={() => { setEditingPin(null); setFormOpen(true); }}>
                        Add pin
                    </Button>
                </div>
            </div>

            {pins.length > 0 && <TimelineOverviewStrip pins={pins} />}

            {pins.length === 0 ? (
                <EmptyState
                    message="No pins yet. Add a native pin, or place a chapter, lorebook entry, or note on the timeline."
                    actionLabel="Add pin"
                    onAction={() => { setEditingPin(null); setFormOpen(true); }}
                />
            ) : laneGroups ? (
                <div ref={boardRef} className="flex flex-col gap-6 overflow-y-auto bg-background">
                    {laneGroups.map(lane => (
                        <div key={lane.label} className="border-b pb-4 last:border-b-0">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{lane.label}</div>
                            <TieredBoard storyId={storyId} pins={lane.pins} timeline={timeline} orientation="horizontal" onEdit={handleEdit} onDelete={handleDelete} />
                        </div>
                    ))}
                </div>
            ) : (
                <div ref={boardRef} className="bg-background">
                    <TieredBoard storyId={storyId} pins={pins} timeline={timeline} orientation={orientation} onEdit={handleEdit} onDelete={handleDelete} />
                </div>
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
    storyId,
    pins,
    timeline,
    orientation,
    onEdit,
    onDelete
}: {
    storyId: string;
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

    const cards = (list: TimelinePin[]) => list.map(pin => <PinCard key={pin.id} storyId={storyId} pin={pin} onEdit={onEdit} onDelete={onDelete} />);

    return (
        <div className={orientation === "horizontal" ? "flex flex-row items-start gap-3" : "flex flex-col gap-3"}>
            {cards(before)}
            {marker}
            {cards(after)}
        </div>
    );
}
