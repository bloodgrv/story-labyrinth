import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DraggableLeaf } from "@/features/folders/components/DraggableLeaf";
import { MoveToFolderDialog } from "@/features/folders/components/MoveToFolderDialog";
import { useFoldersQuery } from "@/features/folders/hooks/useFoldersQuery";
import { getDescendantFolderIds, getFolderPath } from "@/features/folders/lib/folderTree";
import { useNotesBrowseView } from "@/lib/useNotesBrowseView";
import { usePersistedState } from "@/lib/usePersistedState";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";
import { useCreateNoteMutation, useDeleteNoteMutation, useUpdateNoteMutation } from "../hooks/useNotesQuery";
import { NoteCard } from "./NoteCard";
import { NOTE_TYPES, NoteFormDialog } from "./NoteFormDialog";
import { NotesFolderSidebar } from "./NotesFolderSidebar";
import { NoteRow } from "./NoteRow";
import { NotesStarterFolderSeeds } from "./NotesStarterFolderSeeds";

// Must be a stable reference (see LorebookBrowsePanel.tsx's own comment) — a fresh object every
// render defeats useSensor's memoization.
const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 };

type Pile = "all" | "unfiled" | "pinned" | "armed" | "recent";
const RECENT_DAYS = 14;

const isRecent = (updatedAt: Date | string) => Date.now() - new Date(updatedAt).getTime() <= RECENT_DAYS * 24 * 60 * 60 * 1000;

interface NotesBrowsePaneProps {
    storyId: string;
    notes: Note[];
    onOpenNote: (note: Note) => void;
}

// Notes Browse — the large-pane home (T7, docs/Notes_Org_Browse_Design.md NO2-NO5): folder
// sidebar + toolbar (search title+body, type, piles, this-folder-only, Cards|List) + Cards or
// List of leaves. Replaces NoteList.tsx's sidebar-list-only shell.
export function NotesBrowsePane({ storyId, notes, onOpenNote }: NotesBrowsePaneProps) {
    const createNoteMutation = useCreateNoteMutation();
    const updateNoteMutation = useUpdateNoteMutation();
    const deleteNoteMutation = useDeleteNoteMutation();
    const { data: folders = [] } = useFoldersQuery({ kind: "notes", scopeId: storyId });

    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [includeDescendants, setIncludeDescendants] = useState(true);
    const [thisFolderOnly, setThisFolderOnly] = useState(false);
    const [pile, setPile] = usePersistedState<Pile>("sn-notes-pile", "all", (v): v is Pile =>
        v === "all" || v === "unfiled" || v === "pinned" || v === "armed" || v === "recent"
    );
    const [typeFilter, setTypeFilter] = usePersistedState<Note["type"] | "all">(
        "sn-notes-type-filter",
        "all",
        (v): v is Note["type"] | "all" => v === "all" || NOTE_TYPES.some(t => t.value === v)
    );
    const [search, setSearch] = useState("");
    const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
    const [movingNoteId, setMovingNoteId] = useState<string | null>(null);

    const [view, setView] = useNotesBrowseView(notes.length);

    const armedCount = useMemo(() => notes.filter(n => n.includeInAi).length, [notes]);

    const descendantFolderIds = selectedFolderId ? getDescendantFolderIds(folders, selectedFolderId) : null;

    const isSearching = search.trim().length > 0;
    // Search defaults to whole-desk scope even while a folder is selected — "this folder only"
    // opts back into folder scoping while searching (design doc §"Search / piles", lock #6).
    // Outside of search, folder selection always scopes normally.
    const applyFolderScope = !isSearching || thisFolderOnly;

    const filteredNotes = useMemo(() => {
        const q = search.trim().toLowerCase();
        return notes
            .filter(n => {
                if (typeFilter !== "all" && n.type !== typeFilter) return false;
                if (pile === "unfiled" && n.folderId) return false;
                if (pile === "pinned" && !n.pinned) return false;
                if (pile === "armed" && !n.includeInAi) return false;
                if (pile === "recent" && !isRecent(n.updatedAt)) return false;
                if (applyFolderScope && selectedFolderId) {
                    const matchesFolder = includeDescendants
                        ? !!n.folderId && descendantFolderIds?.has(n.folderId)
                        : n.folderId === selectedFolderId;
                    if (!matchesFolder) return false;
                }
                if (q && !n.title.toLowerCase().includes(q) && !n.content.toLowerCase().includes(q)) return false;
                return true;
            })
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
    }, [notes, typeFilter, pile, selectedFolderId, includeDescendants, descendantFolderIds, applyFolderScope, search]);

    // Crumb helps orient results that aren't folder-scoped — either no folder selected, or a
    // desk-wide search ignoring the current folder selection.
    const showFolderCrumb = !selectedFolderId || (isSearching && !thisFolderOnly);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }));
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeData = active.data.current as { type?: string; leafId?: string } | undefined;
        const overData = over.data.current as { type?: string; targetFolderId?: string | null } | undefined;
        if (activeData?.type !== "note" || overData?.type !== "notes-folder") return;
        updateNoteMutation.mutate({ id: activeData.leafId as string, data: { folderId: overData.targetFolderId ?? null } });
    };

    const handleCreateNote = async (title: string, type: Note["type"]) => {
        await createNoteMutation.mutateAsync({ storyId, title, content: "", type, folderId: selectedFolderId });
        setIsNewNoteDialogOpen(false);
    };

    const movingNote = notes.find(n => n.id === movingNoteId) ?? null;

    return (
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-4">
            <div className="shrink-0 flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold text-foreground">
                    Notes <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>
                </h2>
                <Button variant="gradient" size="sm" onClick={() => setIsNewNoteDialogOpen(true)} className="flex items-center gap-1">
                    <Plus className="h-4 w-4" />
                    New Note
                </Button>
            </div>

            {folders.length === 0 && <div className="shrink-0"><NotesStarterFolderSeeds storyId={storyId} /></div>}

            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <Input
                    placeholder="Search title & body..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 text-sm max-w-xs"
                />
                {isSearching && selectedFolderId && (
                    <div className="flex items-center gap-1.5">
                        <Switch id="notes-this-folder-only" checked={thisFolderOnly} onCheckedChange={setThisFolderOnly} />
                        <Label htmlFor="notes-this-folder-only" className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                            This folder only
                        </Label>
                    </div>
                )}
                <Select value={pile} onValueChange={v => setPile(v as Pile)}>
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unfiled">Unfiled</SelectItem>
                        <SelectItem value="pinned">Pinned</SelectItem>
                        <SelectItem value="armed">Armed ({armedCount})</SelectItem>
                        <SelectItem value="recent">Recent</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={v => setTypeFilter(v as Note["type"] | "all")}>
                    <SelectTrigger className="h-8 text-xs w-[120px]">
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
                <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
                    <Button
                        variant={view === "cards" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setView("cards")}
                        title="Card view"
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={view === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setView("list")}
                        title="List view"
                    >
                        <ListIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <div className="flex-1 min-h-0 flex gap-4">
                    <NotesFolderSidebar
                        storyId={storyId}
                        selectedFolderId={selectedFolderId}
                        onSelectFolder={setSelectedFolderId}
                        includeDescendants={includeDescendants}
                        onIncludeDescendantsChange={setIncludeDescendants}
                    />

                    {/* Scrolls independently of the folder sidebar to its left — dragging a note
                        into a folder that's scrolled out of the main list's view (or vice versa)
                        shouldn't require both panes to be at the same scroll position. */}
                    <div className="min-w-0 flex-1 overflow-y-auto">
                        {notes.length === 0 ? (
                            <EmptyState
                                message="No notes yet"
                                actionLabel="Create Note"
                                onAction={() => setIsNewNoteDialogOpen(true)}
                                className="p-8"
                            />
                        ) : filteredNotes.length === 0 ? (
                            <div className="p-8 text-sm text-muted-foreground text-center">No notes match these filters.</div>
                        ) : view === "cards" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredNotes.map(note => (
                                    <DraggableLeaf key={note.id} id={note.id} data={{ type: "note", leafId: note.id }}>
                                        <NoteCard
                                            note={note}
                                            folderPath={showFolderCrumb ? getFolderPath(folders, note.folderId) : []}
                                            onOpen={() => onOpenNote(note)}
                                            onTogglePinned={e => {
                                                e.stopPropagation();
                                                updateNoteMutation.mutate({ id: note.id, data: { pinned: !note.pinned } });
                                            }}
                                            onToggleIncludeInAi={e => {
                                                e.stopPropagation();
                                                updateNoteMutation.mutate({ id: note.id, data: { includeInAi: !note.includeInAi } });
                                            }}
                                            onMoveTo={e => {
                                                e.stopPropagation();
                                                setMovingNoteId(note.id);
                                            }}
                                            onDelete={e => {
                                                e.stopPropagation();
                                                deleteNoteMutation.mutate(note.id);
                                            }}
                                        />
                                    </DraggableLeaf>
                                ))}
                            </div>
                        ) : (
                            <ul className={cn("border rounded-md overflow-hidden")}>
                                {filteredNotes.map(note => (
                                    <DraggableLeaf key={note.id} id={note.id} data={{ type: "note", leafId: note.id }}>
                                        <NoteRow
                                            note={note}
                                            folderPath={showFolderCrumb ? getFolderPath(folders, note.folderId) : []}
                                            onOpen={() => onOpenNote(note)}
                                            onTogglePinned={e => {
                                                e.stopPropagation();
                                                updateNoteMutation.mutate({ id: note.id, data: { pinned: !note.pinned } });
                                            }}
                                            onToggleIncludeInAi={e => {
                                                e.stopPropagation();
                                                updateNoteMutation.mutate({ id: note.id, data: { includeInAi: !note.includeInAi } });
                                            }}
                                            onMoveTo={e => {
                                                e.stopPropagation();
                                                setMovingNoteId(note.id);
                                            }}
                                            onDelete={e => {
                                                e.stopPropagation();
                                                deleteNoteMutation.mutate(note.id);
                                            }}
                                        />
                                    </DraggableLeaf>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </DndContext>

            <NoteFormDialog
                open={isNewNoteDialogOpen}
                onOpenChange={setIsNewNoteDialogOpen}
                title="Create New Note"
                submitLabel="Create"
                onSubmit={handleCreateNote}
            />

            {movingNote && (
                <MoveToFolderDialog
                    open
                    onOpenChange={open => !open && setMovingNoteId(null)}
                    folders={folders}
                    currentFolderId={movingNote.folderId ?? null}
                    title={`Move "${movingNote.title}" to…`}
                    onSelect={folderId => {
                        updateNoteMutation.mutate({ id: movingNote.id, data: { folderId } });
                        setMovingNoteId(null);
                    }}
                />
            )}
        </div>
    );
}
