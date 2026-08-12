import debounce from "lodash/debounce";
import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Editor from "react-simple-wysiwyg";
import { Button } from "@/components/ui/button";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { cn } from "@/lib/utils";
import type { Chapter, ChapterNotes, Note } from "@/types/story";
import { useUpdateChapterMutation } from "../hooks/useChaptersQuery";

interface ChapterNotesEditorProps {
    chapter: Chapter;
    onClose: () => void;
}

// "Scribble" — a scratch pad tied to this one chapter (`chapters.notes`, a single JSON blob), not
// the story-wide Notes desk (`notes` table). Deliberately never RAG-indexed or chat-visible — the
// only bridge between the two is this explicit one-shot "Send to Notes" convert, mirroring
// SaveSelectionAsNoteButton.tsx's chapter-prose-selection "Save as note" pattern exactly (same
// NoteFormDialog, same direct createNoteMutation call, no desk-transfer log — that precedent only
// logs the chat-seed variant, not a direct-creation one).
export function ChapterNotesEditor({ chapter, onClose: _onClose }: ChapterNotesEditorProps) {
    const updateChapterMutation = useUpdateChapterMutation();
    const createNoteMutation = useCreateNoteMutation();
    const [content, setContent] = useState(chapter?.notes?.content || "");
    const [lastSavedContent, setLastSavedContent] = useState(chapter?.notes?.content || "");
    const [sendDialogOpen, setSendDialogOpen] = useState(false);

    // Create a debounced save function
    const debouncedSave = useMemo(
        () =>
            debounce(async (newContent: string) => {
                if (!chapter) return;

                const notes: ChapterNotes = {
                    content: newContent,
                    lastUpdated: new Date()
                };

                updateChapterMutation.mutate(
                    {
                        id: chapter.id,
                        data: { notes }
                    },
                    {
                        onSuccess: () => {
                            setLastSavedContent(newContent);
                        }
                    }
                );
            }, 1000),
        [chapter, updateChapterMutation]
    );

    useEffect(() => {
        if (content !== lastSavedContent) debouncedSave(content);
    }, [content, lastSavedContent, debouncedSave]);

    useEffect(
        () => () => {
            debouncedSave.cancel();
        },
        [debouncedSave]
    );

    const handleSubmitNote = (title: string, type: Note["type"]) => {
        if (!content.trim()) return;
        createNoteMutation.mutate({ storyId: chapter.storyId, title, content, type });
        setSendDialogOpen(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    Scratch pad for this chapter only — the AI can't see it unless you send it to Notes.
                    {chapter?.notes && (
                        <> Last updated: {new Date(chapter.notes.lastUpdated).toLocaleString()}</>
                    )}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 flex items-center gap-1"
                    disabled={!content.trim()}
                    onClick={() => setSendDialogOpen(true)}
                >
                    <Send className="h-3 w-3" />
                    <span>Send to Notes</span>
                </Button>
            </div>
            <Editor
                value={content}
                onChange={e => setContent(e.target.value)}
                containerProps={{
                    style: { height: "82vh" },
                    className: cn("prose prose-sm max-w-none", "dark:prose-invert")
                }}
                style={{ height: "100%", overflow: "auto" }}
            />
            <NoteFormDialog
                open={sendDialogOpen}
                onOpenChange={setSendDialogOpen}
                title="Send scribble to Notes"
                submitLabel="Create note"
                initialTitle={chapter.title ? `Scribble — ${chapter.title}` : "Scribble"}
                onSubmit={handleSubmitNote}
            />
        </div>
    );
}
