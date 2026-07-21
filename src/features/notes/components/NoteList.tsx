import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { type MouseEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";
import { useCreateNoteMutation, useDeleteNoteMutation, useNotesByStoryQuery, useUpdateNoteMutation } from "../hooks/useNotesQuery";
import { NOTE_TYPES, NoteFormDialog } from "./NoteFormDialog";
import { NoteListItem } from "./NoteListItem";

interface NoteListProps {
    storyId: string;
    selectedNoteId: string | null;
    onSelectNote: (note: Note | null) => void;
}

// K0 — pinned notes float to the top regardless of the active sort/filter, then most-recently
// updated first within each group.
const sortNotes = (notes: Note[]): Note[] =>
    [...notes].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

export default function NoteList({ storyId, selectedNoteId, onSelectNote }: NoteListProps) {
    const { data: notes = [] } = useNotesByStoryQuery(storyId);
    const createNoteMutation = useCreateNoteMutation();
    const updateNoteMutation = useUpdateNoteMutation();
    const deleteNoteMutation = useDeleteNoteMutation();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<Note | null>(null);

    // K0 — client-side filters over the already-fetched story notes list; no new query needed.
    const [typeFilter, setTypeFilter] = useState<Note["type"] | "all">("all");
    const [armedOnly, setArmedOnly] = useState(false);
    const [search, setSearch] = useState("");

    const armedCount = useMemo(() => notes.filter(n => n.includeInAi).length, [notes]);
    const filteredNotes = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sortNotes(
            notes.filter(
                n =>
                    (typeFilter === "all" || n.type === typeFilter) &&
                    (!armedOnly || n.includeInAi) &&
                    (!q || n.title.toLowerCase().includes(q))
            )
        );
    }, [notes, typeFilter, armedOnly, search]);

    const handleDeleteNote = async (noteId: string) => {
        await deleteNoteMutation.mutateAsync(noteId);
        if (selectedNoteId === noteId) onSelectNote(null);
    };

    const handleEditClick = (note: Note, e: MouseEvent) => {
        e.stopPropagation();
        setEditingNote(note);
        setIsEditDialogOpen(true);
    };

    const handleCreateNote = async (title: string, type: Note["type"]) => {
        await createNoteMutation.mutateAsync({ storyId, title, content: "", type });
        setIsNewNoteDialogOpen(false);
    };

    const handleSaveEdit = async (title: string, type: Note["type"]) => {
        if (editingNote)
            await updateNoteMutation.mutateAsync({ id: editingNote.id, data: { title, type } });
        setIsEditDialogOpen(false);
        setEditingNote(null);
    };

    return (
        <div
            className={cn(
                "relative border-r border-input bg-background transition-all duration-300",
                isCollapsed ? "w-[40px]" : "w-[250px] sm:w-[300px]"
            )}
        >
            <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-1/2 transform -translate-y-1/2 z-10
                    bg-background border-input border rounded-full p-1 shadow-sm hover:bg-muted"
            >
                {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-foreground" />
                ) : (
                    <ChevronLeft className="h-4 w-4 text-foreground" />
                )}
            </button>

            <div className={cn("h-full overflow-y-auto", isCollapsed ? "hidden" : "block")}>
                <div className="p-4 border-b border-input space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-foreground">
                            Notes <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>
                        </h2>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsNewNoteDialogOpen(true)}
                            className="flex items-center gap-1"
                        >
                            <Plus className="h-4 w-4" />
                            New Note
                        </Button>
                    </div>
                    <Input placeholder="Search notes..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
                    <div className="flex items-center gap-2">
                        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as Note["type"] | "all")}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                {NOTE_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value}>
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <button
                            type="button"
                            onClick={() => setArmedOnly(v => !v)}
                            className={cn(
                                "flex items-center gap-1 shrink-0 text-xs px-2 h-8 rounded-md border",
                                armedOnly ? "border-primary text-primary bg-primary/10" : "border-input text-muted-foreground"
                            )}
                            title="Show AI-armed notes only"
                        >
                            <Sparkles className="h-3 w-3" />
                            {armedCount}
                        </button>
                    </div>
                </div>
                <ul className="overflow-y-auto flex-1">
                    {notes.length === 0 ? (
                        <li>
                            <EmptyState
                                message="No notes yet"
                                actionLabel="Create Note"
                                onAction={() => setIsNewNoteDialogOpen(true)}
                                className="p-8"
                            />
                        </li>
                    ) : filteredNotes.length === 0 ? (
                        <li className="p-4 text-sm text-muted-foreground text-center">No notes match these filters.</li>
                    ) : (
                        filteredNotes.map(note => (
                            <NoteListItem
                                key={note.id}
                                note={note}
                                isSelected={selectedNoteId === note.id}
                                onSelect={() => onSelectNote(note)}
                                onEdit={e => handleEditClick(note, e)}
                                onDelete={e => {
                                    e.stopPropagation();
                                    handleDeleteNote(note.id);
                                }}
                                onToggleIncludeInAi={e => {
                                    e.stopPropagation();
                                    updateNoteMutation.mutate({ id: note.id, data: { includeInAi: !note.includeInAi } });
                                }}
                                onTogglePinned={e => {
                                    e.stopPropagation();
                                    updateNoteMutation.mutate({ id: note.id, data: { pinned: !note.pinned } });
                                }}
                            />
                        ))
                    )}
                </ul>
            </div>

            <NoteFormDialog
                open={isNewNoteDialogOpen}
                onOpenChange={setIsNewNoteDialogOpen}
                title="Create New Note"
                submitLabel="Create"
                onSubmit={handleCreateNote}
            />

            <NoteFormDialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                title="Edit Note"
                submitLabel="Save"
                initialTitle={editingNote?.title}
                initialType={editingNote?.type}
                onSubmit={handleSaveEdit}
            />
        </div>
    );
}
