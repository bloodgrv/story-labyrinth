import { Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentJobsQuery, useRetryJobMutation } from "@/features/ai/hooks/useAgentJobsQuery";
import type { AgentJob, AgentJobStatus } from "@/types/agentJob";

const STATUS_VARIANT: Record<AgentJobStatus, "default" | "secondary" | "destructive" | "outline"> = {
    queued: "outline",
    running: "secondary",
    completed: "default",
    failed: "destructive"
};

const JOB_TYPE_LABELS: Record<AgentJob["jobType"], string> = {
    reconcile_index: "Reindex reconciliation",
    rag_scan_chapter: "Chapter scan",
    rag_scan_story: "Story scan",
    prune_history: "History cleanup"
};

interface JobRowProps {
    job: AgentJob;
    onRetry: (id: string) => void;
    isRetrying: boolean;
}

function JobRow({ job, onRetry, isRetrying }: JobRowProps) {
    return (
        <div className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{JOB_TYPE_LABELS[job.jobType]}</span>
                    <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                </div>
                {job.progress && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {job.progress.message ?? `${job.progress.processed}/${job.progress.total}`}
                    </p>
                )}
                {job.error && <p className="text-xs text-destructive mt-0.5 break-words">{job.error}</p>}
            </div>
            {job.status === "failed" && (
                <Button size="sm" variant="outline" onClick={() => onRetry(job.id)} disabled={isRetrying} className="shrink-0">
                    {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Retry
                </Button>
            )}
        </div>
    );
}

// Minimal Phase A status surface (design doc §3.7): read-only recent job list + errors + retry.
// Deliberately no "start a scan" control — that's the manual scan-trigger UI this project's
// Agent Framework direction explicitly avoids building.
export function RecentJobsCard() {
    const { data, isLoading } = useRecentJobsQuery({ limit: 20 });
    const retryMutation = useRetryJobMutation();

    const jobs = data?.jobs ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                    Background work — RAG index reconciliation, scans, housekeeping — run automatically. This shows
                    their status so failures aren't only visible in server logs.
                </p>
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No jobs yet.</p>
                ) : (
                    <div className="divide-y">
                        {jobs.map(job => (
                            <JobRow
                                key={job.id}
                                job={job}
                                onRetry={id => retryMutation.mutate(id)}
                                isRetrying={retryMutation.isPending && retryMutation.variables === job.id}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
