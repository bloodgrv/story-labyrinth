import { ArrowUpRight, Loader2, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRetryJobMutation } from "@/features/ai/hooks/useAgentJobsQuery";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AgentJob } from "@/types/agentJob";
import { useActivityJobs } from "../hooks/useActivityJobs";
import { formatElapsed, JOB_TYPE_JUMP_TOOL, JOB_TYPE_LABELS, STATUS_VARIANT } from "../lib/jobPresentation";

interface JobRowProps {
    job: AgentJob;
    storyTitle: string | null;
    onJump: (job: AgentJob) => void;
    onRetry: (id: string) => void;
    onDismiss: (job: AgentJob) => void;
    isRetrying: boolean;
}

function elapsedFor(job: AgentJob): string {
    if (job.status !== "running") return "—";
    const startedAt = job.startedAt ?? job.queuedAt ?? job.createdAt;
    return formatElapsed(Date.now() - new Date(startedAt).getTime());
}

function JobRow({ job, storyTitle, onJump, onRetry, onDismiss, isRetrying }: JobRowProps) {
    const jumpTool = JOB_TYPE_JUMP_TOOL[job.jobType];
    return (
        <div className="flex items-start justify-between gap-2 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{JOB_TYPE_LABELS[job.jobType]}</span>
                    <Badge variant={STATUS_VARIANT[job.status]} className="text-[10px]">
                        {job.status}
                    </Badge>
                </div>
                {storyTitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{storyTitle}</p>}
                {job.progress?.message && (
                    <p className="text-xs text-muted-foreground mt-0.5">{job.progress.message}</p>
                )}
                {job.error && <p className="text-xs text-destructive mt-0.5 break-words">{job.error}</p>}
                {job.status === "running" && <p className="text-xs text-muted-foreground mt-0.5">{elapsedFor(job)}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {job.status !== "failed" && jumpTool && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Jump to tool" onClick={() => onJump(job)}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                )}
                {job.status === "failed" && (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={isRetrying}
                            onClick={() => onRetry(job.id)}
                        >
                            {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Retry
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Dismiss"
                            onClick={() => onDismiss(job)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

// Activity Stoplight — global TopBar indicator over agentJobs (docs/Activity_Stoplight_Design.md).
// User-requested deviation from the design's original "hidden when idle" lock (2026-08-15,
// AskUserQuestion): the lamp now stays visible at all times as a stable landmark — dim/neutral
// when idle, amber-pulsing while anything is queued/running, red (wins over amber) while any
// undismissed failure exists. Only the color/count/pulse react to state, not visibility itself.
export function ActivityStoplight() {
    const [open, setOpen] = useState(false);
    const { currentStoryWorking, currentStoryFailed, otherStoryWorking, otherStoryFailed, working, failed, dismiss } =
        useActivityJobs();
    const { data: stories } = useStoriesQuery();
    const { setCurrentStoryId, setCurrentTool } = useStoryContext();
    const retryMutation = useRetryJobMutation();

    const hasFailed = failed.length > 0;
    const hasWorking = working.length > 0;
    const isIdle = !hasFailed && !hasWorking;

    const count = working.length + failed.length;
    const lampColor = hasFailed ? "bg-destructive" : hasWorking ? "bg-amber-500" : "bg-muted-foreground/40";
    const lampAnimation = hasWorking && !hasFailed ? "animate-pulse" : "";
    const tooltip = hasFailed
        ? `${failed.length} job${failed.length === 1 ? "" : "s"} failed`
        : hasWorking
          ? `${working.length} job${working.length === 1 ? "" : "s"} running`
          : "No jobs running";

    const storyTitleFor = (job: AgentJob): string | null => {
        if (!job.storyId) return null;
        return stories?.find(s => s.id === job.storyId)?.title ?? null;
    };

    const handleJump = (job: AgentJob) => {
        const tool = JOB_TYPE_JUMP_TOOL[job.jobType];
        if (!tool) return;
        if (job.storyId) setCurrentStoryId(job.storyId);
        setCurrentTool(tool);
        setOpen(false);
    };

    const renderRows = (jobs: AgentJob[]) =>
        jobs.map(job => (
            <JobRow
                key={job.id}
                job={job}
                storyTitle={storyTitleFor(job)}
                onJump={handleJump}
                onRetry={id => retryMutation.mutate(id)}
                onDismiss={dismiss}
                isRetrying={retryMutation.isPending && retryMutation.variables === job.id}
            />
        ));

    const otherStoryJobs = [...otherStoryWorking, ...otherStoryFailed];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Activity"
                    title={tooltip}
                    className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 h-9 text-xs hover:bg-accent transition-colors"
                >
                    <span className={`h-2 w-2 rounded-full ${lampColor} ${lampAnimation}`} />
                    {!isIdle && <span>{count}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
                <p className="font-medium text-sm mb-1">Activity</p>
                {isIdle ? (
                    <p className="text-xs text-muted-foreground py-2">Nothing running.</p>
                ) : (
                    <div className="divide-y max-h-80 overflow-y-auto">
                        {renderRows([...currentStoryWorking, ...currentStoryFailed])}
                        {otherStoryJobs.length > 0 && (
                            <div>
                                <p className="text-xs text-muted-foreground pt-2">Other stories</p>
                                {renderRows(otherStoryJobs)}
                            </div>
                        )}
                    </div>
                )}
                <div className="border-t pt-2 mt-1">
                    <Link
                        to="/settings?section=logs"
                        onClick={() => setOpen(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        All jobs →
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}
