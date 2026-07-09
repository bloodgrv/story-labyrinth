import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { debounce } from "lodash";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useDetectBeatsMutation } from "@/features/beats/hooks/useDetectBeatsMutation";
import { useUpdateChapterMutation } from "@/features/chapters/hooks/useChaptersQuery";
import { useEditorChapterId, useEditorStoryId } from "@/features/editor-multiview/context/EditorPaneContext";
import { useAutoDetectBeats } from "@/lib/useAutoDetectBeats";
import { ragApi } from "@/services/api/client";
import { logger } from "@/utils/logger";
import { stripGrammarMarks } from "../../nodes/stripGrammarMarks";

export function SaveChapterContentPlugin(): null {
    const [editor] = useLexicalComposerContext();
    const currentStoryId = useEditorStoryId();
    const currentChapterId = useEditorChapterId();
    const updateChapterMutation = useUpdateChapterMutation();
    const detectBeatsMutation = useDetectBeatsMutation(currentChapterId ?? "");
    const [autoDetectEnabled] = useAutoDetectBeats();

    // Create stable debounced save function using ref
    const saveContentRef = useRef(
        debounce((chapterId: string, content: string) => {
            logger.info("SaveChapterContent - Saving content for chapter:", chapterId);
            updateChapterMutation.mutate(
                { id: chapterId, data: { content } },
                {
                    onSuccess: () => {
                        logger.info("SaveChapterContent - Content saved successfully");
                    },
                    onError: error => {
                        logger.error("SaveChapterContent - Failed to save content:", error);
                    }
                }
            );
        }, 1000)
    );

    // Independent, much-longer debounce so background beat detection doesn't fire on every
    // keystroke-triggered save — only once editing has gone quiet for a while. Kept as its own
    // timer rather than chained off the save mutation's callback, so a detection failure can
    // never affect the actual content-saving path above. Silent on failure/zero-results by
    // design — this runs unattended, unlike the explicit "Suggest Beats" button.
    const detectBeatsRef = useRef(
        debounce((storyId: string) => {
            detectBeatsMutation.mutate(storyId, {
                onSuccess: result => {
                    const count = result.suggestions?.length ?? 0;
                    if (result.success && count > 0)
                        toast.info(`${count} new beat suggestion${count === 1 ? "" : "s"} ready to review`);
                },
                onError: error => {
                    logger.error("SaveChapterContent - Background beat detection failed:", error);
                }
            });
        }, 8000)
    );

    // Independent, long-debounced RAG re-indexing so the Editor chat rail's auto-context can
    // actually find this chapter's prose (indexChapter exists server-side but nothing else
    // triggers it — see chatContextService.ts). Silent on failure by design, same reasoning
    // as background beat detection: this runs unattended and shouldn't interrupt writing.
    const reindexRef = useRef(
        debounce((chapterId: string) => {
            ragApi.indexChapter(chapterId).catch(error => {
                logger.error("SaveChapterContent - Failed to reindex chapter for chat context:", error);
            });
        }, 8000)
    );

    // Register update listener
    useEffect(() => {
        if (!currentChapterId) return undefined;

        const saveContent = saveContentRef.current;
        const detectBeats = detectBeatsRef.current;
        const reindex = reindexRef.current;

        const removeUpdateListener = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
            // Skip if no changes
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
            // Live grammar-check marks are re-applied via their own tagged editor.update() (see
            // GrammarCheckPlugin) — that's a structural change but not new content, so it
            // shouldn't debounce-trigger a save (the content, once stripped below, is unchanged).
            if (tags.has("grammar-check")) return;

            // Get the editor state as JSON, with any live (never-persisted) grammar-check marks
            // stripped out — see stripGrammarMarks.ts for why this guard exists even though the
            // check above already skips grammar-only updates.
            const stateJSON = editorState.toJSON();
            stripGrammarMarks(stateJSON.root);
            const content = JSON.stringify(stateJSON);

            // Save the content
            saveContent(currentChapterId, content);
            reindex(currentChapterId);

            if (autoDetectEnabled && currentStoryId) detectBeats(currentStoryId);
        });

        return () => {
            removeUpdateListener();
            saveContent.cancel();
            detectBeats.cancel();
            reindex.cancel();
        };
    }, [editor, currentChapterId, currentStoryId, autoDetectEnabled]);

    return null;
}
