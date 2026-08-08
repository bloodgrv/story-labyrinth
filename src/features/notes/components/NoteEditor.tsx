import { MessageSquarePlus, Save } from "lucide-react";
import { useState } from "react";
import Editor from "react-simple-wysiwyg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { captureNoteItemTarget } from "@/features/rework/adapters/noteItemAdapter";
import { requestRework } from "@/features/rework/pendingReworkStore";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";
import { useNoteQuery, useUpdateNoteMutation } from "../hooks/useNotesQuery";
import { NOTE_TYPES } from "./NoteFormDialog";
import { NoteTagsInput } from "./NoteTagsInput";
import { stripHtml } from "../lib/notePreview";

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
    note: Note;
    updateMutation: ReturnType<typeof useUpdateNoteMutation>;
}

function NoteEditorContent({ note, updateMutation }: NoteEditorContentProps) {
    const [content, setContent] = useState(note.content);
    const [title, setTitle] = useState(note.title);

    const handleSaveTitle = () => {
        const trimmed = title.trim();
        if (!trimmed) {
            setTitle(note.title);
            return;
        }
        if (trimmed !== note.title) updateMutation.mutate({ id: note.id, data: { title: trimmed } });
    };

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
            <div className="border-b border-input p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                    <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="h-8 font-semibold text-foreground max-w-md"
                    />
                    <div className="flex items-center gap-2">
                        <Select value={note.type} onValueChange={type => updateMutation.mutate({ id: note.id, data: { type: type as Note["type"] } })}>
                            <SelectTrigger className="h-7 text-xs w-[110px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {NOTE_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value}>
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                            Last updated: {new Date(note.updatedAt).toLocaleString()}
                        </p>
                    </div>
                    <NoteTagsInput
                        tags={note.tags ?? []}
                        onChange={tags => updateMutation.mutate({ id: note.id, data: { tags } })}
                    />
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
