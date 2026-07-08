import { attemptPromise } from "@jfdi/attempt";
import { $wrapSelectionInMarkNode } from "@lexical/mark";
import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { toast } from "react-toastify";
import { $createBeatMarkNode } from "@/components/story-editor/nodes/BeatMarkNode";
import { CONCRETE_BEAT_TYPE_MAP } from "@/types/beats";
import type { ConcreteBeatType } from "@/types/beats";
import { logger } from "@/utils/logger";
import { useCreateBeatMutation } from "./useBeatsQuery";

interface UseMarkBeatActionParams {
    editor: LexicalEditor;
    getSelectedText: () => string;
    storyId: string | undefined;
    chapterId: string | undefined;
}

/**
 * Marks the current editor selection as a concrete beat: creates the beat record, then wraps
 * the selection in a BeatMarkNode carrying that record's id — the same "create row, then anchor
 * the mark to its id" pattern used for TTS/Humanizer server round-trips elsewhere in this app.
 */
export const useMarkBeatAction = ({ editor, getSelectedText, storyId, chapterId }: UseMarkBeatActionParams) => {
    const createBeatMutation = useCreateBeatMutation();

    const handleMarkBeat = async (beatType: ConcreteBeatType, characterId: string | null) => {
        const selectedText = getSelectedText();
        if (!selectedText) {
            toast.error("No text selected");
            return;
        }
        if (!storyId || !chapterId) {
            toast.error("No chapter open");
            return;
        }

        const [err, beat] = await attemptPromise(() =>
            createBeatMutation.mutateAsync({
                storyId,
                chapterId,
                beatType,
                text: selectedText,
                characterId,
                source: "manual",
                status: "confirmed"
            })
        );

        if (err || !beat) {
            logger.error("Error creating beat:", err);
            toast.error("Failed to mark beat");
            return;
        }

        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            $wrapSelectionInMarkNode(selection, selection.isBackward(), beat.id, ids =>
                $createBeatMarkNode(ids, beatType)
            );
        });
        toast.success(`Marked as ${CONCRETE_BEAT_TYPE_MAP[beatType].label}`);
    };

    return { handleMarkBeat, isMarking: createBeatMutation.isPending };
};
