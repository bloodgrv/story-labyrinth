import { $getSelection, $isRangeSelection } from "lexical";
import { useEffect, useState } from "react";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";

// A right-rail sheet lives outside the Lexical composer tree (see activeChapterEditorStore.ts's
// own doc comment), so it can't rely on the composer's own selection-change events. This
// subscribes to the chapter's live editor (if one is currently mounted) via
// registerUpdateListener and reactively tracks whether there's a non-collapsed selection —
// used to gate the Humanize sheet's "Humanize selection" button, since the selection can change
// or disappear at any time while the sheet is open.
export function useActiveChapterSelection(chapterId: string | null): boolean {
    const [hasSelection, setHasSelection] = useState(false);

    useEffect(() => {
        setHasSelection(false);
        if (!chapterId) return;
        const editor = getActiveChapterEditor(chapterId);
        if (!editor) return;

        const readSelection = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                setHasSelection($isRangeSelection(selection) && !selection.isCollapsed());
            });
        };

        readSelection();
        return editor.registerUpdateListener(readSelection);
    }, [chapterId]);

    return hasSelection;
}
