import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import debounce from "lodash/debounce";
import { useEffect, useMemo } from "react";
import { useEditorChapterId } from "@/features/editor-multiview/context/EditorPaneContext";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { useChapterMatching } from "@/features/lorebook/hooks/useChapterMatching";
import { buildTagMap } from "@/features/lorebook/utils/lorebookFilters";
import type { LorebookEntry } from "@/types/story";

export default function LorebookTagPlugin(): null {
    const [editor] = useLexicalComposerContext();
    const { entries } = useLorebookContext();
    const { setMatchedEntries } = useChapterMatching();
    const chapterId = useEditorChapterId();

    const tagMap = useMemo(() => buildTagMap(entries), [entries]);

    useEffect(() => {
        if (!chapterId) return undefined;

        // Clear this chapter's matched entries when the plugin mounts with new editor content
        setMatchedEntries(chapterId, new Map());

        const debouncedUpdate = debounce(() => {
            editor.getEditorState().read(() => {
                const content = $getRoot().getTextContent();
                const matchedEntries = new Map<string, LorebookEntry>();

                // Check for each tag in the content
                Object.entries(tagMap).forEach(([tag, entry]) => {
                    if (content.toLowerCase().includes(tag.toLowerCase()))
                        // Use entry.id as key to prevent duplicates
                        matchedEntries.set(entry.id, entry);
                });

                // Update this chapter's slice with matched entries only
                setMatchedEntries(chapterId, matchedEntries);
            });
        }, 500);

        const removeListener = editor.registerTextContentListener(debouncedUpdate);

        // Run initial check
        debouncedUpdate();

        return () => {
            removeListener();
            debouncedUpdate.cancel();
            // Clear matched entries when plugin unmounts
            setMatchedEntries(chapterId, new Map());
        };
    }, [editor, tagMap, chapterId, setMatchedEntries]);

    return null;
}
