import { MarkNode } from "@lexical/mark";
import type { SerializedMarkNode } from "@lexical/mark";
import type { EditorConfig, LexicalNode, NodeKey, Spread } from "lexical";
import type { RagIssueSeverity } from "@/types/ragScan";

// Wraps a span of prose that a RAG Scanner issue's evidence quoted as its source (see
// $findTextNodeRange usage in RagIssueHighlightPlugin). Extends @lexical/mark's MarkNode for the
// same reason GrammarMarkNode does — free edit-survival/serialization handling.
//
// Like GrammarMarkNode (never like the persisted BeatMarkNode): these are NEVER meant to be
// saved. They're recomputed from the current `open` ragScanIssues whenever that list changes
// (not on every keystroke — see the plugin), not tied to any database row on their own, and
// stripped out of the JSON before save (see stripEphemeralMarks.ts) so a stale/relocated
// highlight can never get baked into a chapter's saved content. exportJSON/importJSON are
// implemented correctly (not just inherited as plain "mark") so that stripping step can reliably
// recognize this node type by its own `type` field if a save ever races a live recompute.
export type SerializedRagIssueMarkNode = Spread<{ issueId: string; severity: RagIssueSeverity }, SerializedMarkNode>;

export class RagIssueMarkNode extends MarkNode {
    __issueId: string;
    __severity: RagIssueSeverity;

    constructor(ids: readonly string[] = [], issueId = "", severity: RagIssueSeverity = "low", key?: NodeKey) {
        super(ids, key);
        this.__issueId = issueId;
        this.__severity = severity;
    }

    static getType(): string {
        return "rag-issue-mark";
    }

    static clone(node: RagIssueMarkNode): RagIssueMarkNode {
        return new RagIssueMarkNode(node.__ids, node.__issueId, node.__severity, node.__key);
    }

    static importJSON(serializedNode: SerializedRagIssueMarkNode): RagIssueMarkNode {
        return $createRagIssueMarkNode(serializedNode.ids, serializedNode.issueId, serializedNode.severity);
    }

    exportJSON(): SerializedRagIssueMarkNode {
        return {
            ...super.exportJSON(),
            type: "rag-issue-mark",
            issueId: this.__issueId,
            severity: this.__severity
        };
    }

    getIssueId(): string {
        return this.__issueId;
    }

    getSeverity(): RagIssueSeverity {
        return this.__severity;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);
        element.classList.add("rag-issue-mark", `rag-issue-mark--${this.__severity}`);
        return element;
    }

    updateDOM(prevNode: this, element: HTMLElement, config: EditorConfig): boolean {
        const result = super.updateDOM(prevNode, element, config);
        element.classList.add("rag-issue-mark", `rag-issue-mark--${this.__severity}`);
        return result;
    }
}

export const $createRagIssueMarkNode = (
    ids: readonly string[] = [],
    issueId = "",
    severity: RagIssueSeverity = "low"
): RagIssueMarkNode => new RagIssueMarkNode(ids, issueId, severity);

export const $isRagIssueMarkNode = (node: LexicalNode | null | undefined): node is RagIssueMarkNode =>
    node instanceof RagIssueMarkNode;
