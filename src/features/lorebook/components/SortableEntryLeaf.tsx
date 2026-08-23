import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SortableEntryLeafProps {
    id: string;
    // List rows prepend the grip inline (flex layout); Cards overlay it in a corner instead so
    // rank-drag eligibility never changes the grid's own card sizing (Axis 6 "Display: Grid
    // chrome, ordered by Custom" — the grid should look the same whether or not it's draggable).
    variant: "list" | "card";
    children: ReactNode;
}

// Custom drag order (T13, docs/Lorebook_Custom_Order_Design.md) — rank-drag sibling of
// DraggableLeaf.tsx's plain useDraggable, used only when LorebookEntryList decides the visible
// set is rank-drag eligible (Custom sort, single bucket, no active search/All-categories).
// useSortable registers this as both a draggable and a droppable, which is what makes Axis 4's
// dual-drop work for free: the same `data.type: "lorebook-entry"` shape DraggableLeaf uses means
// dropping on a folder still files (LorebookBrowsePanel.tsx's existing folder branch, unaffected),
// while dropping on a sibling row hits its own new "lorebook-entry over lorebook-entry" branch to
// reorder instead.
export function SortableEntryLeaf({ id, variant, children }: SortableEntryLeafProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `entrysort:${id}`,
        data: { type: "lorebook-entry", leafId: id }
    });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                "group/sortable cursor-grab active:cursor-grabbing",
                variant === "list" ? "flex items-center gap-1" : "relative"
            )}
            style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
        >
            {/* Purely decorative — LorebookEntryRow/Card handle their own clicks and hover-reveal
                action buttons, so this never carries its own listeners (Axis 4 "Not: dual handles";
                the whole row/card is the drag surface, this is just the affordance). */}
            <GripVertical
                className={cn(
                    "pointer-events-none shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover/sortable:opacity-100",
                    variant === "list" ? "h-4 w-4" : "absolute left-1.5 top-1.5 z-10 h-4 w-4 rounded bg-background/80"
                )}
            />
            <div className={variant === "list" ? "min-w-0 flex-1" : undefined}>{children}</div>
        </div>
    );
}
