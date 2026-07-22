import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { debounce } from "lodash";
import { useEffect, useMemo } from "react";
import { useEditorChapterId } from "@/features/editor-multiview/context/EditorPaneContext";
import { reportChapterWordCount } from "@/lib/chapterWordCountStore";
import { countWords } from "@/utils/textUtils";
import { useToolbarState } from "../../context/ToolbarContext";

export function WordCountPlugin() {
    const [editor] = useLexicalComposerContext();
    const { updateToolbarState } = useToolbarState();
    const chapterId = useEditorChapterId();

    // Stable debounced fn — previous version wrapped debounce in useCallback(() => debounce(...))()
    // so a *new* debounced instance was created every render (effect thrash + cancel on the wrong fn → stuck at 0).
    const updateWordCount = useMemo(
        () =>
            debounce(() => {
                let text = "";
                editor.getEditorState().read(() => {
                    text = $getRoot().getTextContent();
                });
                const count = countWords(text);
                updateToolbarState("wordCount", count);
                if (chapterId) reportChapterWordCount(chapterId, count);
            }, 500),
        [editor, updateToolbarState, chapterId]
    );

    useEffect(() => {
        const unregister = editor.registerUpdateListener(() => {
            updateWordCount();
        });
        // Initial count for already-loaded chapter content (update listener alone can lag first paint).
        updateWordCount();
        return () => {
            unregister();
            updateWordCount.cancel();
        };
    }, [editor, updateWordCount]);

    return null;
}
