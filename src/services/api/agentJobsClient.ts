import type { AgentJob, AgentJobStatus, AgentJobType } from "@/types/agentJob";
import { fetchJSON } from "./apiFactory";

export const agentJobsApi = {
    list: (params?: { storyId?: string; status?: AgentJobStatus; jobType?: AgentJobType; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.storyId) query.set("storyId", params.storyId);
        if (params?.status) query.set("status", params.status);
        if (params?.jobType) query.set("jobType", params.jobType);
        if (params?.limit) query.set("limit", String(params.limit));
        const qs = query.toString();
        return fetchJSON<{ jobs: AgentJob[] }>(`/agent/jobs${qs ? `?${qs}` : ""}`);
    },
    getById: (id: string) => fetchJSON<AgentJob>(`/agent/jobs/${id}`),
    retry: (id: string) => fetchJSON<AgentJob>(`/agent/jobs/${id}/retry`, { method: "POST" })
};
