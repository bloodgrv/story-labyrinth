import { attempt } from "@jfdi/attempt";
import { MessageSquare, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import NoteEditor from "@/features/notes/components/NoteEditor";
import { NotesBrowsePane } from "@/features/notes/components/NotesBrowsePane";
import { NotesChatRail } from "@/features/notes/components/NotesChatRail";
import { type NoteOpenTab, NotesTabStrip } from "@/features/notes/components/NotesTabStrip";
import { useNotesByStoryQuery } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
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

// T7 (NO1, docs/Notes_Org_Browse_Design.md) — sticky Browse + closable note tabs, persisted per
// story, mirrors LorebookPage.tsx's tab-persistence pattern exactly.
const loadStoredTabs = (storageKey: string | null): { tabs: NoteOpenTab[]; activeIndex: number } => {
    if (storageKey) {
        const [, stored] = attempt(() => {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { tabs: NoteOpenTab[]; activeIndex: number };
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed;
            return null;
        });
        if (stored) return stored;
    }
    return { tabs: [{ kind: "browse" }], activeIndex: 0 };
};

export const NotesTool = () => {
    const { currentStoryId, pendingChatComposerSeed, setPendingChatComposerSeed, pendingNoteId, setPendingNoteId } = useStoryContext();
    const tabsStorageKey = currentStoryId ? `notes-tabs-story-${currentStoryId}` : null;

    const [openTabs, setOpenTabs] = useState<NoteOpenTab[]>(() => loadStoredTabs(tabsStorageKey).tabs);
    const [activeTabIndex, setActiveTabIndex] = useState(() => loadStoredTabs(tabsStorageKey).activeIndex);
    const [chatOpen, setChatOpen] = useState(false); // K1 — optional/toggleable, not always-docked
    const [importDumpOpen, setImportDumpOpen] = useState(false);
    const { data: notes = [] } = useNotesByStoryQuery(currentStoryId || "");

    useEffect(() => {
        if (!tabsStorageKey) return;
        attempt(() => localStorage.setItem(tabsStorageKey, JSON.stringify({ tabs: openTabs, activeIndex: activeTabIndex })));
    }, [openTabs, activeTabIndex, tabsStorageKey]);

    // Invalid/deleted note ids (e.g. a note deleted from another tab, or a stale tab from a
    // previous session) are dropped silently on the notes list settling, per design.
    useEffect(() => {
        if (notes.length === 0) return;
        setOpenTabs(prev => {
            const next = prev.filter(t => t.kind === "browse" || notes.some(n => n.id === t.noteId));
            return next.length === prev.length ? prev : next.length > 0 ? next : [{ kind: "browse" }];
        });
    }, [notes]);

    const openNoteTab = (note: Note) => {
        const existingIdx = openTabs.findIndex(t => t.kind === "note" && t.noteId === note.id);
        if (existingIdx >= 0) {
            setActiveTabIndex(existingIdx);
            return;
        }
        setActiveTabIndex(openTabs.length);
        setOpenTabs(prev => [...prev, { kind: "note", noteId: note.id }]);
    };

    const closeTab = (index: number) => {
        if (openTabs[index]?.kind === "browse") return;
        setOpenTabs(prev => prev.filter((_, i) => i !== index));
        setActiveTabIndex(current => {
            if (index < current) return current - 1;
            if (index === current) return Math.max(0, current - 1);
            return current;
        });
    };

    // Story Timeline (T6, TL3) — a linked pin's "open" action for a note (PinCard.tsx). Same
    // consume-once pattern MapsTool.tsx uses for pendingMapId.
    useEffect(() => {
        if (pendingNoteId) {
            const note = notes.find(n => n.id === pendingNoteId);
            if (note) openNoteTab(note);
            setPendingNoteId(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingNoteId, notes, setPendingNoteId]);

    // Brainstorm's "Handoff -> Notes" (and any other pendingChatComposerSeed producer targeting
    // "notes") switches currentTool here but the chat rail is opt-in (chatOpen, K1) — without this,
    // NotesChatRail never mounts to consume the seed and the handoff silently does nothing.
    useEffect(() => {
        if (pendingChatComposerSeed?.tool === "notes") setChatOpen(true);
    }, [pendingChatComposerSeed]);

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

    const activeTab = openTabs[activeTabIndex] ?? openTabs[0];
    // Desk privilege "focused note" (K1) = the active note tab's own note, else null — Browse
    // (even with a selection inside it) doesn't count as "focused" per design.
    const focusedNoteId = activeTab.kind === "note" ? activeTab.noteId : null;

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

                <NotesTabStrip tabs={openTabs} activeIndex={activeTabIndex} notes={notes} onSelect={setActiveTabIndex} onClose={closeTab} />

                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        {activeTab.kind === "note" ? (
                            <NoteEditor key={activeTab.noteId} selectedNoteId={activeTab.noteId} />
                        ) : (
                            <NotesBrowsePane storyId={currentStoryId} notes={notes} onOpenNote={openNoteTab} />
                        )}
                    </div>

                    {chatOpen && (
                        <div className="w-full md:w-[480px] shrink-0 border-t md:border-t-0 md:border-l border-input h-[50vh] md:h-full">
                            <NotesChatRail storyId={currentStoryId} focusedNoteId={focusedNoteId} />
                        </div>
                    )}
                </div>

                <ImportDumpDialog open={importDumpOpen} onOpenChange={setImportDumpOpen} onSubmit={handleImportDump} />
            </div>
        </LorebookProvider>
    );
};
