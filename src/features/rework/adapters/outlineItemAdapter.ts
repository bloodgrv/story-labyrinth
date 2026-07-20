import type { FocusPacket, FocusTarget } from "@/types/rework";
import type { OutlineItem } from "@/types/outline";

// Outline-row counterpart to chapterSelectionAdapter.ts / lorebookFieldAdapter.ts — whole-field
// target only (title + summary together), not a sub-span, matching R8's v1 scope (title/summary
// fields are short enough that a plain-text selection primitive isn't worth building for them,
// unlike the chapter body or a Lorebook description). No "apply" function here either — Accept
// for an outline-item rework is the existing outline-proposal ephemeral-card flow
// (OutlineProposalCard.tsx via ChatInterface.tsx), not a client-side replace.
export const captureOutlineItemTarget = (
    item: OutlineItem,
    parentChapter: OutlineItem | undefined,
    prevSibling: OutlineItem | undefined,
    nextSibling: OutlineItem | undefined
): { target: FocusTarget; packet: FocusPacket } => {
    const selection = `${item.title}\n\n${item.summary ?? "(no summary)"}`;

    const beforeParts: string[] = [];
    if (parentChapter) beforeParts.push(`Parent chapter: ${parentChapter.title}`);
    if (prevSibling) beforeParts.push(`Previous: ${prevSibling.title}`);

    const afterParts: string[] = [];
    if (nextSibling) afterParts.push(`Next: ${nextSibling.title}`);

    return {
        target: { kind: "outline-item", outlineItemId: item.id, text: selection },
        packet: {
            before: beforeParts.join("\n"),
            after: afterParts.join("\n"),
            selection,
            beforeTruncated: false,
            afterTruncated: false
        }
    };
};
