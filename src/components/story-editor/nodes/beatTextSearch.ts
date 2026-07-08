import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from "lexical";

export interface TextNodeRange {
    node: TextNode;
    start: number;
    end: number;
}

/**
 * Finds the first TextNode whose own text content contains `snippet` verbatim, and returns the
 * [start, end) offset range within that node.
 *
 * Deliberately does not search across node/paragraph boundaries — AI-suggested beat snippets
 * are short phrases expected to sit inside a single plainly-formatted run of text, which covers
 * the common case. If a snippet spans a formatting boundary (bold/italic split it into two
 * TextNodes) or the chapter was edited since detection, this returns null and the caller
 * degrades gracefully: the beat is still confirmed in the database, just without an inline
 * highlight (see BeatMarkSyncPlugin).
 */
export function $findTextNodeRange(snippet: string): TextNodeRange | null {
    if (!snippet) return null;

    const visit = (node: LexicalNode): TextNodeRange | null => {
        if ($isTextNode(node)) {
            const idx = node.getTextContent().indexOf(snippet);
            return idx === -1 ? null : { node, start: idx, end: idx + snippet.length };
        }
        if ($isElementNode(node))
            for (const child of node.getChildren()) {
                const found = visit(child);
                if (found) return found;
            }

        return null;
    };

    return visit($getRoot());
}
