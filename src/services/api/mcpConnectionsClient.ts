import type { AIChat } from "@/types/story";
import type { McpConnection, McpConnectionUpsertRequest, McpRefreshToolsResult, McpToolCallRequest } from "@/types/mcpConnection";
import { fetchJSON } from "./apiFactory";

export const mcpConnectionsApi = {
    list: () => fetchJSON<McpConnection[]>("/mcp/connections"),
    create: (data: McpConnectionUpsertRequest) => fetchJSON<McpConnection>("/mcp/connections", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<McpConnectionUpsertRequest>) =>
        fetchJSON<McpConnection>(`/mcp/connections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<{ success: boolean }>(`/mcp/connections/${id}`, { method: "DELETE" }),
    refreshTools: (id: string) => fetchJSON<McpRefreshToolsResult>(`/mcp/connections/${id}/refresh-tools`, { method: "POST" }),
    // M1/M2 — Accept on an mcp-tool-call-proposal card. Returns the updated chat row (same shape
    // POST /chats/:chatId/messages already returns) carrying the new tool_result message.
    callTool: (id: string, data: McpToolCallRequest) => fetchJSON<AIChat>(`/mcp/connections/${id}/call`, { method: "POST", body: JSON.stringify(data) })
};
