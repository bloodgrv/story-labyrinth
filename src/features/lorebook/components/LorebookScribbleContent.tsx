import debounce from "lodash/debounce";
import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Editor from "react-simple-wysiwyg";
import { Button } from "@/components/ui/button";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { cn } from "@/lib/utils";
import type { LorebookEntry, Note } from "@/types/story";
import { useUpdateLorebookScribbleMutation } from "../hooks/useLorebookQuery";

interface LorebookScribbleContentProps {
    entry: LorebookEntry;
    storyId?: string;
}

// The actual Scribble editor — explainer copy, WYSIWYG, debounced autosave, "Send to Notes" — kept
// separate from LorebookEntryEditor.tsx's single shared Sheet (`scribbleOpen`) so that Sheet is the
// only place a Scribble UI actually mounts. Both the entry-form button and the WB chat rail's
// "Scribble" icon just call `setScribbleOpen(true)` on that one shared Sheet — the rail icon is a
// plain shortcut (ChatToolsRail's onClick escape hatch), never a second, independent editor
// instance. Only mounted while the Sheet is actually open, same precedent as ChapterNotesEditor.tsx.
export function LorebookScribbleContent({ entry, storyId }: LorebookScribbleContentProps) {
    const [content, setContent] = useState(entry.scribble?.content || "");
    const [lastSavedContent, setLastSavedContent] = useState(entry.scribble?.content || "");
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const updateScribbleMutation = useUpdateLorebookScribbleMutation();
    const createNoteMutation = useCreateNoteMutation();

    const debouncedSave = useMemo(
        () =>
            debounce((newContent: string) => {
                updateScribbleMutation.mutate(
                    { id: entry.id, data: { scribble: { content: newContent, lastUpdated: new Date() } } },
                    { onSuccess: () => setLastSavedContent(newContent) }
                );
            }, 1000),
        [entry.id, updateScribbleMutation]
    );

    useEffect(() => {
        if (content !== lastSavedContent) debouncedSave(content);
    }, [content, lastSavedContent, debouncedSave]);

    useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

    const handleSubmitNote = (title: string, type: Note["type"]) => {
        if (!content.trim() || !storyId) return;
        createNoteMutation.mutate({ storyId, title, content, type });
        setSendDialogOpen(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    Scratch pad for this entry only — the AI can't see it unless you send it to Notes.
                    {entry.scribble && <> Last updated: {new Date(entry.scribble.lastUpdated).toLocaleString()}</>}
                </p>
                {storyId && (
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
                )}
            </div>
            <Editor
                value={content}
                onChange={e => setContent(e.target.value)}
                containerProps={{
                    style: { height: "60vh" },
                    className: cn("prose prose-sm max-w-none", "dark:prose-invert")
                }}
                style={{ height: "100%", overflow: "auto" }}
            />
            {storyId && (
                <NoteFormDialog
                    open={sendDialogOpen}
                    onOpenChange={setSendDialogOpen}
                    title="Send scribble to Notes"
                    submitLabel="Create note"
                    initialTitle={entry.name ? `Scribble — ${entry.name}` : "Scribble"}
                    onSubmit={handleSubmitNote}
                />
            )}
        </div>
    );
}
