import type { Chapter, Story } from "@/types/story";
import { extractPlainTextFromLexical } from "../lexicalUtils";

const MIN_WORD_COUNT = 500;
const LARGE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB, rough heuristic on the base64 payload length

/**
 * Soft preflight checks for EPUB export (KDP3). Every warning is dismissible —
 * this never blocks export, it only surfaces things that would look off on
 * Kindle so the writer can catch them before downloading.
 */
export function computeEpubPreflightWarnings(story: Story, chapters: Chapter[]): string[] {
    const warnings: string[] = [];

    if (chapters.length === 0) {
        warnings.push("This story has no chapters yet.");
        return warnings;
    }

    const totalText = chapters
        .map(chapter => extractPlainTextFromLexical(chapter.content, { paragraphSpacing: "\n\n" }))
        .join(" ")
        .trim();

    if (totalText.length === 0) warnings.push("Every chapter is empty — the EPUB body will be blank.");
    else {
        const wordCount = totalText.split(/\s+/).filter(Boolean).length;
        if (wordCount < MIN_WORD_COUNT)
            warnings.push(`Total manuscript is very short (~${wordCount} words) for a book export.`);
    }

    if (!story.title.trim()) warnings.push("Story has no title.");
    if (!story.author.trim()) warnings.push("Story has no author set.");

    const hasHugeImage = chapters.some(chapter => {
        const matches: string[] = chapter.content.match(/data:[^"']+;base64,([A-Za-z0-9+/=]+)/g) || [];
        return matches.some(dataUri => {
            const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
            return base64.length * 0.75 > LARGE_IMAGE_BYTES;
        });
    });
    if (hasHugeImage) warnings.push("One or more embedded images are quite large and may bloat the EPUB file size.");

    return warnings;
}
