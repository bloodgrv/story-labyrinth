import {
    $createRangeSelection,
    $getNodeByKey,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    $isTextNode,
    $setSelection,
    type LexicalEditor,
    type LexicalNode,
    type TextNode
} from "lexical";
import { getActiveChapterEditor } from "@/lib/activeChapterEditorStore";
import { insertProposedProse } from "@/features/chat/services/insertProposedProse";
import type { ChapterSelectionTarget, FocusPacket } from "@/types/rework";

const WINDOW_SIZE = 500;

// Reads the live selection and captures a serializable target that survives across a multi-turn
// chat conversation — node keys + offsets, not just plain text, so applyChapterSelectionReplace
// can re-locate and re-select the exact span later. Returns null if there's no live/non-collapsed
// text selection (nothing to rework).
export const captureFocusTarget = (editor: LexicalEditor, chapterId: string): ChapterSelectionTarget | null => {
    let target: ChapterSelectionTarget | null = null;
    editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

        target = {
            kind: "chapter-selection",
            chapterId,
            anchorKey: selection.anchor.getNode().getKey(),
            anchorOffset: selection.anchor.offset,
            focusKey: selection.focus.getNode().getKey(),
            focusOffset: selection.focus.offset,
            isBackward: selection.isBackward(),
            text: selection.getTextContent()
        };
    });
    return target;
};

// Builds a bounded [BEFORE]/[AFTER] context window around the live selection (the selection text
// itself is already available via captureFocusTarget's `text`, no need to duplicate it here).
// Generalizes useSelectionPromptConfig.ts's existing backward-only, unbounded "previousWords"
// tree-walk into both directions, bounded to a local window per the design doc's "local window
// for fit" (docs/Chat_Panel_Integrations_Design.md §2.1) rather than that hook's whole-document
// walk (left untouched — it serves a different, unrelated purpose).
export const buildChapterFocusWindow = (editor: LexicalEditor): FocusPacket | null => {
    let packet: FocusPacket | null = null;

    editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

        const isBackward = selection.isBackward();
        const startNode = isBackward ? selection.focus.getNode() : selection.anchor.getNode();
        const startOffset = isBackward ? selection.focus.offset : selection.anchor.offset;
        const endNode = isBackward ? selection.anchor.getNode() : selection.focus.getNode();
        const endOffset = isBackward ? selection.anchor.offset : selection.focus.offset;

        const beforeParts: string[] = [];
        const afterParts: string[] = [];
        let phase: "before" | "inside" | "after" = "before";

        const visitTextNode = (node: TextNode) => {
            const text = node.getTextContent();
            const isStart = node.is(startNode);
            const isEnd = node.is(endNode);

            if (phase === "before") {
                if (isStart && isEnd) {
                    beforeParts.push(text.substring(0, startOffset));
                    afterParts.push(text.substring(endOffset));
                    phase = "after";
                } else if (isStart) {
                    beforeParts.push(text.substring(0, startOffset));
                    phase = "inside";
                } else beforeParts.push(text);
            } else if (phase === "inside") {
                if (isEnd) {
                    afterParts.push(text.substring(endOffset));
                    phase = "after";
                }
                // else: fully inside the selection, contributes to neither window
            } else afterParts.push(text);
        };

        const traverse = (node: LexicalNode) => {
            if ($isTextNode(node)) {
                visitTextNode(node);
                return;
            }
            if ($isElementNode(node)) for (const child of node.getChildren()) traverse(child);
        };
        traverse($getRoot());

        const beforeFull = beforeParts.join("");
        const afterFull = afterParts.join("");

        packet = {
            before: beforeFull.length > WINDOW_SIZE ? beforeFull.slice(-WINDOW_SIZE) : beforeFull,
            after: afterFull.length > WINDOW_SIZE ? afterFull.slice(0, WINDOW_SIZE) : afterFull,
            selection: selection.getTextContent(),
            beforeTruncated: beforeFull.length > WINDOW_SIZE,
            afterTruncated: afterFull.length > WINDOW_SIZE
        };
    });

    return packet;
};

export type ApplyReworkResult = "replaced" | "selection-changed" | "not-found";

// Applies a rework Accept: replaces exactly the originally-captured span with newText if it can
// still be found unchanged; degrades to the existing insert-at-cursor-or-end path (rather than
// guessing at a different location, e.g. via fuzzy text search) if the chapter was edited enough
// in the meantime that the captured span no longer resolves cleanly — consistent with this
// codebase's established "degrade to a known-good/inert state rather than guess" convention (see
// chatContextService.ts's resolveAnchorAndRelated/resolveAnchorChapter on a stale reference).
export const applyChapterSelectionReplace = (target: ChapterSelectionTarget, newText: string): ApplyReworkResult => {
    const editor = getActiveChapterEditor(target.chapterId);
    if (!editor) return "not-found";

    let result: ApplyReworkResult = "selection-changed";
    editor.update(() => {
        const anchorNode = $getNodeByKey(target.anchorKey);
        const focusNode = $getNodeByKey(target.focusKey);
        if (!anchorNode || !focusNode) return;

        const selection = $createRangeSelection();
        selection.anchor.set(target.anchorKey, target.anchorOffset, "text");
        selection.focus.set(target.focusKey, target.focusOffset, "text");

        if (selection.getTextContent() !== target.text) return;

        $setSelection(selection);
        selection.insertText(newText);
        result = "replaced";
    });

    if (result === "selection-changed") insertProposedProse(editor, newText);
    return result;
};
