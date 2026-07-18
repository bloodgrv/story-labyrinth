import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { debounce } from "lodash";
import { useEffect, useRef } from "react";
import { useUpdateVersionContentMutation } from "@/features/chapter-versions/hooks/useChapterVersionsQuery";
import { logger } from "@/utils/logger";

interface SaveChapterVersionContentPluginProps {
    chapterId: string;
    versionId: string;
}

// Forked from SaveChapterContentPlugin (chapters) — same debounce/toJSON shape, scoped to one
// chapterVersions row instead. Deliberately no beat-detection or RAG-reindex side debounces: a
// version is a temp draft, not yet part of the manuscript those exist to serve.
export function SaveChapterVersionContentPlugin({ chapterId, versionId }: SaveChapterVersionContentPluginProps): null {
    const [editor] = useLexicalComposerContext();
    const updateVersionMutation = useUpdateVersionContentMutation(chapterId);

    const saveContentRef = useRef(
        debounce((id: string, content: string) => {
            updateVersionMutation.mutate(
                { versionId: id, content },
                { onError: error => logger.error("SaveChapterVersionContent - Failed to save:", error) }
            );
        }, 1000)
    );

    useEffect(() => {
        const saveContent = saveContentRef.current;

        const removeUpdateListener = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
            const content = JSON.stringify(editorState.toJSON());
            saveContent(versionId, content);
        });

        return () => {
            removeUpdateListener();
            saveContent.cancel();
        };
    }, [editor, versionId]);

    return null;
}
