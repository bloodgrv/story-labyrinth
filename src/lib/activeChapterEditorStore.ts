import type { LexicalEditor } from "lexical";

// Bridges the Editor chat rail (outside any Lexical composer tree — it's a sibling resizable
// panel to EditorMultiView, not a descendant) to whichever chapter's editor the user last
// focused, so a prose-proposal Accept can insert text into the live document. Same
// module-level-value + listener-set bridge pattern as chapterWordCountStore.ts, specialized to
// track one "active" editor instead of a per-key map since only one chapter can have focus at a time.

interface ActiveEditorEntry {
    chapterId: string;
    editor: LexicalEditor;
}

let active: ActiveEditorEntry | null = null;

// Registers a pane's editor on mount (last-mounted-wins fallback for split views where no pane
// has been explicitly focused yet) and clears it on unmount, but only if it's still the current
// entry — an already-superseded pane unmounting shouldn't clobber whichever pane focused since.
export const registerActiveChapterEditor = (chapterId: string, editor: LexicalEditor): (() => void) => {
    active = { chapterId, editor };
    return () => {
        if (active?.editor === editor) active = null;
    };
};

export const setActiveChapterEditor = (chapterId: string, editor: LexicalEditor): void => {
    active = { chapterId, editor };
};

// Plain (non-hook) read for use outside React render — e.g. inserting a prose proposal on Accept.
export const getActiveChapterEditor = (chapterId: string): LexicalEditor | null =>
    active && active.chapterId === chapterId ? active.editor : null;
