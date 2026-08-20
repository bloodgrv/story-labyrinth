import { Lightbulb, Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import {
    useScanJobWithInvalidation,
    useStoryIssuesQuery,
    useStoryScansQuery,
    useSuggestMemoriesMutation,
    useTriggerStoryScanMutation,
    useUpdateIssueStatusMutation
} from "@/features/rag-scanner/hooks/useRagScanQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useStoryQuery, useUpdateStoryMutation } from "@/features/stories/hooks/useStoriesQuery";
import type { RagIssueStatus, RagScanStatus } from "@/types/ragScan";
import { IssueCard } from "./IssueCard";
import { RagIssueSeverityLegend } from "./RagIssueSeverityLegend";

const STATUS_TABS: { value: RagIssueStatus; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" }
];

const SCAN_STATUS_VARIANT: Record<RagScanStatus, "default" | "secondary" | "destructive"> = {
    running: "secondary",
    completed: "default",
    // B30 — a distinct "yellow-flag" variant so partial results don't read as either a clean
    // success (misleading, some chapters never got scanned) or a hard failure (misleading, most
    // of the scan's results are real).
    completed_with_errors: "secondary",
    failed: "destructive"
};

interface RagScannerPanelProps {
    storyId: string;
}

// Story-wide "Scanner" tool, reachable via Settings > Scanner (moved out of the main sidebar
// rail in the 2026-07-23 declutter pass — see Sidebar.tsx's own comment). Same hooks/IssueCard
// as ChapterScannerDrawer.tsx (the editor right-rail counterpart) — this view is unscoped by
// chapter and adds scan history + cross-navigation into the Editor tool.
export function RagScannerPanel({ storyId }: RagScannerPanelProps) {
    const isOwner = useIsOwner();
    const [statusTab, setStatusTab] = useState<RagIssueStatus>("open");
    const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);
    // C3 (docs/CURRENT_BACKLOG.md P0.3) — per-scan opt-in, default off; not a persisted setting.
    const [includeMemory, setIncludeMemory] = useState(false);
    // TL11A (docs/Story_Timeline_Design.md) — same per-scan opt-in shape.
    const [includeTimeline, setIncludeTimeline] = useState(false);
    const { setCurrentChapterId, setCurrentTool } = useStoryContext();

    const triggerMutation = useTriggerStoryScanMutation();
    const { data: job } = useScanJobWithInvalidation(triggeredJobId, storyId);
    const { data: scansData } = useStoryScansQuery(storyId);
    const { data: issuesData, isLoading: issuesLoading } = useStoryIssuesQuery(storyId, statusTab);
    const { data: chapters } = useChaptersByStoryQuery(storyId);
    const updateStatusMutation = useUpdateIssueStatusMutation(storyId);
    const suggestMemoriesMutation = useSuggestMemoriesMutation();
    const { data: story } = useStoryQuery(storyId);
    const updateStoryMutation = useUpdateStoryMutation();

    const chapterTitleById = new Map((chapters ?? []).map(c => [c.id, c.title]));
    const isJobActive = job?.status === "queued" || job?.status === "running";
    const scans = scansData?.scans ?? [];
    const issues = issuesData?.issues ?? [];

    const handleScan = () => {
        triggerMutation.mutate({ storyId, includeMemory, includeTimeline }, { onSuccess: result => setTriggeredJobId(result.id) });
    };

    const goToChapter = (chapterId: string) => {
        setCurrentChapterId(chapterId);
        setCurrentTool("editor");
    };

    return (
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
            <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                    <div className="flex items-center gap-1">
                        <h2 className="text-lg font-semibold">RAG Scanner</h2>
                        <RagIssueSeverityLegend />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Checks chapters against the Codex and prior chapters for factual contradictions, state
                        mismatches, and timeline issues.
                    </p>
                </div>
                {isOwner ? (
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <Button onClick={handleScan} disabled={triggerMutation.isPending || isJobActive}>
                            {triggerMutation.isPending || isJobActive ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <ScanSearch className="h-4 w-4 mr-1.5" />
                            )}
                            Scan whole story
                        </Button>
                        <div className="flex items-center gap-2">
                            <Switch id="scanner-include-memory" checked={includeMemory} onCheckedChange={setIncludeMemory} />
                            <Label htmlFor="scanner-include-memory" className="text-xs font-normal text-muted-foreground">
                                Include Project Memory (contradiction checks)
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="scanner-include-timeline" checked={includeTimeline} onCheckedChange={setIncludeTimeline} />
                            <Label htmlFor="scanner-include-timeline" className="text-xs font-normal text-muted-foreground">
                                Include Story Timeline (chronology checks)
                            </Label>
                        </div>
                    </div>
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

            {isOwner && story && (
                <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <Switch
                        id="scanner-unattended-enabled"
                        checked={!!story.unattendedScanEnabled}
                        disabled={updateStoryMutation.isPending}
                        onCheckedChange={checked => updateStoryMutation.mutate({ id: storyId, data: { unattendedScanEnabled: checked } })}
                    />
                    <Label htmlFor="scanner-unattended-enabled" className="text-sm font-normal">
                        Run an unattended story scan automatically, about once a day
                    </Label>
                </div>
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
                                <div className="flex items-center gap-2 shrink-0">
                                    {isOwner && (scan.status === "completed" || scan.status === "completed_with_errors") && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={suggestMemoriesMutation.isPending}
                                            onClick={() => suggestMemoriesMutation.mutate({ storyId, scanId: scan.id })}
                                        >
                                            <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                                            Suggest memories
                                        </Button>
                                    )}
                                    <Badge
                                        variant={SCAN_STATUS_VARIANT[scan.status]}
                                        title={
                                            scan.status === "completed_with_errors"
                                                ? `${scan.failedChapterIds.length} chapter${scan.failedChapterIds.length === 1 ? "" : "s"} failed to scan — its results are incomplete`
                                                : undefined
                                        }
                                    >
                                        {scan.status === "completed_with_errors"
                                            ? `${scan.failedChapterIds.length} chapter${scan.failedChapterIds.length === 1 ? "" : "s"} failed`
                                            : scan.status}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
