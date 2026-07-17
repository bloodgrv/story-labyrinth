import type { AgentMemory, AgentMemoryCategory, AgentMemoryStatus } from "@/types/agentMemory";
import { fetchJSON } from "./apiFactory";

export const agentMemoriesApi = {
    list: (params?: { storyId?: string; status?: AgentMemoryStatus }) => {
        const q = new URLSearchParams();
        if (params?.storyId) q.set("storyId", params.storyId);
        if (params?.status) q.set("status", params.status);
        const qs = q.toString();
        return fetchJSON<{ memories: AgentMemory[] }>(`/agent/memories${qs ? `?${qs}` : ""}`);
    },
    getById: (id: string) => fetchJSON<AgentMemory>(`/agent/memories/${id}`),
    createNote: (data: {
        storyId: string | null;
        memoryKey?: string;
        category: AgentMemoryCategory;
        title: string;
        body: string;
        pinned?: boolean;
    }) => fetchJSON<AgentMemory>("/agent/memories", { method: "POST", body: JSON.stringify(data) }),
    approve: (id: string) =>
        fetchJSON<{ memory: AgentMemory; superseded: AgentMemory | null }>(`/agent/memories/${id}/approve`, { method: "POST" }),
    reject: (id: string) => fetchJSON<AgentMemory>(`/agent/memories/${id}/reject`, { method: "POST" }),
    revise: (id: string, data: { title?: string; body?: string; category?: AgentMemoryCategory; pinned?: boolean }) =>
        fetchJSON<AgentMemory>(`/agent/memories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/agent/memories/${id}`, { method: "DELETE" })
};
