import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { attemptPromise } from "@jfdi/attempt";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { assertPublicUrl } from "../lib/ssrfSafeFetch.js";
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
