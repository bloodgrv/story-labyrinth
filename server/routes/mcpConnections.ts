import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
    callConnectionTool,
    getConnection,
    listConnections,
    redactConnection,
    refreshConnectionTools
} from "../services/mcpConnectionService.js";

// M0 (docs/MCP_Tool_Connections_Design.md) — owner-only CRUD for registered MCP connections, plus
// the "Refresh tools" action. M1 adds the actual tool-call route. Whole router sits under
// requireOwner at the mount point in server/index.ts (every route here touches owner-only data —
// no per-route split needed, unlike tts.ts where most routes just use an already-stored secret).

const router = express.Router();

// M1/M3 — body for the real tool-call route (design §3.2/§3.5). args defaults to {} (the fence
// contract's own default); requestId is the optional double-submit guard token.
const callBodySchema = z
    .object({
        toolName: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
        chatId: z.string().min(1),
        requestId: z.string().min(1).max(100).optional()
    })
    .strict();

const upsertBodySchema = z
    .object({
        name: z.string().min(1),
        transport: z.literal("streamable_http").optional(),
        url: z.string().url(),
        bearerToken: z.string().optional(),
        clearToken: z.boolean().optional(),
        allowPrivateNetwork: z.boolean().optional(),
        scope: z.enum(["global", "story"]).optional(),
        storyId: z.string().nullable().optional(),
        enabled: z.boolean().optional()
    })
    .strict();

router.get(
    "/",
    asyncHandler(async (_req, res) => {
        const connections = await listConnections();
        res.json(connections.map(redactConnection));
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        const parsed = upsertBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid connection payload", details: parsed.error.issues });
            return;
        }
        const { clearToken: _clearToken, ...body } = parsed.data;
        if (body.scope === "story" && !body.storyId) {
            res.status(400).json({ error: "storyId is required when scope is 'story'" });
            return;
        }

        const now = new Date();
        const row = {
            id: crypto.randomUUID(),
            name: body.name,
            transport: body.transport ?? "streamable_http",
            url: body.url,
            bearerToken: body.bearerToken ?? null,
            allowPrivateNetwork: body.allowPrivateNetwork ?? false,
            scope: body.scope ?? "global",
            storyId: body.scope === "story" ? (body.storyId ?? null) : null,
            enabled: body.enabled ?? false,
            toolsCatalogue: [],
            lastToolsFetch: null,
            lastToolsError: null,
            createdAt: now,
            updatedAt: now
        };
        await db.insert(schema.mcpConnections).values(row);
        res.status(201).json(redactConnection(row as typeof schema.mcpConnections.$inferSelect));
    })
);

router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const existing = await getConnection(req.params.id);
        if (!existing) {
            res.status(404).json({ error: "Connection not found" });
            return;
        }

        const parsed = upsertBodySchema.partial({ name: true, url: true }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid connection payload", details: parsed.error.issues });
            return;
        }
        const { clearToken, bearerToken, storyId, scope, ...rest } = parsed.data;
        const nextScope = scope ?? existing.scope;
        if (nextScope === "story" && !(storyId ?? existing.storyId)) {
            res.status(400).json({ error: "storyId is required when scope is 'story'" });
            return;
        }

        // Redacted GET (mirrors B31/TTS) means the client can never round-trip a real token it
        // doesn't already know — omitting bearerToken must leave the stored value unchanged;
        // clearToken:true is the only explicit removal path.
        const tokenUpdate = clearToken ? { bearerToken: null } : bearerToken !== undefined ? { bearerToken } : {};

        const [updated] = await db
            .update(schema.mcpConnections)
            .set({
                ...rest,
                ...tokenUpdate,
                scope: nextScope,
                storyId: nextScope === "story" ? (storyId ?? existing.storyId) : null,
                updatedAt: new Date()
            })
            .where(eq(schema.mcpConnections.id, req.params.id))
            .returning();
        res.json(redactConnection(updated));
    })
);

router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const existing = await getConnection(req.params.id);
        if (!existing) {
            res.status(404).json({ error: "Connection not found" });
            return;
        }
        await db.update(schema.mcpConnections).set({ deletedAt: new Date() }).where(eq(schema.mcpConnections.id, req.params.id));
        res.json({ success: true });
    })
);

router.post(
    "/:id/refresh-tools",
    asyncHandler(async (req, res) => {
        const [error, result] = await attemptPromise(() => refreshConnectionTools(req.params.id));
        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }
        if (!result) {
            res.status(404).json({ error: "Connection not found" });
            return;
        }
        res.json({ success: result.success, error: result.error, connection: redactConnection(result.connection) });
    })
);

// M1 — the real tool-call route (design §3.2/§3.3/§3.5). Chat-side Accept posts here; every
// rejection branch inside callConnectionTool maps straight to its own status/error, success maps
// to the updated chat row (same shape POST /:chatId/messages already returns).
router.post(
    "/:id/call",
    asyncHandler(async (req, res) => {
        const parsed = callBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid tool call payload", details: parsed.error.issues });
            return;
        }
        const outcome = await callConnectionTool(req.params.id, parsed.data);
        if (!outcome.ok) {
            res.status(outcome.status).json({ error: outcome.error });
            return;
        }
        res.json(outcome.chat);
    })
);

export default router;
