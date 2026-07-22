import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface DraggableLeafProps {
    id: string;
    data: { type: "lorebook-entry" | "chat"; leafId: string };
    children: ReactNode;
}

// Thin drag wrapper around an already-styled row/card (LorebookEntryCard/Row, a ChatList item) —
// doesn't touch the wrapped component's own layout, just makes it draggable onto a folder drop
// zone. Simple useDraggable, not a sortable list (B9 plan decision #7: filing, not fine-grained
// sibling reordering — see FolderDropZone.tsx and OutlineTree.tsx's own precedent for why).
export function DraggableLeaf({ id, data, children }: DraggableLeafProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `leaf:${id}`, data });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
        >
            {children}
        </div>
    );
}
