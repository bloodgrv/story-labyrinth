import type { LexicalEditor } from "lexical";

// Bridges the Editor chat rail (outside any Lexical composer tree — it's a sibling resizable
// panel to EditorMultiView, not a descendant) to a chapter's live editor instance, so a
// prose-proposal Accept (or a selection-rework Accept) can apply text into the live document.
// Same module-level-value + listener-set bridge pattern as chapterWordCountStore.ts.
//
// Tracks every currently-mounted chapter editor (not just "whichever pane last had focus") —
// this used to be a single {chapterId, editor} slot reassigned on every pane mount and Lexical
// FOCUS_COMMAND, which meant a chapter's editor became unreachable the moment the user focused a
// DIFFERENT pane/chapter, even though the original editor was still mounted. That was survivable
// for prose-proposal Accept (happens moments after typing, focus rarely moved away yet) but not
// for selection rework, which is explicitly multi-turn — a user can highlight in chapter A, chat
// for several turns (quite plausibly clicking into a different chapter/pane meanwhile), and still
// expect Accept to find chapter A's editor. A plain per-chapter map has no such blind spot: "is a
// live editor for this chapter still mounted" is all any caller has ever actually needed.
const editors = new Map<string, LexicalEditor>();

// Registers a pane's editor on mount, and unregisters on unmount — but only if it's still the
// same editor instance registered under this chapterId (an already-superseded/remounted entry
// unmounting shouldn't clobber whatever replaced it).
export const registerActiveChapterEditor = (chapterId: string, editor: LexicalEditor): (() => void) => {
    editors.set(chapterId, editor);
    return () => {
        if (editors.get(chapterId) === editor) editors.delete(chapterId);
    };
};

// Plain (non-hook) read for use outside React render — e.g. inserting a prose proposal, or
// applying a selection-rework replacement, on Accept.
export const getActiveChapterEditor = (chapterId: string): LexicalEditor | null => editors.get(chapterId) ?? null;
