import { MarkNode } from "@lexical/mark";
import type { SerializedMarkNode } from "@lexical/mark";
import type { EditorConfig, LexicalNode, NodeKey, Spread } from "lexical";
import { CONCRETE_BEAT_TYPE_MAP } from "@/types/beats";
import type { ConcreteBeatType } from "@/types/beats";

// Wraps a span of chapter prose to mark it as a concrete beat (see src/types/beats.ts) —
// distinct from SceneBeatNode (an AI-generation command). Extends the official @lexical/mark
// MarkNode (already registered in this codebase but otherwise unused) rather than building a
// custom inline node from scratch, since MarkNode already handles the tricky parts: surviving
// edits around/inside the marked span, overlapping marks, and serialization.
//
// The base MarkNode only stores `ids: string[]` (in Lexical's own "Comments" example, these are
// comment-thread ids). Here it's a single id — the concreteBeats.id row this mark represents.
// We subclass only to also carry `beatType`, so the type travels with the document itself and
// renders correctly without a separate lookup on load.
export type SerializedBeatMarkNode = Spread<{ beatType: ConcreteBeatType }, SerializedMarkNode>;

export class BeatMarkNode extends MarkNode {
    __beatType: ConcreteBeatType;

    constructor(ids: readonly string[] = [], beatType: ConcreteBeatType = "physical_action", key?: NodeKey) {
        super(ids, key);
        this.__beatType = beatType;
    }

    static getType(): string {
        return "beat-mark";
    }

    static clone(node: BeatMarkNode): BeatMarkNode {
        return new BeatMarkNode(node.__ids, node.__beatType, node.__key);
    }

    static importJSON(serializedNode: SerializedBeatMarkNode): BeatMarkNode {
        return $createBeatMarkNode(serializedNode.ids, serializedNode.beatType);
    }

    exportJSON(): SerializedBeatMarkNode {
        return {
            ...super.exportJSON(),
            type: "beat-mark",
            beatType: this.__beatType
        };
    }

    getBeatType(): ConcreteBeatType {
        return this.__beatType;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);
        element.classList.add(`beat-mark--${this.__beatType}`);
        // A hover title gives colour-blind users (and anyone who hasn't memorized the palette) a
        // way to identify the beat type without opening the Beats panel.
        element.title = CONCRETE_BEAT_TYPE_MAP[this.__beatType].label;
        return element;
    }

    updateDOM(prevNode: this, element: HTMLElement, config: EditorConfig): boolean {
        const result = super.updateDOM(prevNode, element, config);
        element.classList.add(`beat-mark--${this.__beatType}`);
        element.title = CONCRETE_BEAT_TYPE_MAP[this.__beatType].label;
        return result;
    }
}

export const $createBeatMarkNode = (
    ids: readonly string[] = [],
    beatType: ConcreteBeatType = "physical_action"
): BeatMarkNode => new BeatMarkNode(ids, beatType);

export const $isBeatMarkNode = (node: LexicalNode | null | undefined): node is BeatMarkNode =>
    node instanceof BeatMarkNode;
