import { $unwrapMarkNode } from "@lexical/mark";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeFromDOMNode, $getNodeByKey, $isTextNode, type NodeKey } from "lexical";
import { useEffect, useRef, useState } from "react";
import { useGrammarSettingsQuery } from "@/features/grammar/hooks/useGrammarSettingsQuery";
import type { GrammarMatch } from "@/types/grammarSettings";
import { $isGrammarMarkNode } from "../../nodes/GrammarMarkNode";
import { GrammarIssuePopover } from "./GrammarIssuePopover";
import { useGrammarChecker } from "./useGrammarChecker";

interface OpenPopoverState {
    markKey: NodeKey;
    match: GrammarMatch;
    rect: DOMRect;
}

// Live inline spelling/grammar/style checking for the Main Editor: debounced background checks
// against a self-hosted LanguageTool server (see useGrammarChecker) wrap flagged spans in
// GrammarMarkNode, and this component handles the click-to-popover interaction on top of them —
// resolving a clicked .grammar-mark element back to its Lexical node, then applying a chosen
// replacement or ignoring the issue for the rest of the session.
export default function GrammarCheckPlugin(): React.ReactNode {
    const [editor] = useLexicalComposerContext();
    const { data: settings } = useGrammarSettingsQuery();
    const ignoredKeysRef = useRef<Set<string>>(new Set());
    const [openPopover, setOpenPopover] = useState<OpenPopoverState | null>(null);

    useGrammarChecker(editor, settings?.enabled ?? false, ignoredKeysRef);

    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return undefined;

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const markElement = target.closest(".grammar-mark");
            if (!markElement) return;

            // editor.read() (not editorState.read()) — only the editor-level read sets the
            // "active editor" context that $-prefixed DOM-resolution helpers like
            // $getNearestNodeFromDOMNode rely on internally.
            editor.read(() => {
                const node = $getNearestNodeFromDOMNode(markElement);
                if (!$isGrammarMarkNode(node)) return;

                setOpenPopover({
                    markKey: node.getKey(),
                    match: {
                        id: node.getKey(),
                        message: node.getMessage(),
                        offset: 0,
                        length: 0,
                        replacements: node.getReplacements(),
                        category: node.getCategory(),
                        ruleId: node.getRuleId()
                    },
                    rect: markElement.getBoundingClientRect()
                });
            });
        };

        rootElement.addEventListener("click", handleClick);
        return () => rootElement.removeEventListener("click", handleClick);
    }, [editor]);

    const handleApply = (replacement: string) => {
        if (!openPopover) return;
        const { markKey } = openPopover;
        editor.update(
            () => {
                const mark = $getNodeByKey(markKey);
                if (!$isGrammarMarkNode(mark)) return;
                const [child] = mark.getChildren();
                if ($isTextNode(child)) child.setTextContent(replacement);
                $unwrapMarkNode(mark);
            },
            { tag: "grammar-check" }
        );
        setOpenPopover(null);
    };

    const handleIgnore = () => {
        if (!openPopover) return;
        const { markKey, match } = openPopover;
        editor.update(
            () => {
                const mark = $getNodeByKey(markKey);
                if (!$isGrammarMarkNode(mark)) return;
                ignoredKeysRef.current.add(`${match.ruleId}:${mark.getTextContent()}`);
                $unwrapMarkNode(mark);
            },
            { tag: "grammar-check" }
        );
        setOpenPopover(null);
    };

    if (!openPopover) return null;

    return (
        <GrammarIssuePopover
            match={openPopover.match}
            rect={openPopover.rect}
            onApply={handleApply}
            onIgnore={handleIgnore}
            onClose={() => setOpenPopover(null)}
        />
    );
}
