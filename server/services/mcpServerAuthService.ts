import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

// MCP Server Expose (M4, docs/MCP_Tool_Connections_Design.md §4.2) — single standing install
// bearer token gating the /mcp endpoint. Mirrors authService.ts's session-token model (raw token
// shown once, only its SHA-256 hash ever persisted) rather than mcpConnectionService.ts's
// plaintext bearerToken storage — this token authenticates INBOUND calls only and is never
// reconstructed or sent anywhere by this app, unlike a stored connection's token which must stay
// plaintext to be echoed back out on every outbound call.

const TOKEN_BYTES = 32; // same size as authService.ts's SESSION_TOKEN_BYTES

const hashToken = (rawToken: string): string => createHash("sha256").update(rawToken).digest("hex");

type McpServerSettingsRow = typeof schema.mcpServerSettings.$inferSelect;

// Get-or-create singleton — mirrors humanizer.ts's own GET /settings handler (db.select() with no
// where; insert a default row if none exists). No fixed/well-known id needed.
export const getOrCreateSettings = async (): Promise<McpServerSettingsRow> => {
    const [existing] = await db.select().from(schema.mcpServerSettings);
    if (existing) return existing;

    const row: McpServerSettingsRow = {
        id: crypto.randomUUID(),
        enabled: false,
        tokenHash: null,
        tokenCreatedAt: null,
        updatedAt: new Date()
    };
    await db.insert(schema.mcpServerSettings).values(row);
    return row;
};

export const redactSettings = (row: McpServerSettingsRow) => ({
    enabled: row.enabled,
    hasToken: Boolean(row.tokenHash),
    tokenCreatedAt: row.tokenCreatedAt
});

export const setEnabled = async (enabled: boolean): Promise<McpServerSettingsRow> => {
    const current = await getOrCreateSettings();
    const [updated] = await db
        .update(schema.mcpServerSettings)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(schema.mcpServerSettings.id, current.id))
        .returning();
    return updated;
};

// Generates a new raw token, persists only its hash, and returns the raw value — the ONE time
// it's ever visible again after this call returns.
export const rotateInstallToken = async (): Promise<{ token: string; tokenCreatedAt: Date }> => {
    const current = await getOrCreateSettings();
    const rawToken = randomBytes(TOKEN_BYTES).toString("hex");
    const tokenCreatedAt = new Date();
    await db
        .update(schema.mcpServerSettings)
        .set({ tokenHash: hashToken(rawToken), tokenCreatedAt, updatedAt: tokenCreatedAt })
        .where(eq(schema.mcpServerSettings.id, current.id));
    return { token: rawToken, tokenCreatedAt };
};

export const revokeInstallToken = async (): Promise<McpServerSettingsRow> => {
    const current = await getOrCreateSettings();
    const [updated] = await db
        .update(schema.mcpServerSettings)
        .set({ tokenHash: null, tokenCreatedAt: null, updatedAt: new Date() })
        .where(eq(schema.mcpServerSettings.id, current.id))
        .returning();
    return updated;
};

// Constant-time compare — both values are fixed-length 64-char SHA-256 hex digests, so a plain
// `===` would leak timing information about how many leading characters match. A bearer token
// check doesn't get the browser session infra's other protections, so this is worth doing right.
export const verifyInstallToken = async (rawToken: string): Promise<boolean> => {
    const settings = await getOrCreateSettings();
    if (!settings.enabled || !settings.tokenHash) return false;
    const candidate = hashToken(rawToken);
    const stored = Buffer.from(settings.tokenHash, "hex");
    const supplied = Buffer.from(candidate, "hex");
    if (stored.length !== supplied.length) return false;
    return timingSafeEqual(stored, supplied);
};
