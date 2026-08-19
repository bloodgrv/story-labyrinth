import { $unwrapMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getSelection, $nodesOfType, $setSelection, SKIP_DOM_SELECTION_TAG } from "lexical";
import { useEffect } from "react";
import { toast } from "react-toastify";
import {
    BEAT_ACCEPTED_EVENT,
    BEAT_DELETED_EVENT,
    type BeatAcceptedEventDetail,
    type BeatDeletedEventDetail
} from "@/features/beats/beatEvents";
import { useDeleteBeatMutation } from "@/features/beats/hooks/useBeatsQuery";
import { useEditorChapterId } from "@/features/editor-multiview/context/EditorPaneContext";
import { $createBeatMarkNode, BeatMarkNode } from "../nodes/BeatMarkNode";
import { $findTextNodeRange } from "../nodes/beatTextSearch";

/**
 * Keeps BeatMarkNode marks in the editor in sync with beat records changed from the Concrete
 * Beats panel (StoryEditor.tsx), which lives outside the LexicalComposer tree and so can't
 * reach the editor directly — see beatEvents.ts for why this goes through a DOM event instead
 * of a ref/prop.
 */
export default function BeatMarkSyncPlugin(): null {
    const [editor] = useLexicalComposerContext();
    const chapterId = useEditorChapterId();
    const { mutate: deleteBeat } = useDeleteBeatMutation(chapterId ?? "");

    useEffect(() => {
        const handleBeatDeleted = (event: Event) => {
            const { beatId } = (event as CustomEvent<BeatDeletedEventDetail>).detail;
            editor.update(
                () => {
                    for (const mark of $nodesOfType(BeatMarkNode))
                        if (mark.hasID(beatId)) $unwrapMarkNode(mark);
                },
                { tag: SKIP_DOM_SELECTION_TAG }
            );
        };

        // Accepting an AI suggestion has no live selection to anchor to (the user isn't
        // necessarily even looking at the editor when they accept — often mid-conversation in a
        // chat panel), so this locates the suggestion's text in the current document and wraps
        // it fresh. It must not steal focus/caret from wherever the user actually is (see B15:
        // this exact pattern — a background editor.update() calling range.node.select() — was
        // found to relocate the DOM caret into the manuscript while the user was typing
        // elsewhere, causing their next keystrokes to land in the chapter instead of the chat).
        const handleBeatAccepted = (event: Event) => {
            const { beatId, text, beatType } = (event as CustomEvent<BeatAcceptedEventDetail>).detail;
            let found = false;

            editor.update(
                () => {
                    const priorSelection = $getSelection()?.clone() ?? null;
                    const range = $findTextNodeRange(text);
                    if (!range) return;
                    const selection = range.node.select(range.start, range.end);
                    $wrapSelectionInMarkNode(selection, false, beatId, ids => $createBeatMarkNode(ids, beatType));
                    found = true;
                    $setSelection(priorSelection);
                },
                { tag: SKIP_DOM_SELECTION_TAG }
            );

            if (!found)
                toast.info(
                    "Beat confirmed, but the exact text couldn't be found in the chapter to highlight it — it may have changed since detection."
                );
        };

        window.addEventListener(BEAT_DELETED_EVENT, handleBeatDeleted);
        window.addEventListener(BEAT_ACCEPTED_EVENT, handleBeatAccepted);
        return () => {
            window.removeEventListener(BEAT_DELETED_EVENT, handleBeatDeleted);
            window.removeEventListener(BEAT_ACCEPTED_EVENT, handleBeatAccepted);
        };
    }, [editor]);

    // B2 fix: a BeatMarkNode can also disappear because the user edited the marked prose
    // directly (backspace, cut, retyping over a selection) rather than via the panel's Trash
    // button, which never reaches the delete API — leaving the confirmedBeats row orphaned,
    // pointing at text that no longer exists in the chapter. Watch for a mark's id truly
    // vanishing from the whole document (as opposed to being split across multiple
    // BeatMarkNodes by the same edit, which shows up as destroy+create within the same
    // mutation batch and is checked against the post-update document below) and clean up its
    // row to match.
    useEffect(() => {
        if (!chapterId) return undefined;

        return editor.registerMutationListener(BeatMarkNode, (mutatedNodes, { prevEditorState }) => {
            const candidateIds = new Set<string>();
            for (const [key, mutation] of mutatedNodes) {
                if (mutation !== "destroyed") continue;
                prevEditorState.read(() => {
                    const node = $getNodeByKey(key);
                    if (node instanceof BeatMarkNode) for (const id of node.getIDs()) candidateIds.add(id);
                });
            }
            if (candidateIds.size === 0) return;

            editor.getEditorState().read(() => {
                const liveIds = new Set<string>();
                for (const mark of $nodesOfType(BeatMarkNode)) for (const id of mark.getIDs()) liveIds.add(id);
                for (const id of candidateIds) if (!liveIds.has(id)) deleteBeat(id);
            });
        });
    }, [editor, chapterId, deleteBeat]);

    return null;
}
