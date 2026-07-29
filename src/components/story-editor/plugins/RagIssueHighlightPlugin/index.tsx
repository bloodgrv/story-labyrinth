import { $unwrapMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeFromDOMNode, $nodesOfType } from "lexical";
import { useEffect, useMemo, useState } from "react";
import { useEditorChapterId, useEditorStoryId } from "@/features/editor-multiview/context/EditorPaneContext";
import { useStoryIssuesQuery, useUpdateIssueStatusMutation } from "@/features/rag-scanner/hooks/useRagScanQuery";
import type { RagIssueStatus, RagScanIssue } from "@/types/ragScan";
import { $findTextNodeRange } from "../../nodes/beatTextSearch";
import { $createRagIssueMarkNode, $isRagIssueMarkNode, RagIssueMarkNode } from "../../nodes/RagIssueMarkNode";
import { RagIssuePopover } from "./RagIssuePopover";

interface OpenPopoverState {
    issue: RagScanIssue;
    rect: DOMRect;
}

// Inline highlighting for RAG Scanner issues — the "inline highlights on flagged spans with
// tooltips" half of docs/2026-06-26_RAG_Scanner_Integration.md that only ever shipped as the
// right-rail drawer/panel (ChapterScannerDrawer.tsx/RagScannerPanel.tsx). Structurally mirrors
// GrammarCheckPlugin: an ephemeral MarkNode wraps flagged spans (RagIssueMarkNode), computed on
// demand (not per-keystroke) whenever this chapter's `open` issues change, matched by exact
// substring only (see $findTextNodeRange) — a paraphrased or since-edited excerpt just doesn't
// get highlighted, no fuzzy matching, no stale-highlight indicator (confirmed with user).
export default function RagIssueHighlightPlugin(): React.ReactNode {
    const [editor] = useLexicalComposerContext();
    const chapterId = useEditorChapterId();
    const storyId = useEditorStoryId();
    const { data: issuesData } = useStoryIssuesQuery(storyId ?? "", "open");
    const updateStatusMutation = useUpdateIssueStatusMutation(storyId ?? "");
    const [openPopover, setOpenPopover] = useState<OpenPopoverState | null>(null);

    // React Query keeps a stable array reference across refetches that return unchanged data
    // (structural sharing), so this only recomputes when the open-issue set for this story
    // actually changes — not on every render.
    const chapterIssues = useMemo(
        () => (issuesData?.issues ?? []).filter(issue => issue.chapterId === chapterId),
        [issuesData, chapterId]
    );

    useEffect(() => {
        if (!chapterId) return;

        editor.update(
            () => {
                const openIds = new Set(chapterIssues.map(issue => issue.id));

                // Reconcile removals first — an issue resolved/dismissed elsewhere (the drawer,
                // the story-wide panel) drops out of the `open` query and its highlight should
                // disappear without waiting for a click here.
                for (const mark of $nodesOfType(RagIssueMarkNode)) if (!openIds.has(mark.getIssueId())) $unwrapMarkNode(mark);

                const alreadyMarked = new Set<string>();
                for (const mark of $nodesOfType(RagIssueMarkNode)) alreadyMarked.add(mark.getIssueId());

                for (const issue of chapterIssues) {
                    if (alreadyMarked.has(issue.id)) continue;
                    for (const evidence of issue.evidence) {
                        if (evidence.source !== "chapter") continue;
                        const range = $findTextNodeRange(evidence.excerpt);
                        if (!range) continue;
                        const selection = range.node.select(range.start, range.end);
                        $wrapSelectionInMarkNode(selection, false, issue.id, ids =>
                            $createRagIssueMarkNode(ids, issue.id, issue.severity)
                        );
                        break;
                    }
                }
            },
            { tag: "rag-issue-highlight" }
        );
    }, [editor, chapterId, chapterIssues]);

    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return undefined;

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const markElement = target.closest(".rag-issue-mark");
            if (!markElement) return;

            editor.read(() => {
                const node = $getNearestNodeFromDOMNode(markElement);
                if (!$isRagIssueMarkNode(node)) return;
                const issue = chapterIssues.find(candidate => candidate.id === node.getIssueId());
                if (!issue) return;
                setOpenPopover({ issue, rect: markElement.getBoundingClientRect() });
            });
        };

        rootElement.addEventListener("click", handleClick);
        return () => rootElement.removeEventListener("click", handleClick);
    }, [editor, chapterIssues]);

    const handleUpdateStatus = (status: RagIssueStatus) => {
        if (!openPopover) return;
        const { issue } = openPopover;
        updateStatusMutation.mutate({ issueId: issue.id, status });
        // Unwrap immediately client-side rather than waiting for the mutation's query
        // invalidation round-trip, so the highlight disappears the instant the user acts.
        editor.update(
            () => {
                for (const mark of $nodesOfType(RagIssueMarkNode)) if (mark.getIssueId() === issue.id) $unwrapMarkNode(mark);
            },
            { tag: "rag-issue-highlight" }
        );
        setOpenPopover(null);
    };

    if (!openPopover) return null;

    return (
        <RagIssuePopover
            issue={openPopover.issue}
            rect={openPopover.rect}
            isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.issueId === openPopover.issue.id}
            onUpdateStatus={handleUpdateStatus}
            onClose={() => setOpenPopover(null)}
        />
    );
}
