import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getOrCreateSettings, verifyInstallToken } from "../services/mcpServerAuthService.js";
import { createMcpServer } from "../services/mcpServerService.js";

// M4 (docs/MCP_Tool_Connections_Design.md §4.1/§4.2) — the actual /mcp protocol endpoint. Mounted
// as a NEW TOP-LEVEL route in server/index.ts (NOT under /api), so it does not inherit the
// session-cookie requireAuth gate — external MCP clients have no browser session, hence the
// dedicated bearer-token middleware below instead.

const router = express.Router();

router.post(
    "/",
    asyncHandler(async (req, res) => {
        // Checked first and unconditionally: a disabled feature responds 404 rather than 401/403,
        // regardless of what (if anything) the caller sent — it shouldn't confirm to an
        // unauthenticated prober that an MCP endpoint exists at all here (design's own "server off
        // by default" posture).
        const settings = await getOrCreateSettings();
        if (!settings.enabled) {
            res.status(404).end();
            return;
        }

        const authHeader = req.header("authorization") ?? "";
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (!match) {
            res.status(401).json({ error: "Missing or malformed Authorization header" });
            return;
        }
        const ok = await verifyInstallToken(match[1]);
        if (!ok) {
            res.status(401).json({ error: "Invalid or expired token" });
            return;
        }

        // Stateless mode (sessionIdGenerator: undefined) — a fresh short-lived transport per
        // request, same shape verified during M1-M3's own disposable test MCP server build.
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    })
);

export default router;
