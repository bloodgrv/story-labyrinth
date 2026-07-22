import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FolderDropZoneProps {
    // "unfiled" is a synthetic drop target id (not a real folder id) representing "clear folderId".
    id: string | "unfiled";
    data: { type: "lorebook-folder" | "chat-folder"; targetFolderId: string | null };
    children: ReactNode;
    className?: string;
}

// Drop target wrapper for a folder row (or the "Unfiled" root row) — highlights while something
// draggable is hovered over it. Shared by the Lorebook folder sidebar and the ChatList folder tree.
export function FolderDropZone({ id, data, children, className }: FolderDropZoneProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `drop:${id}`, data });
    return (
        <div ref={setNodeRef} className={cn(isOver && "bg-primary/10 rounded-md ring-1 ring-primary/40", className)}>
            {children}
        </div>
    );
}
