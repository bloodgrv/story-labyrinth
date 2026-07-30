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
import { stripEphemeralMarks } from "../../nodes/stripEphemeralMarks";

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

        // Defense in depth against a real data-loss bug: an update could in principle fire
        // (mount race, or — before PaneTabContentView.tsx's remount-on-chapterId-change key
        // fix — a reused editor instance carrying a different chapter's stale/blank content)
        // before LoadChapterContentPlugin has actually loaded this chapterId's real content
        // into the editor. Refuse to save anything until we've observed that plugin's own
        // "chapter-load" tagged update for THIS chapterId — see DECISIONS.md's "Editor
        // MultiView — Cross-Chapter Content-Loss Bug" entry.
        let hasSeenLoad = false;

        const removeUpdateListener = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
            // Skip if no changes
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

            if (tags.has("chapter-load")) {
                hasSeenLoad = true;
                return;
            }
            if (!hasSeenLoad) return;

            // Live grammar-check marks and RAG-issue highlights are each re-applied via their own
            // tagged editor.update() (see GrammarCheckPlugin / RagIssueHighlightPlugin) — that's
            // a structural change but not new content, so it shouldn't debounce-trigger a save
            // (the content, once stripped below, is unchanged).
            if (tags.has("grammar-check") || tags.has("rag-issue-highlight")) return;

            // Get the editor state as JSON, with any live (never-persisted) ephemeral marks
            // stripped out — see stripEphemeralMarks.ts for why this guard exists even though the
            // check above already skips mark-only updates.
            const stateJSON = editorState.toJSON();
            stripEphemeralMarks(stateJSON.root);
            const content = JSON.stringify(stateJSON);

            // Save the content
            saveContent(currentChapterId, content);
            reindex(currentChapterId);

            if (autoDetectEnabled && currentStoryId) detectBeats(currentStoryId);
        });

        return () => {
            removeUpdateListener();
            // Flush, don't cancel: this plugin unmounts on every tab/pane switch and every
            // workspace-tool switch (PaneTabContentView keys the whole editor tree by chapterId,
            // and MainContent unmounts the Editor tool entirely for other tools). If a save was
            // still sitting in its 1s debounce window at that moment — e.g. the user pastes/types
            // a big chunk and immediately switches away — `.cancel()` silently threw the content
            // away instead of persisting it, a real data-loss bug. `.flush()` fires it immediately
            // instead. detectBeats/reindex stay cancelled — they're background bookkeeping, not
            // user content, and firing them after unmount serves no purpose.
            saveContent.flush();
            detectBeats.cancel();
            reindex.cancel();
        };
    }, [editor, currentChapterId, currentStoryId, autoDetectEnabled]);

    return null;
}
