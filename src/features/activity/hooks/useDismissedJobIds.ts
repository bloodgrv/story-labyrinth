import { useCallback, useEffect, useState } from "react";
import type { AgentJob } from "@/types/agentJob";

// Client-local dismiss set for failed jobs — the design doc's own "lean" call: no server-side
// ack field exists (and adding one would be schema creep for a purely cosmetic hide), so a
// dismissal is just a locally-remembered fingerprint.
//
// The key is `${id}::${completedAt}`, not the bare job id. Retry (POST /agent/jobs/:id/retry)
// reuses the same row rather than creating a new one, and in this project's dev sandbox (no
// reachable AI provider) a retried job can go queued -> failed again inside a couple hundred
// ms — faster than even the "active" 3s poll tick, so a status-transition-based prune can
// legitimately never observe the intermediate non-failed state. Fingerprinting on completedAt
// means a genuinely new failure (different completedAt) is never suppressed by an old dismissal
// of the same job id, regardless of poll timing. Confirmed live: without this, a retry-then-
// instant-refail stayed hidden behind the previous failure's dismissal.
const STORAGE_KEY = "activity-stoplight-dismissed-job-ids";

function fingerprint(job: AgentJob): string {
    return `${job.id}::${job.completedAt ?? job.lastAttemptAt ?? ""}`;
}

function readStored(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

function writeStored(ids: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // localStorage unavailable (private browsing, quota) — dismissals just won't persist.
    }
}

// `ready` must be false until the caller's jobs query has actually resolved at least once —
// pruning against an empty `currentFailedJobs` before the first fetch lands would otherwise wipe
// every real dismissal on every page load, since "not loaded yet" and "loaded, zero failures"
// are both empty arrays and indistinguishable without this flag.
export function useDismissedJobIds(currentFailedJobs: AgentJob[], ready: boolean) {
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(readStored()));

    useEffect(() => {
        if (!ready) return;
        const currentFingerprints = currentFailedJobs.map(fingerprint);
        setDismissed(prev => {
            const pruned = [...prev].filter(fp => currentFingerprints.includes(fp));
            if (pruned.length === prev.size) return prev;
            writeStored(pruned);
            return new Set(pruned);
        });
        // currentFailedJobs is a fresh array every render (derived, not memoized) — re-running
        // this effect on every render is intentional and cheap (Set diff), not a dep-array bug.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, currentFailedJobs.map(fingerprint).join(",")]);

    const isDismissed = useCallback((job: AgentJob) => dismissed.has(fingerprint(job)), [dismissed]);

    const dismiss = useCallback((job: AgentJob) => {
        setDismissed(prev => {
            const next = new Set(prev);
            next.add(fingerprint(job));
            writeStored([...next]);
            return next;
        });
    }, []);

    return { isDismissed, dismiss };
}
