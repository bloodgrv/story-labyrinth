import { FolderInput, Pin, Sparkles, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { PlaceOnTimelineButton } from "@/features/story-timeline/components/PlaceOnTimelineButton";
import type { Note } from "@/types/story";

interface NoteLeafActionsProps {
    note: Note;
    onTogglePinned: (e: MouseEvent) => void;
    onToggleIncludeInAi: (e: MouseEvent) => void;
    onMoveTo: (e: MouseEvent) => void;
    onDelete: (e: MouseEvent) => void;
}

// Shared hover-action row for NoteCard/NoteRow (T7, docs/Notes_Org_Browse_Design.md NO2/NO3) —
// pin · arm · PlaceOnTimeline · Move to… · delete. Extracted so the two leaf presentations never
// drift on which actions exist.
export function NoteLeafActions({ note, onTogglePinned, onToggleIncludeInAi, onMoveTo, onDelete }: NoteLeafActionsProps) {
    return (
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
                tooltip={
                    note.includeInAi
                        ? "Exclude from AI chats"
                        : "Include in AI chats (non-canon working material) — the destination chat's own \"Include Notes\" toggle must also be on. The Notes chat itself always sees every note regardless."
                }
                onClick={onToggleIncludeInAi}
                size="sm"
                className={note.includeInAi ? "text-primary" : undefined}
            />
            <span onClick={e => e.stopPropagation()}>
                <PlaceOnTimelineButton storyId={note.storyId} linkType="note" linkId={note.id} defaultTitle={note.title} compact compactSize="sm" />
            </span>
            <ActionButton icon={FolderInput} tooltip="Move to…" onClick={onMoveTo} size="sm" />
            <ActionButton icon={Trash2} tooltip="Delete note" onClick={onDelete} size="sm" variant="destructive" />
        </div>
    );
}
