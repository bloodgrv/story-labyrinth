import type { Chapter, ChapterNotes } from "@/types/story";
import { useUpdateChapterMutation } from "./useChaptersQuery";

// Scribble content is HTML (ChapterNotesEditor.tsx uses react-simple-wysiwyg, a contentEditable
// editor), so an appended block needs real markup rather than plain text with newlines — a
// caller-supplied array of lines becomes one <p> with <br> between lines, appended after
// whatever's already there. Never wipes existing content (docs/AI_Review_Design.md's "Add to
// chapter scribble" action: "Append... Do not wipe").
export const formatScribbleBlock = (lines: (string | null | undefined)[]): string => {
    const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<p>${lines
        .filter((l): l is string => !!l)
        .map(escapeHtml)
        .join("<br>")}</p>`;
};

// One-shot append (not debounced — ChapterNotesEditor.tsx's own debounce is for live typing,
// this is a single programmatic action) reusing the exact same useUpdateChapterMutation call.
export const useAppendToScribble = () => {
    const updateChapterMutation = useUpdateChapterMutation();

    const appendToScribble = (chapter: Chapter, blockHtml: string) => {
        const existing = chapter.notes?.content ?? "";
        const notes: ChapterNotes = {
            content: existing ? `${existing}${blockHtml}` : blockHtml,
            lastUpdated: new Date()
        };
        return updateChapterMutation.mutateAsync({ id: chapter.id, data: { notes } });
    };

    return { appendToScribble, isPending: updateChapterMutation.isPending };
};
