// Several inline-marking systems (GrammarMarkNode, RagIssueMarkNode) wrap live, ephemeral UI
// state directly in the editor tree — they must never end up in a chapter's saved content.
// Since marking happens via a normal editor.update() (so the text still flows/reflows
// correctly), a save could in principle race a live recompute and serialize the document while
// marks are present. This is the guard: called on the plain JSON output of
// editorState.toJSON() right before it's stringified for the save request, it recursively
// unwraps any node whose `type` is in `ephemeralTypes` into its own children, spliced into the
// parent — the same unwrap-via-JSON-transform used to clean up test data earlier in this project.
interface SerializedNodeLike {
    type: string;
    children?: SerializedNodeLike[];
    [key: string]: unknown;
}

const EPHEMERAL_MARK_TYPES = ["grammar-mark", "rag-issue-mark"];

export function stripEphemeralMarks<T extends SerializedNodeLike>(node: T): T {
    if (Array.isArray(node.children))
        node.children = node.children.flatMap(child => {
            if (EPHEMERAL_MARK_TYPES.includes(child.type)) return (child.children ?? []).map(stripEphemeralMarks);
            return [stripEphemeralMarks(child)];
        });
    return node;
}
