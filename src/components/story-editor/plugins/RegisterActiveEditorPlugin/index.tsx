import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW, FOCUS_COMMAND } from "lexical";
import { useEffect } from "react";
import { useEditorChapterId } from "@/features/editor-multiview/context/EditorPaneContext";
import { registerActiveChapterEditor, setActiveChapterEditor } from "@/lib/activeChapterEditorStore";

// Registers this pane's Lexical editor instance in activeChapterEditorStore so the Editor chat
// rail (which lives outside this composer tree) can insert accepted prose proposals into
// whichever chapter's editor the user last focused. See activeChapterEditorStore.ts.
export default function RegisterActiveEditorPlugin(): null {
    const [editor] = useLexicalComposerContext();
    const chapterId = useEditorChapterId();

    useEffect(() => {
        if (!chapterId) return undefined;
        return registerActiveChapterEditor(chapterId, editor);
    }, [editor, chapterId]);

    useEffect(() => {
        if (!chapterId) return undefined;
        return editor.registerCommand(
            FOCUS_COMMAND,
            () => {
                setActiveChapterEditor(chapterId, editor);
                return false;
            },
            COMMAND_PRIORITY_LOW
        );
    }, [editor, chapterId]);

    return null;
}
