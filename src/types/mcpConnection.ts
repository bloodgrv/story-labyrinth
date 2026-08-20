// MCP Tool Connections (M0, docs/MCP_Tool_Connections_Design.md) — registered external
// Streamable HTTP MCP servers. Owner-only CRUD (design §3.1). This is the client v1 foundation
// slice: schema + Settings CRUD + secret redaction + LAN opt-in + "Refresh tools" catalogue
// cache. Chat integration (fence/proposal/tool-call, M2-M3) and server-expose (M4) are separate,
// later slices — nothing here wires into chat yet.

export type McpTransport = "streamable_http";
export type McpConnectionScope = "global" | "story";

export interface McpToolCatalogueEntry {
    name: string;
    description: string;
    inputSchema: unknown;
}

export interface McpConnection {
    id: string;
    name: string;
    transport: McpTransport;
    url: string;
    // Never present on a GET response (redacted server-side, mirrors ttsSettings' apiKey/
    // hasApiKey posture) — see hasToken below for what the UI actually renders against.
    bearerToken?: string;
    // GET-response-only computed flag (server/services/mcpConnectionService.ts's redactConnection).
    hasToken?: boolean;
    allowPrivateNetwork: boolean;
    scope: McpConnectionScope;
    storyId?: string | null;
    enabled: boolean;
    toolsCatalogue: McpToolCatalogueEntry[];
    lastToolsFetch?: Date | null;
    lastToolsError?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// Request body for POST/PUT — bearerToken omitted entirely means "leave the stored token
// unchanged"; clearToken:true is the only way to remove an already-saved token (mirrors the
// per-field-merge posture tts.ts's PUT /settings/:id uses for providers[*].apiKey).
export interface McpConnectionUpsertRequest {
    name: string;
    transport?: McpTransport;
    url: string;
    bearerToken?: string;
    clearToken?: boolean;
    allowPrivateNetwork?: boolean;
    scope?: McpConnectionScope;
    storyId?: string | null;
    enabled?: boolean;
}

export interface McpRefreshToolsResult {
    success: boolean;
    error?: string;
    connection?: McpConnection;
}

// M2 — a single parsed ```mcp-tool-call-proposal fence item (design §3.5). args defaults to {}
// per the fence contract; reason is required for the card to render (design §3.3).
export interface McpToolCallProposal {
    connectionId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
}

// M1/M2 — body for POST /mcp/connections/:id/call.
export interface McpToolCallRequest {
    toolName: string;
    args: Record<string, unknown>;
    chatId: string;
    requestId?: string;
}

// M4 (docs/MCP_Tool_Connections_Design.md §4) — this app's own /mcp server-expose state. Never
// carries the raw token (only hasToken) — see McpServerRotateTokenResult below for the one-time
// exception on rotate.
export interface McpServerSettings {
    enabled: boolean;
    hasToken: boolean;
    tokenCreatedAt: Date | null;
}

// The raw install token — present ONLY in a rotate-token response, never persisted client-side
// beyond the component that shows it once.
export interface McpServerRotateTokenResult {
    token: string;
    tokenCreatedAt: Date;
}
