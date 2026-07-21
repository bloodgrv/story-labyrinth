import { Edit2, Pin, Sparkles, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";
import { getNoteTypeLabel } from "./NoteFormDialog";

interface NoteListItemProps {
    note: Note;
    isSelected: boolean;
    onSelect: () => void;
    onEdit: (e: MouseEvent) => void;
    onDelete: (e: MouseEvent) => void;
    onToggleIncludeInAi: (e: MouseEvent) => void;
    onTogglePinned: (e: MouseEvent) => void;
}

export const NoteListItem = ({
    note,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
    onToggleIncludeInAi,
    onTogglePinned
}: NoteListItemProps) => (
    <li
        role="option"
        tabIndex={0}
        aria-selected={isSelected}
        className={cn(
            "p-4 border-b border-input hover:bg-muted cursor-pointer relative group",
            isSelected && "bg-muted/50"
        )}
        onClick={onSelect}
        onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") onSelect();
        }}
    >
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate flex items-center gap-1">
                    {note.pinned && <Pin className="h-3 w-3 shrink-0 text-primary fill-current" />}
                    {note.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    {note.includeInAi && (
                        <Badge variant="outline" className="gap-1 font-normal text-xs">
                            <Sparkles className="h-3 w-3" />
                            AI
                        </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{getNoteTypeLabel(note.type)}</span>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{new Date(note.updatedAt).toLocaleDateString()}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionButton
                        icon={Pin}
                        tooltip={note.pinned ? "Unpin" : "Pin to top"}
                        onClick={onTogglePinned}
                        size="sm"
                        className={note.pinned ? "text-primary" : undefined}
                    />
                    <ActionButton
                        icon={Sparkles}
                        tooltip={note.includeInAi ? "Exclude from AI chats" : "Include in AI chats (non-canon working material)"}
                        onClick={onToggleIncludeInAi}
                        size="sm"
                        className={note.includeInAi ? "text-primary" : undefined}
                    />
                    <ActionButton icon={Edit2} tooltip="Edit note" onClick={onEdit} size="sm" />
                    <ActionButton icon={Trash2} tooltip="Delete note" onClick={onDelete} size="sm" variant="destructive" />
                </div>
            </div>
        </div>
    </li>
);
