import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from "lexical";

export interface TextSegment {
    node: TextNode;
    start: number;
    end: number;
}

export interface FlattenedDocument {
    text: string;
    segments: TextSegment[];
}

// Walks the live document once to produce BOTH the plain text sent to LanguageTool and the
// TextNode offset table used to map matches back onto the document — a single walk guarantees
// the two stay consistent with each other, so there's no need to match any other text-extraction
// convention used elsewhere (e.g. the server-side chapter-content extractor) since nothing else
// ever sees this specific flattened string. Adds a blank line between top-level blocks
// (paragraphs, headings, etc.) so LanguageTool sees separate sentences rather than one run-on
// block; text within a block (including nested lists) concatenates directly.
export function $flattenDocumentForGrammarCheck(): FlattenedDocument {
    let text = "";
    const segments: TextSegment[] = [];

    const collectTextNodes = (node: LexicalNode) => {
        if ($isTextNode(node)) {
            const nodeText = node.getTextContent();
            if (nodeText.length > 0) {
                segments.push({ node, start: text.length, end: text.length + nodeText.length });
                text += nodeText;
            }
            return;
        }
        if ($isElementNode(node)) for (const child of node.getChildren()) collectTextNodes(child);
    };

    const topLevelChildren = $getRoot().getChildren();
    topLevelChildren.forEach((child, index) => {
        collectTextNodes(child);
        if (index < topLevelChildren.length - 1) text += "\n\n";
    });

    return { text, segments };
}

export interface MappedMatchRange {
    node: TextNode;
    start: number;
    end: number;
}

// Finds the single TextNode range containing a LanguageTool match's [offset, offset + length).
// Returns null if the match spans a formatting boundary (split across two TextNodes because
// part of it is bold/italic) or lands in the synthetic paragraph-break whitespace — same
// graceful-degradation precedent as beatTextSearch.ts's single-node limitation.
export function findSegmentForMatch(
    segments: TextSegment[],
    matchOffset: number,
    matchLength: number
): MappedMatchRange | null {
    const matchEnd = matchOffset + matchLength;
    const segment = segments.find(candidate => matchOffset >= candidate.start && matchEnd <= candidate.end);
    if (!segment) return null;

    return { node: segment.node, start: matchOffset - segment.start, end: matchEnd - segment.start };
}
