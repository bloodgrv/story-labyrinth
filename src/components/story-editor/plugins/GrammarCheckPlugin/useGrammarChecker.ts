import { $unwrapMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { $nodesOfType, type LexicalEditor } from "lexical";
import { debounce } from "lodash";
import { useEffect, useRef, type RefObject } from "react";
import { grammarApi } from "@/services/api/client";
import { $createGrammarMarkNode, GrammarMarkNode } from "../../nodes/GrammarMarkNode";
import { $flattenDocumentForGrammarCheck, findSegmentForMatch } from "../../nodes/grammarOffsetMapping";

const CHECK_DEBOUNCE_MS = 1500;

// Drives the actual check-and-mark cycle: debounced off real (non-"grammar-check"-tagged) edits,
// sends the flattened document to LanguageTool, and — guarding against the user having kept
// typing during the round-trip — re-flattens the CURRENT document and discards the whole result
// set if it no longer matches what was sent, letting the next debounced cycle catch up instead
// of risking misaligned marks.
export function useGrammarChecker(editor: LexicalEditor, enabled: boolean, ignoredKeysRef: RefObject<Set<string>>) {
    const runCheckRef = useRef<() => void>(() => {});

    useEffect(() => {
        runCheckRef.current = async () => {
            let sentText = "";
            editor.getEditorState().read(() => {
                sentText = $flattenDocumentForGrammarCheck().text;
            });
            if (!sentText.trim()) return;

            const result = await grammarApi.check(sentText);
            if (!result.success || !result.matches) return;
            const matches = result.matches;

            editor.update(
                () => {
                    const { text: currentText } = $flattenDocumentForGrammarCheck();
                    if (currentText !== sentText) return;

                    for (const mark of $nodesOfType(GrammarMarkNode)) $unwrapMarkNode(mark);

                    for (const match of matches) {
                        const matchedText = sentText.slice(match.offset, match.offset + match.length);
                        const ignoreKey = `${match.ruleId}:${matchedText}`;
                        if (ignoredKeysRef.current?.has(ignoreKey)) continue;

                        // Recomputed fresh on every iteration: wrapping the previous match may have
                        // split its TextNode into up to three siblings, invalidating any node
                        // reference captured before that split.
                        const { segments } = $flattenDocumentForGrammarCheck();
                        const range = findSegmentForMatch(segments, match.offset, match.length);
                        if (!range) continue;

                        const selection = range.node.select(range.start, range.end);
                        $wrapSelectionInMarkNode(selection, false, match.id, ids =>
                            $createGrammarMarkNode(ids, match.category, match.message, match.replacements, match.ruleId)
                        );
                    }
                },
                { tag: "grammar-check" }
            );
        };
    }, [editor, ignoredKeysRef]);

    useEffect(() => {
        if (!enabled) return undefined;

        const debouncedCheck = debounce(() => {
            runCheckRef.current();
        }, CHECK_DEBOUNCE_MS);

        const removeUpdateListener = editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
            if (tags.has("grammar-check")) return;
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
            debouncedCheck();
        });

        debouncedCheck();

        return () => {
            removeUpdateListener();
            debouncedCheck.cancel();
        };
    }, [editor, enabled]);
}
