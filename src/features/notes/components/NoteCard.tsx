import { Pin, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Note } from "@/types/story";
import { notePreviewText } from "../lib/notePreview";
import { getNoteTypeLabel } from "./NoteFormDialog";
import { NoteLeafActions } from "./NoteLeafActions";

interface NoteCardProps {
    note: Note;
    folderPath: string[];
    onOpen: () => void;
    onTogglePinned: (e: MouseEvent) => void;
    onToggleIncludeInAi: (e: MouseEvent) => void;
    onMoveTo: (e: MouseEvent) => void;
    onDelete: (e: MouseEvent) => void;
}

// Notes Browse card (T7, docs/Notes_Org_Browse_Design.md NO2/NO7): title · type · pin/armed ·
// 1-2 line plain preview · folder crumb · tag chips.
export function NoteCard({ note, folderPath, onOpen, onTogglePinned, onToggleIncludeInAi, onMoveTo, onDelete }: NoteCardProps) {
    return (
        <Card
            role="option"
            tabIndex={0}
            aria-selected={false}
            className="p-4 cursor-pointer hover:border-primary/40 transition-colors group relative flex flex-col gap-2"
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") onOpen();
            }}
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium truncate flex items-center gap-1 min-w-0">
                    {note.pinned && <Pin className="h-3 w-3 shrink-0 text-primary fill-current" />}
                    <span className="truncate">{note.title}</span>
                </span>
                {note.includeInAi && (
                    <Badge variant="outline" className="gap-1 font-normal text-xs shrink-0">
                        <Sparkles className="h-3 w-3" />
                        AI
                    </Badge>
                )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{getNoteTypeLabel(note.type)}</span>
                {folderPath.length > 0 && <span className="truncate">{folderPath.join(" / ")}</span>}
            </div>

            {note.content && <p className="text-xs text-muted-foreground line-clamp-2">{notePreviewText(note.content)}</p>}

            {(note.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {(note.tags ?? []).map(tag => (
                        <Badge key={tag} variant="secondary" className="font-normal text-xs">
                            {tag}
                        </Badge>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">{new Date(note.updatedAt).toLocaleDateString()}</span>
                <NoteLeafActions
                    note={note}
                    onTogglePinned={onTogglePinned}
                    onToggleIncludeInAi={onToggleIncludeInAi}
                    onMoveTo={onMoveTo}
                    onDelete={onDelete}
                />
            </div>
        </Card>
    );
}
