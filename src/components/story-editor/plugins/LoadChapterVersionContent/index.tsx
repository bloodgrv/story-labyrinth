import { attempt } from "@jfdi/attempt";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useState } from "react";
import { logger } from "@/utils/logger";

interface LoadChapterVersionContentPluginProps {
    versionId: string;
    content: string;
}

// Forked from LoadChapterContentPlugin (chapters), scoped to one chapterVersions row instead —
// takes content directly as a prop (the version list the tab strip already fetched) rather than
// re-querying by id, and only ever sets editor state once per versionId so a background refetch
// of the version list can never blow away in-progress edits.
export function LoadChapterVersionContentPlugin({ versionId, content }: LoadChapterVersionContentPluginProps): null {
    const [editor] = useLexicalComposerContext();
    const [loadedVersionId, setLoadedVersionId] = useState<string | null>(null);

    useEffect(() => {
        if (loadedVersionId === versionId) return;
        queueMicrotask(() => {
            const [error] = attempt(() => {
                const parsedState = editor.parseEditorState(content);
                editor.setEditorState(parsedState);
                setLoadedVersionId(versionId);
            });
            if (error) {
                logger.error("LoadChapterVersionContent - Failed to load content:", error);
                const [recoveryError] = attempt(() => {
                    editor.setEditorState(
                        editor.parseEditorState(
                            '{"root":{"children":[{"children":[],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}'
                        )
                    );
                    setLoadedVersionId(versionId);
                });
                if (recoveryError) logger.error("LoadChapterVersionContent - Recovery failed:", recoveryError);
            }
        });
    }, [editor, versionId, content, loadedVersionId]);

    return null;
}
