import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { useEditorChapterId } from "@/features/editor-multiview/context/EditorPaneContext";
import { registerActiveChapterEditor } from "@/lib/activeChapterEditorStore";

// Registers this pane's Lexical editor instance in activeChapterEditorStore so the Editor chat
// rail (which lives outside this composer tree) can insert accepted prose proposals — or apply a
// selection-rework replacement — into whichever chapter's editor is targeted. See
// activeChapterEditorStore.ts.
export default function RegisterActiveEditorPlugin(): null {
    const [editor] = useLexicalComposerContext();
    const chapterId = useEditorChapterId();

    useEffect(() => {
        if (!chapterId) return undefined;
        return registerActiveChapterEditor(chapterId, editor);
    }, [editor, chapterId]);

    return null;
}
