import { Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import {
    useScanJobWithInvalidation,
    useStoryIssuesQuery,
    useStoryScansQuery,
    useTriggerStoryScanMutation,
    useUpdateIssueStatusMutation
} from "@/features/rag-scanner/hooks/useRagScanQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { RagIssueStatus, RagScanStatus } from "@/types/ragScan";
import { IssueCard } from "./IssueCard";

const STATUS_TABS: { value: RagIssueStatus; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" }
];

const SCAN_STATUS_VARIANT: Record<RagScanStatus, "default" | "secondary" | "destructive"> = {
    running: "secondary",
    completed: "default",
    failed: "destructive"
};

interface RagScannerPanelProps {
    storyId: string;
}

// Story-wide "Scanner" sidebar tool (Sidebar.tsx "scanner" entry). Same hooks/IssueCard as
// ChapterScannerDrawer.tsx (the editor right-rail counterpart) — this view is unscoped by
// chapter and adds scan history + cross-navigation into the Editor tool.
export function RagScannerPanel({ storyId }: RagScannerPanelProps) {
    const isOwner = useIsOwner();
    const [statusTab, setStatusTab] = useState<RagIssueStatus>("open");
    const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);
    const { setCurrentChapterId, setCurrentTool } = useStoryContext();

    const triggerMutation = useTriggerStoryScanMutation();
    const { data: job } = useScanJobWithInvalidation(triggeredJobId, storyId);
    const { data: scansData } = useStoryScansQuery(storyId);
    const { data: issuesData, isLoading: issuesLoading } = useStoryIssuesQuery(storyId, statusTab);
    const { data: chapters } = useChaptersByStoryQuery(storyId);
    const updateStatusMutation = useUpdateIssueStatusMutation(storyId);

    const chapterTitleById = new Map((chapters ?? []).map(c => [c.id, c.title]));
    const isJobActive = job?.status === "queued" || job?.status === "running";
    const scans = scansData?.scans ?? [];
    const issues = issuesData?.issues ?? [];

    const handleScan = () => {
        triggerMutation.mutate(storyId, { onSuccess: result => setTriggeredJobId(result.id) });
    };

    const goToChapter = (chapterId: string) => {
        setCurrentChapterId(chapterId);
        setCurrentTool("editor");
    };

    return (
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
            <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold">RAG Scanner</h2>
                    <p className="text-sm text-muted-foreground">
                        Checks chapters against the Codex and prior chapters for factual contradictions, state
                        mismatches, and timeline issues.
                    </p>
                </div>
                {isOwner ? (
                    <Button onClick={handleScan} disabled={triggerMutation.isPending || isJobActive} className="shrink-0">
                        {triggerMutation.isPending || isJobActive ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                            <ScanSearch className="h-4 w-4 mr-1.5" />
                        )}
                        Scan whole story
                    </Button>
                ) : (
                    <p className="text-xs text-muted-foreground shrink-0">Only the story owner can trigger a scan.</p>
                )}
            </div>

            {job && (
                <p className="text-sm text-muted-foreground">
                    {job.status === "failed"
                        ? `Last scan failed: ${job.error}`
                        : (job.progress?.message ?? (isJobActive ? "Scanning…" : "Scan complete."))}
                </p>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Issues</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Tabs value={statusTab} onValueChange={v => setStatusTab(v as RagIssueStatus)}>
                        <TabsList>
                            {STATUS_TABS.map(tab => (
                                <TabsTrigger key={tab.value} value={tab.value}>
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    {issuesLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : issues.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No {statusTab} issues.</p>
                    ) : (
                        <div className="space-y-3">
                            {issues.map(issue => (
                                <IssueCard
                                    key={issue.id}
                                    issue={issue}
                                    isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.issueId === issue.id}
                                    onUpdateStatus={status => updateStatusMutation.mutate({ issueId: issue.id, status })}
                                    chapterLabel={chapterTitleById.get(issue.chapterId) ?? "Chapter"}
                                    onGoToChapter={() => goToChapter(issue.chapterId)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {scans.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Scan history</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y">
                        {scans.map(scan => (
                            <div key={scan.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                                <div>
                                    <span className="font-medium capitalize">{scan.scope} scan</span>
                                    {scan.scope === "chapter" && scan.chapterId && (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            — {chapterTitleById.get(scan.chapterId) ?? "Chapter"}
                                        </span>
                                    )}
                                    <span className="text-muted-foreground"> · {new Date(scan.createdAt).toLocaleString()}</span>
                                </div>
                                <Badge variant={SCAN_STATUS_VARIANT[scan.status]}>{scan.status}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
