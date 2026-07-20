import { BookOpen, Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useSuggestCodexUpdatesMutation } from "@/features/lorebook/hooks/useCodexHistoryQuery";
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
    // C3 (docs/CURRENT_BACKLOG.md P0.3) — per-scan opt-in, default off; not a persisted setting.
    const [includeMemory, setIncludeMemory] = useState(false);

    const triggerMutation = useTriggerChapterScanMutation();
    const { data: job } = useScanJobWithInvalidation(triggeredJobId, storyId);
    const { data: issuesData, isLoading } = useStoryIssuesQuery(storyId);
    const updateStatusMutation = useUpdateIssueStatusMutation(storyId);
    const suggestCodexMutation = useSuggestCodexUpdatesMutation();

    const chapterIssues = (issuesData?.issues ?? []).filter(issue => issue.chapterId === chapterId);
    const isJobActive = job && (job.status === "queued" || job.status === "running");

    const handleScan = () => {
        triggerMutation.mutate(
            { storyId, chapterId, includeMemory },
            { onSuccess: result => setTriggeredJobId(result.id) }
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
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
            {isOwner && (
                <div className="flex items-center gap-2">
                    <Switch id="chapter-scanner-include-memory" checked={includeMemory} onCheckedChange={setIncludeMemory} />
                    <Label htmlFor="chapter-scanner-include-memory" className="text-xs font-normal text-muted-foreground">
                        Include Project Memory (contradiction checks)
                    </Label>
                </div>
            )}

            {isOwner && (
                <div className="border-t border-border pt-3">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={suggestCodexMutation.isPending}
                        onClick={() => suggestCodexMutation.mutate({ storyId, chapterId })}
                    >
                        {suggestCodexMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Suggest Codex updates from this chapter
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                        Proposes wardrobe/appearance/wounds/items updates for existing Codex-enabled characters, locations,
                        and items mentioned here — review in each entry's editor before anything changes.
                    </p>
                </div>
            )}

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
