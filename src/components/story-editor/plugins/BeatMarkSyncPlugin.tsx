import { $unwrapMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $nodesOfType } from "lexical";
import { useEffect } from "react";
import { toast } from "react-toastify";
import {
    BEAT_ACCEPTED_EVENT,
    BEAT_DELETED_EVENT,
    type BeatAcceptedEventDetail,
    type BeatDeletedEventDetail
} from "@/features/beats/beatEvents";
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

    useEffect(() => {
        const handleBeatDeleted = (event: Event) => {
            const { beatId } = (event as CustomEvent<BeatDeletedEventDetail>).detail;
            editor.update(() => {
                for (const mark of $nodesOfType(BeatMarkNode))
                    if (mark.hasID(beatId)) $unwrapMarkNode(mark);
            });
        };

        // Accepting an AI suggestion has no live selection to anchor to (the user isn't
        // necessarily even looking at the editor when they accept), so this locates the
        // suggestion's text in the current document and wraps it fresh — see
        // beatTextSearch.ts for the single-TextNode limitation and fallback behaviour.
        const handleBeatAccepted = (event: Event) => {
            const { beatId, text, beatType } = (event as CustomEvent<BeatAcceptedEventDetail>).detail;
            let found = false;

            editor.update(() => {
                const range = $findTextNodeRange(text);
                if (!range) return;
                const selection = range.node.select(range.start, range.end);
                $wrapSelectionInMarkNode(selection, false, beatId, ids => $createBeatMarkNode(ids, beatType));
                found = true;
            });

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

    return null;
}
