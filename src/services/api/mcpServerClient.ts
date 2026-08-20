import type { McpServerRotateTokenResult, McpServerSettings } from "@/types/mcpConnection";
import { fetchJSON } from "./apiFactory";

// M4 (docs/MCP_Tool_Connections_Design.md §4) — this app's own /mcp server-expose settings.
// Distinct router/prefix from mcpConnectionsClient.ts (that's the outbound-connections direction;
// this is the inbound-expose direction), mirroring the server's own /api/mcp/connections vs.
// /api/mcp-server split.
export const mcpServerApi = {
    getSettings: () => fetchJSON<McpServerSettings>("/mcp-server/settings"),
    setEnabled: (enabled: boolean) => fetchJSON<McpServerSettings>("/mcp-server/settings", { method: "PUT", body: JSON.stringify({ enabled }) }),
    rotateToken: () => fetchJSON<McpServerRotateTokenResult>("/mcp-server/settings/rotate-token", { method: "POST" }),
    revokeToken: () => fetchJSON<McpServerSettings>("/mcp-server/settings/revoke-token", { method: "POST" })
};
