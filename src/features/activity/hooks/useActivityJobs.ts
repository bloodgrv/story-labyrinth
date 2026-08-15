import { useQuery } from "@tanstack/react-query";
import { agentJobsApi } from "@/services/api/client";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AgentJob, AgentJobStatus } from "@/types/agentJob";
import { useDismissedJobIds } from "./useDismissedJobIds";

const WORKING_STATUSES: AgentJobStatus[] = ["queued", "running"];

// Deliberately its own query key (not agentJobsKeys) and its own poll cadence — see the plan's
// "Reused building blocks" note: no agentJobs enqueue call site anywhere in the app invalidates
// any job query today, so a stoplight that fully stops polling while idle (like the existing
// useRecentJobsQuery) would never notice a job someone just started from an unrelated panel.
// Idle still polls, just slowly, so new work surfaces within one interval instead of never.
const ACTIVE_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 20000;

export interface ActivityJobGroups {
    working: AgentJob[];
    failed: AgentJob[];
    currentStoryWorking: AgentJob[];
    currentStoryFailed: AgentJob[];
    otherStoryWorking: AgentJob[];
    otherStoryFailed: AgentJob[];
    isLoading: boolean;
    dismiss: (job: AgentJob) => void;
}

export function useActivityJobs(): ActivityJobGroups {
    const { currentStoryId } = useStoryContext();

    const { data, isLoading } = useQuery({
        queryKey: ["activityStoplight", "jobs"],
        queryFn: () => agentJobsApi.list({ limit: 50 }),
        refetchInterval: query => {
            const jobs = query.state.data?.jobs ?? [];
            const active = jobs.some(job => WORKING_STATUSES.includes(job.status));
            return active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
        }
    });

    const jobs = data?.jobs ?? [];
    const working = jobs.filter(job => WORKING_STATUSES.includes(job.status));
    const failedAll = jobs.filter(job => job.status === "failed");

    const { isDismissed, dismiss } = useDismissedJobIds(failedAll, data !== undefined);
    const failed = failedAll.filter(job => !isDismissed(job));

    return {
        working,
        failed,
        currentStoryWorking: working.filter(job => job.storyId === currentStoryId),
        currentStoryFailed: failed.filter(job => job.storyId === currentStoryId),
        otherStoryWorking: working.filter(job => job.storyId !== currentStoryId),
        otherStoryFailed: failed.filter(job => job.storyId !== currentStoryId),
        isLoading,
        dismiss
    };
}
