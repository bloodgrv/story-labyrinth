import { Pin, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";
import { getNoteTypeLabel } from "./NoteFormDialog";
import { NoteLeafActions } from "./NoteLeafActions";

interface NoteRowProps {
    note: Note;
    folderPath: string[];
    onOpen: () => void;
    onTogglePinned: (e: MouseEvent) => void;
    onToggleIncludeInAi: (e: MouseEvent) => void;
    onMoveTo: (e: MouseEvent) => void;
    onDelete: (e: MouseEvent) => void;
}

// Notes Browse list row (T7, docs/Notes_Org_Browse_Design.md NO2/NO7): title · type · pin/armed ·
// folder crumb · tags — no body preview (list rows stay dense). Replaces NoteListItem.tsx.
export function NoteRow({ note, folderPath, onOpen, onTogglePinned, onToggleIncludeInAi, onMoveTo, onDelete }: NoteRowProps) {
    return (
        <li
            role="option"
            tabIndex={0}
            aria-selected={false}
            className="px-4 py-3 border-b border-input hover:bg-muted cursor-pointer relative group"
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") onOpen();
            }}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 shrink-0 text-primary fill-current" />}
                    <span className="text-sm font-medium truncate">{note.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{getNoteTypeLabel(note.type)}</span>
                    {note.includeInAi && (
                        <Badge variant="outline" className="gap-1 font-normal text-xs shrink-0">
                            <Sparkles className="h-3 w-3" />
                            AI
                        </Badge>
                    )}
                    {folderPath.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">{folderPath.join(" / ")}</span>
                    )}
                    {(note.tags ?? []).length > 0 && (
                        <div className="hidden md:flex items-center gap-1 shrink-0">
                            {(note.tags ?? []).slice(0, 3).map(tag => (
                                <Badge key={tag} variant="secondary" className={cn("font-normal text-xs")}>
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                        {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    <NoteLeafActions
                        note={note}
                        onTogglePinned={onTogglePinned}
                        onToggleIncludeInAi={onToggleIncludeInAi}
                        onMoveTo={onMoveTo}
                        onDelete={onDelete}
                    />
                </div>
            </div>
        </li>
    );
}
