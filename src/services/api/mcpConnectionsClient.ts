import type { McpConnection, McpConnectionUpsertRequest, McpRefreshToolsResult } from "@/types/mcpConnection";
import { fetchJSON } from "./apiFactory";

export const mcpConnectionsApi = {
    list: () => fetchJSON<McpConnection[]>("/mcp/connections"),
    create: (data: McpConnectionUpsertRequest) => fetchJSON<McpConnection>("/mcp/connections", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<McpConnectionUpsertRequest>) =>
        fetchJSON<McpConnection>(`/mcp/connections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/mcp/connections/${id}`, { method: "DELETE" }),
    refreshTools: (id: string) => fetchJSON<McpRefreshToolsResult>(`/mcp/connections/${id}/refresh-tools`, { method: "POST" })
};
