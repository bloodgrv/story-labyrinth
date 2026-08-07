import { Check, ChevronsUpDown, MessageSquare, Plus, StickyNote, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import NoteEditor from "@/features/notes/components/NoteEditor";
import NoteList from "@/features/notes/components/NoteList";
import { NotesChatRail } from "@/features/notes/components/NotesChatRail";
import { useCreateNoteMutation, useNotesByStoryQuery } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";

// P0.4 K4 — "Import dump" is the concrete UI entry point for K2's split-dump capability, not a
// separate mechanism: paste a block of text, it seeds the Notes chat composer (the same
// pendingChatComposerSeed/initialComposerText pattern already proven for Outline/Research
// handoffs) and opens the chat rail so the user can send it and review the resulting
// note-split-proposal in the tray. No standalone non-chat-driven import path.
const ImportDumpDialog = ({
    open,
    onOpenChange,
    onSubmit
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (text: string) => void;
}) => {
    const [text, setText] = useState("");
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import dump</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Paste a block of material — the Notes chat will propose splitting it into separate notes for you to accept.
                </p>
                <Textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Paste your dump here..."
                    className="min-h-[200px]"
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!text.trim()}
                        onClick={() => {
                            onSubmit(text.trim());
                            setText("");
                            onOpenChange(false);
                        }}
                    >
                        Send to Notes chat
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const NotesTool = () => {
    const { currentStoryId, setPendingChatComposerSeed, pendingNoteId, setPendingNoteId } = useStoryContext();
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

    // Story Timeline (T6, TL3) — a linked pin's "open" action for a note (PinCard.tsx). Same
    // consume-once pattern MapsTool.tsx uses for pendingMapId.
    useEffect(() => {
        if (pendingNoteId) {
            setSelectedNoteId(pendingNoteId);
            setPendingNoteId(null);
        }
    }, [pendingNoteId, setPendingNoteId]);
    const [mobileOpen, setMobileOpen] = useState(false);
    // K1 — the Notes chat rail is optional/toggleable (design doc §7: "Optional Notes chat rail
    // (open/close) — not required for CRUD"), unlike WB/Outline's always-docked panels.
    const [chatOpen, setChatOpen] = useState(false);
    const [importDumpOpen, setImportDumpOpen] = useState(false);
    const { data: notes = [] } = useNotesByStoryQuery(currentStoryId || "");
    const createNoteMutation = useCreateNoteMutation();

    const selectedNote = notes.find(n => n.id === selectedNoteId) || null;

    const handleSelectNote = (note: Note | null) => {
        setSelectedNoteId(note?.id || null);
    };

    const handleCreateNote = () => {
        if (!currentStoryId) return;
        createNoteMutation.mutate(
            {
                storyId: currentStoryId,
                title: `New Note ${new Date().toLocaleString()}`,
                content: "",
                type: "idea"
            },
            {
                onSuccess: newNote => {
                    setSelectedNoteId(newNote.id);
                    setMobileOpen(false);
                }
            }
        );
    };

    const handleImportDump = (text: string) => {
        setPendingChatComposerSeed({ tool: "notes", text });
        setChatOpen(true);
    };

    if (!currentStoryId)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">No story selected</p>
            </div>
        );


    return (
        <LorebookProvider storyId={currentStoryId}>
        <div className="h-full flex flex-col">
            <div className="p-2 border-b flex items-center justify-end gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setImportDumpOpen(true)} className="flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    Import dump
                </Button>
                <Button
                    variant={chatOpen ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChatOpen(v => !v)}
                    className="flex items-center gap-1"
                >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                </Button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                {/* Mobile: dropdown note selector */}
                <div className="md:hidden p-2 border-b flex gap-2">
                    <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={mobileOpen}
                                aria-controls="notes-listbox"
                                className="flex-1 justify-between"
                            >
                                <span className="truncate">{selectedNote ? selectedNote.title : "Select note..."}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="start">
                            <Command id="notes-listbox">
                                <CommandInput placeholder="Search notes..." />
                                <CommandList>
                                    <CommandEmpty>No notes found.</CommandEmpty>
                                    <CommandGroup>
                                        {notes.map(note => (
                                            <CommandItem
                                                key={note.id}
                                                value={note.title}
                                                onSelect={() => {
                                                    handleSelectNote(note);
                                                    setMobileOpen(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedNoteId === note.id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <span className="truncate">{note.title}</span>
                                                <span className="ml-2 text-xs text-muted-foreground capitalize">
                                                    {note.type}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <Button size="icon" onClick={handleCreateNote} title="New Note">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                {/* Desktop: sidebar */}
                <div className="hidden md:block">
                    <NoteList storyId={currentStoryId} selectedNoteId={selectedNoteId} onSelectNote={handleSelectNote} />
                </div>

                <div className="flex-1 min-h-0 min-w-0">
                    {selectedNoteId ? (
                        <NoteEditor key={selectedNoteId} selectedNoteId={selectedNoteId} />
                    ) : (
                        <div className="flex items-center justify-center h-full flex-col gap-6 text-muted-foreground p-4">
                            <StickyNote className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground/50" />
                            <div className="text-center max-w-md">
                                <h3 className="text-lg md:text-xl font-semibold mb-2">No Note Selected</h3>
                                <p className="mb-6 text-sm md:text-base">Select a note or create a new one.</p>
                                <Button variant="gradient" onClick={handleCreateNote} className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Create New Note
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {chatOpen && (
                    <div className="w-full md:w-[480px] shrink-0 border-t md:border-t-0 md:border-l border-input h-[50vh] md:h-full">
                        <NotesChatRail storyId={currentStoryId} focusedNoteId={selectedNoteId} />
                    </div>
                )}
            </div>

            <ImportDumpDialog open={importDumpOpen} onOpenChange={setImportDumpOpen} onSubmit={handleImportDump} />
        </div>
        </LorebookProvider>
    );
};
