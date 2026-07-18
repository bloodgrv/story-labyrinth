import { Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import {
    useScanJobWithInvalidation,
    useStoryIssuesQuery,
    useTriggerChapterScanMutation,
    useUpdateIssueStatusMutation
} from "@/features/rag-scanner/hooks/useRagScanQuery";
import { IssueCard } from "./IssueCard";

interface ChapterScannerDrawerProps {
    chapterId: string;
    storyId: string;
}

// Rendered inside EditorToolsPanel.tsx's "ragScanner" Drawer. Scoped to the chapter currently
// open in the editor — issues are the same story-wide ragScanIssues rows the "Scanner" sidebar
// tool (RagScannerPanel.tsx) shows, just filtered down to this chapterId client-side (there's
// no chapter-specific issues endpoint, and story-wide issue volume is small enough not to need
// one).
export function ChapterScannerDrawer({ chapterId, storyId }: ChapterScannerDrawerProps) {
    const isOwner = useIsOwner();
    const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);

    const triggerMutation = useTriggerChapterScanMutation();
    const { data: job } = useScanJobWithInvalidation(triggeredJobId, storyId);
    const { data: issuesData, isLoading } = useStoryIssuesQuery(storyId);
    const updateStatusMutation = useUpdateIssueStatusMutation(storyId);

    const chapterIssues = (issuesData?.issues ?? []).filter(issue => issue.chapterId === chapterId);
    const isJobActive = job && (job.status === "queued" || job.status === "running");

    const handleScan = () => {
        triggerMutation.mutate(
            { storyId, chapterId },
            { onSuccess: result => setTriggeredJobId(result.id) }
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                {isOwner ? (
                    <Button size="sm" onClick={handleScan} disabled={triggerMutation.isPending || !!isJobActive}>
                        {triggerMutation.isPending || isJobActive ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Scan this chapter
                    </Button>
                ) : (
                    <p className="text-xs text-muted-foreground">Only the story owner can trigger a scan.</p>
                )}
                {isJobActive && <span className="text-xs text-muted-foreground">Scanning…</span>}
                {job?.status === "failed" && <span className="text-xs text-destructive">Scan failed: {job.error}</span>}
            </div>

            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : chapterIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues found for this chapter yet.</p>
            ) : (
                <div className="space-y-3">
                    {chapterIssues.map(issue => (
                        <IssueCard
                            key={issue.id}
                            issue={issue}
                            isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.issueId === issue.id}
                            onUpdateStatus={status => updateStatusMutation.mutate({ issueId: issue.id, status })}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
