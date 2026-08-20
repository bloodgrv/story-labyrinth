import express from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
    getOrCreateSettings,
    redactSettings,
    revokeInstallToken,
    rotateInstallToken,
    setEnabled
} from "../services/mcpServerAuthService.js";

// M4 (docs/MCP_Tool_Connections_Design.md §4.3) — owner-only Settings CRUD for exposing this app's
// own /mcp endpoint. Whole router sits under requireOwner at the mount point in server/index.ts,
// same posture as mcpConnections.ts.

const router = express.Router();

router.get(
    "/settings",
    asyncHandler(async (_req, res) => {
        res.json(redactSettings(await getOrCreateSettings()));
    })
);

const enabledBodySchema = z.object({ enabled: z.boolean() }).strict();

router.put(
    "/settings",
    asyncHandler(async (req, res) => {
        const parsed = enabledBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
            return;
        }
        res.json(redactSettings(await setEnabled(parsed.data.enabled)));
    })
);

// Response includes the raw token this one time — the client must show it to the user immediately
// and never persist/refetch it (see design §4.2 "show once, never echo later").
router.post(
    "/settings/rotate-token",
    asyncHandler(async (_req, res) => {
        const { token, tokenCreatedAt } = await rotateInstallToken();
        res.json({ token, tokenCreatedAt });
    })
);

router.post(
    "/settings/revoke-token",
    asyncHandler(async (_req, res) => {
        res.json(redactSettings(await revokeInstallToken()));
    })
);

export default router;
