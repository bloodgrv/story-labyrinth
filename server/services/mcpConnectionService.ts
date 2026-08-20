import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { attemptPromise } from "@jfdi/attempt";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { assertPublicUrl } from "../lib/ssrfSafeFetch.js";
import { appendToolResultMessage, getChatById } from "./chatService.js";
import type { ChatRow } from "./chatRepository.js";
import type { McpToolCatalogueEntry } from "../../src/types/mcpConnection.js";

type McpConnectionRow = typeof schema.mcpConnections.$inferSelect;

// Strips the bearer token before a connection row goes over the wire (B31/TTS redaction posture,
// server/routes/tts.ts's redactSettings) — the client only ever sees whether one is saved.
export const redactConnection = (connection: McpConnectionRow) => {
    const { bearerToken, ...rest } = connection;
    return { ...rest, hasToken: Boolean(bearerToken) };
};

export const listConnections = () =>
    db.select().from(schema.mcpConnections).where(isNull(schema.mcpConnections.deletedAt)).orderBy(schema.mcpConnections.createdAt);

export const getConnection = async (id: string) => {
    const [connection] = await db
        .select()
        .from(schema.mcpConnections)
        .where(and(eq(schema.mcpConnections.id, id), isNull(schema.mcpConnections.deletedAt)));
    return connection ?? null;
};

// M2, docs/MCP_Tool_Connections_Design.md §3.3 — the set of connections a chat's "Include MCP
// tools" toggle should surface: enabled, not deleted, and in scope (global connections are always
// in scope; story-scoped connections only when storyId matches). Global chats (storyId null, e.g.
// Research Global mode) only ever see global connections.
export const listChatVisibleConnections = (storyId: string | null): Promise<McpConnectionRow[]> =>
    db
        .select()
        .from(schema.mcpConnections)
        .where(
            and(
                isNull(schema.mcpConnections.deletedAt),
                eq(schema.mcpConnections.enabled, true),
                or(
                    eq(schema.mcpConnections.scope, "global"),
                    storyId ? and(eq(schema.mcpConnections.scope, "story"), eq(schema.mcpConnections.storyId, storyId)) : undefined
                )
            )
        );

// A custom `fetch` handed to the SDK's transport so every request it makes (initial connect,
// reconnects, resumed streams) is re-validated against the SSRF guard — not just the URL typed
// into the connection form. `allowPrivate` mirrors the connection's own opt-in (design §2.4/§3.2).
const ssrfGuardedFetch = (allowPrivate: boolean): typeof fetch =>
    (async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        await assertPublicUrl(url, { allowPrivate });
        return fetch(input as never, init);
    }) as typeof fetch;

// Opens a short-lived MCP client against the connection's Streamable HTTP endpoint, calls
// tools/list, and closes it. Not cached/pooled — this only runs on an explicit "Refresh tools"
// click (design §3.1), never implicitly, so a persistent connection isn't warranted for v1.
const fetchToolCatalogue = async (connection: McpConnectionRow): Promise<McpToolCatalogueEntry[]> => {
    await assertPublicUrl(connection.url, { allowPrivate: connection.allowPrivateNetwork });

    const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
        fetch: ssrfGuardedFetch(connection.allowPrivateNetwork),
        requestInit: connection.bearerToken ? { headers: { Authorization: `Bearer ${connection.bearerToken}` } } : undefined
    });
    const client = new Client({ name: "story-labyrinth", version: "1.0.0" });

    try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        return tools.map(tool => ({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema }));
    } finally {
        await client.close().catch(() => {});
    }
};

// Refresh tools (M0's only outbound call) — writes the resulting catalogue + timestamp on
// success, or a surfaced error message on failure (never throws past this point; the route
// reports success/failure via the returned row, same shape as tts.ts's /voices/refresh).
export const refreshConnectionTools = async (id: string) => {
    const connection = await getConnection(id);
    if (!connection) return null;

    const [error, tools] = await attemptPromise(() => fetchToolCatalogue(connection));
    const now = new Date();
    const [updated] = await db
        .update(schema.mcpConnections)
        .set(
            error
                ? { lastToolsError: error.message, lastToolsFetch: now, updatedAt: now }
                : { toolsCatalogue: tools, lastToolsError: null, lastToolsFetch: now, updatedAt: now }
        )
        .where(eq(schema.mcpConnections.id, id))
        .returning();

    return { connection: updated, success: !error, error: error?.message };
};

// ── Tool call (M1) ───────────────────────────────────────────────────────────

const MCP_CALL_TIMEOUT_MS = 20_000;
const MCP_RESULT_MAX_CHARS = 8_000;
// Double-submit guard (design §3.2 "Idempotency | One Accept; guard double-submit; optional short
// requestId") — no existing idempotency precedent anywhere in this codebase, so this is new,
// deliberately the simplest thing that works for a trusted single-operator/household deployment
// (in-memory, single Node process, no DB table): a requestId seen again inside the window is
// rejected rather than re-executed. Lost on restart — acceptable, this only guards a double-click/
// double-submit, not a security boundary.
const RECENT_REQUEST_WINDOW_MS = 5 * 60 * 1000;
const recentRequestIds = new Map<string, number>();

const pruneRecentRequestIds = (now: number) => {
    for (const [id, seenAt] of recentRequestIds) {
        if (now - seenAt > RECENT_REQUEST_WINDOW_MS) recentRequestIds.delete(id);
    }
};

export type CallToolParams = { toolName: string; args: Record<string, unknown>; chatId: string; requestId?: string };
export type CallToolOutcome = { ok: true; chat: ChatRow } | { ok: false; status: number; error: string };

// Best-effort arg check against the connection's own cached tools/list schema (design §3.2
// "validate against cached input schema; reject bad args without calling MCP") — not a full
// JSON-Schema validator (no such dependency exists in this project), just "args is an object" plus
// "every declared required key is present", which is enough to reject obviously-wrong calls
// without ever reaching the remote server.
const validateArgs = (inputSchema: unknown, args: Record<string, unknown>): string | null => {
    if (typeof args !== "object" || args === null || Array.isArray(args)) return "args must be an object";
    const schemaObj = inputSchema as { required?: unknown } | null | undefined;
    if (!schemaObj || !Array.isArray(schemaObj.required)) return null;
    const missing = schemaObj.required.filter((key): key is string => typeof key === "string" && !(key in args));
    if (missing.length > 0) return `missing required arg(s): ${missing.join(", ")}`;
    return null;
};

const formatToolResultContent = (result: { content?: Array<{ type: string; text?: string }> }): string => {
    const text = (result.content ?? [])
        .map(part => (part.type === "text" && typeof part.text === "string" ? part.text : JSON.stringify(part)))
        .join("\n")
        .trim();
    const body = text || "(empty result)";
    if (body.length <= MCP_RESULT_MAX_CHARS) return body;
    return `${body.slice(0, MCP_RESULT_MAX_CHARS)}\n\n[truncated — ${body.length - MCP_RESULT_MAX_CHARS} more characters omitted]`;
};

// Executes a real tool call against an MCP connection on Accept (design §2.2/§3.2/§3.4). Never
// throws — every branch returns an outcome; a pre-call rejection (unknown connection/disabled/
// out-of-scope/unknown-tool/bad-args/duplicate-request) never touches the network and never writes
// a transcript message (the client leaves the proposal card up and surfaces the reason). Once the
// real MCP call is attempted, both success and failure are persisted as a tool_result message —
// "never fake success," and Accept always durably records what happened.
export const callConnectionTool = async (
    connectionId: string,
    { toolName, args, chatId, requestId }: CallToolParams
): Promise<CallToolOutcome> => {
    const now = Date.now();
    pruneRecentRequestIds(now);
    if (requestId) {
        if (recentRequestIds.has(requestId)) return { ok: false, status: 409, error: "This tool call was already submitted" };
        recentRequestIds.set(requestId, now);
    }

    const connection = await getConnection(connectionId);
    if (!connection) return { ok: false, status: 404, error: "Connection not found" };
    if (!connection.enabled) return { ok: false, status: 400, error: "Connection is disabled" };

    const chat = await getChatById(chatId);
    if (!chat) return { ok: false, status: 404, error: "Chat not found" };
    if (connection.scope === "story" && connection.storyId !== chat.storyId)
        return { ok: false, status: 403, error: "This connection is not in scope for this chat" };

    const cachedTool = (connection.toolsCatalogue as McpToolCatalogueEntry[]).find(tool => tool.name === toolName);
    if (!cachedTool) return { ok: false, status: 400, error: "Unknown tool — refresh this connection's tools first" };

    const argsError = validateArgs(cachedTool.inputSchema, args);
    if (argsError) return { ok: false, status: 400, error: argsError };

    const startedAt = Date.now();
    const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
        fetch: ssrfGuardedFetch(connection.allowPrivateNetwork),
        requestInit: connection.bearerToken ? { headers: { Authorization: `Bearer ${connection.bearerToken}` } } : undefined
    });
    const client = new Client({ name: "story-labyrinth", version: "1.0.0" });

    const [error, result] = await attemptPromise(async () => {
        await client.connect(transport);
        return client.callTool({ name: toolName, arguments: args }, undefined, { timeout: MCP_CALL_TIMEOUT_MS });
    });
    await client.close().catch(() => {});
    const durationMs = Date.now() - startedAt;

    const isError = Boolean(error) || Boolean(result?.isError);
    const content = error
        ? `Error calling ${toolName}: ${error.message}`
        : formatToolResultContent(result as { content?: Array<{ type: string; text?: string }> });

    console.log(`[mcp] call connection=${connectionId} tool=${toolName} status=${isError ? "error" : "success"} durationMs=${durationMs}`);

    const chatRow = await appendToolResultMessage(
        chatId,
        { connectionId, connectionName: connection.name, toolName, status: isError ? "error" : "success", durationMs },
        content
    );
    return { ok: true, chat: chatRow };
};
