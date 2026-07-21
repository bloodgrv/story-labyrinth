import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { Send, StickyNote } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useEditorStoryId } from "@/features/editor-multiview/context/EditorPaneContext";
import { NoteFormDialog } from "@/features/notes/components/NoteFormDialog";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { Note } from "@/types/story";

interface SaveSelectionAsNoteButtonProps {
    editor: LexicalEditor;
}

const getSelectedText = (editor: LexicalEditor): string => {
    let text = "";
    editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) text = selection.getTextContent();
    });
    return text;
};

// Chapter prose selection → Note (Chat Shuttle H6, docs/Chat_Shuttle_Design.md — "Editor prose
// selection | 'Save as note' / 'Send to Notes chat'"). Unlike the Selection Rework Bridge
// (ReworkButton.tsx), this never opens a chat turn or the pendingReworkStore — it's a direct,
// one-shot capture of the selection's own text, same posture Notes' N5 "Save message as note"
// already established for whole chat messages. Never arms includeInAi (design doc: "Does not
// auto-arm includeInAi").
export function SaveSelectionAsNoteButton({ editor }: SaveSelectionAsNoteButtonProps): JSX.Element {
    const storyId = useEditorStoryId();
    const { setPendingChatComposerSeed, setCurrentTool } = useStoryContext();
    const createNoteMutation = useCreateNoteMutation();
    const [pendingSelectionText, setPendingSelectionText] = useState<string | null>(null);

    const handleSaveAsNote = () => {
        const text = getSelectedText(editor);
        if (!text) {
            toast.error("No text selected");
            return;
        }
        setPendingSelectionText(text);
    };

    const handleSendToNotesChat = () => {
        const text = getSelectedText(editor);
        if (!text) {
            toast.error("No text selected");
            return;
        }
        setPendingChatComposerSeed({ tool: "notes", text });
        setCurrentTool("notes");
    };

    const handleSubmitNote = (title: string, type: Note["type"]) => {
        if (!pendingSelectionText || !storyId) return;
        createNoteMutation.mutate({ storyId, title, content: pendingSelectionText, type });
        setPendingSelectionText(null);
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={handleSaveAsNote} className="flex items-center gap-1">
                <StickyNote className="h-3 w-3" />
                <span>Save as note</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSendToNotesChat} className="flex items-center gap-1">
                <Send className="h-3 w-3" />
                <span>Send to Notes chat</span>
            </Button>
            <NoteFormDialog
                open={pendingSelectionText !== null}
                onOpenChange={open => {
                    if (!open) setPendingSelectionText(null);
                }}
                title="Save selection as note"
                submitLabel="Save note"
                initialTitle={pendingSelectionText?.slice(0, 60) ?? ""}
                onSubmit={handleSubmitNote}
            />
        </>
    );
}
