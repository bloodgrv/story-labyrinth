import { MarkNode } from "@lexical/mark";
import type { SerializedMarkNode } from "@lexical/mark";
import type { EditorConfig, LexicalNode, NodeKey, Spread } from "lexical";
import type { GrammarIssueCategory } from "@/types/grammarSettings";

// Wraps a span of prose to flag a live spelling/grammar/style issue found by LanguageTool.
// Extends @lexical/mark's MarkNode for the same reason BeatMarkNode does — it already handles
// surviving edits around the marked span and serialization.
//
// Unlike BeatMarkNode, these are NEVER meant to be persisted: they're recomputed from scratch on
// every debounced check (see GrammarCheckPlugin), not tied to any database row, and stripped out
// of the JSON before it's saved (see stripEphemeralMarks.ts) so a stale issue can never get baked
// into a chapter's saved content. exportJSON/importJSON are still implemented correctly (not
// just inherited as plain "mark") specifically so that stripping step can reliably recognize
// this node type by its own `type` field if a save ever races a live check.
export type SerializedGrammarMarkNode = Spread<
    { category: GrammarIssueCategory; message: string; replacements: string[]; ruleId: string },
    SerializedMarkNode
>;

export class GrammarMarkNode extends MarkNode {
    __category: GrammarIssueCategory;
    __message: string;
    __replacements: string[];
    __ruleId: string;

    constructor(
        ids: readonly string[] = [],
        category: GrammarIssueCategory = "style",
        message = "",
        replacements: string[] = [],
        ruleId = "",
        key?: NodeKey
    ) {
        super(ids, key);
        this.__category = category;
        this.__message = message;
        this.__replacements = replacements;
        this.__ruleId = ruleId;
    }

    static getType(): string {
        return "grammar-mark";
    }

    static clone(node: GrammarMarkNode): GrammarMarkNode {
        return new GrammarMarkNode(
            node.__ids,
            node.__category,
            node.__message,
            node.__replacements,
            node.__ruleId,
            node.__key
        );
    }

    static importJSON(serializedNode: SerializedGrammarMarkNode): GrammarMarkNode {
        return $createGrammarMarkNode(
            serializedNode.ids,
            serializedNode.category,
            serializedNode.message,
            serializedNode.replacements,
            serializedNode.ruleId
        );
    }

    exportJSON(): SerializedGrammarMarkNode {
        return {
            ...super.exportJSON(),
            type: "grammar-mark",
            category: this.__category,
            message: this.__message,
            replacements: this.__replacements,
            ruleId: this.__ruleId
        };
    }

    getCategory(): GrammarIssueCategory {
        return this.__category;
    }

    getMessage(): string {
        return this.__message;
    }

    getReplacements(): string[] {
        return this.__replacements;
    }

    getRuleId(): string {
        return this.__ruleId;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);
        element.classList.add("grammar-mark", `grammar-mark--${this.__category}`);
        element.title = this.__message;
        return element;
    }

    updateDOM(prevNode: this, element: HTMLElement, config: EditorConfig): boolean {
        const result = super.updateDOM(prevNode, element, config);
        element.classList.add("grammar-mark", `grammar-mark--${this.__category}`);
        element.title = this.__message;
        return result;
    }
}

export const $createGrammarMarkNode = (
    ids: readonly string[] = [],
    category: GrammarIssueCategory = "style",
    message = "",
    replacements: string[] = [],
    ruleId = ""
): GrammarMarkNode => new GrammarMarkNode(ids, category, message, replacements, ruleId);

export const $isGrammarMarkNode = (node: LexicalNode | null | undefined): node is GrammarMarkNode =>
    node instanceof GrammarMarkNode;
