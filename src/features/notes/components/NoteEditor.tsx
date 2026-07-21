import { MessageSquarePlus, Save } from "lucide-react";
import { useState } from "react";
import Editor from "react-simple-wysiwyg";
import { Button } from "@/components/ui/button";
import { captureNoteItemTarget } from "@/features/rework/adapters/noteItemAdapter";
import { requestRework } from "@/features/rework/pendingReworkStore";
import { cn } from "@/lib/utils";
import { useNoteQuery, useUpdateNoteMutation } from "../hooks/useNotesQuery";

interface NoteEditorProps {
    selectedNoteId: string | null;
}

export default function NoteEditor({ selectedNoteId }: NoteEditorProps) {
    const { data: selectedNote } = useNoteQuery(selectedNoteId || "");
    const updateNoteMutation = useUpdateNoteMutation();

    if (!selectedNoteId || !selectedNote)
        return (
            <div className="h-full flex items-center justify-center text-muted-foreground">
                <p>Select a note to start editing</p>
            </div>
        );


    return <NoteEditorContent note={selectedNote} updateMutation={updateNoteMutation} />;
}

interface NoteEditorContentProps {
    note: { id: string; storyId: string; title: string; content: string; updatedAt: Date };
    updateMutation: ReturnType<typeof useUpdateNoteMutation>;
}

// Strips markup for the rework capture's plain-text preview only — the note's own stored
// content (WYSIWYG HTML) is untouched; this is purely what gets shown in the ReworkCard/sent to
// the model as CURRENT TITLE + CONTENT.
const stripHtml = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function NoteEditorContent({ note, updateMutation }: NoteEditorContentProps) {
    const [content, setContent] = useState(note.content);

    const handleSave = async () => {
        await updateMutation.mutateAsync({
            id: note.id,
            data: { content }
        });
    };

    // P0.4 K2 — whole-note rework, binds to the story's Notes chat (NotesChatRail.tsx's
    // pendingReworkStore consumption effect). No sub-span selection (see noteItemAdapter.ts).
    const handleRework = () => {
        const { target, packet } = captureNoteItemTarget({ id: note.id, title: note.title, content: stripHtml(content) });
        requestRework({ panel: "notes", anchorId: note.id, storyId: note.storyId, target, packet });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="border-b border-input p-4 flex items-center justify-between">
                <div>
                    <h2 className="font-semibold text-foreground">{note.title}</h2>
                    <p className="text-sm text-muted-foreground">
                        Last updated: {new Date(note.updatedAt).toLocaleString()}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleRework} className="flex items-center gap-1">
                        <MessageSquarePlus className="h-3 w-3" />
                        Rework in chat
                    </Button>
                    <Button onClick={handleSave} disabled={updateMutation.isPending} className="flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        Save
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <Editor
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    containerProps={{
                        className: cn("prose prose-sm max-w-none min-h-full", "dark:prose-invert", "overflow-y-auto")
                    }}
                    className="h-full"
                />
            </div>
        </div>
    );
}
