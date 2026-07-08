// GrammarMarkNode instances are live, ephemeral UI state (see GrammarMarkNode.ts) — they must
// never end up in a chapter's saved content. Since marking happens via a normal editor.update()
// (so the text still flows/reflows correctly), a save could in principle race a live check and
// serialize the document while marks are present. This is the guard: called on the plain JSON
// output of editorState.toJSON() right before it's stringified for the save request, it
// recursively unwraps any "grammar-mark" node into its own children, spliced into the parent —
// the same unwrap-via-JSON-transform used to clean up test data earlier in this project.
interface SerializedNodeLike {
    type: string;
    children?: SerializedNodeLike[];
    [key: string]: unknown;
}

export function stripGrammarMarks<T extends SerializedNodeLike>(node: T): T {
    if (Array.isArray(node.children))
        node.children = node.children.flatMap(child => {
            if (child.type === "grammar-mark") return (child.children ?? []).map(stripGrammarMarks);
            return [stripGrammarMarks(child)];
        });
    return node;
}
