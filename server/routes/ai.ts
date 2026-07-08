import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { ensureFreshAccessToken, pollDeviceToken, startDeviceFlow } from "../services/grokOAuthClient.js";
import { streamGrokSession } from "../services/grokSessionClient.js";

const router = express.Router();

const asyncHandler =
    (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
    async (req: express.Request, res: express.Response) => {
        const [error] = await attemptPromise(() => fn(req, res));
        if (error) {
            console.error("Error:", error);
            res.status(500).json({ error: error.message || "Server error" });
        }
    };

router.get(
    "/settings",
    asyncHandler(async (_, res) => {
        const [settings] = await db.select().from(schema.aiSettings);
        if (!settings) {
            const initial = {
                id: crypto.randomUUID(),
                availableModels: [],
                createdAt: new Date()
            };
            await db.insert(schema.aiSettings).values(initial);
            res.json(initial);
            return;
        }

        // Transparently keep the xAI OAuth access token fresh so the frontend can always use
        // whatever's in this response directly, same as every other provider's static key.
        if (settings.grokOAuthAccessToken) {
            const tokens = await ensureFreshAccessToken(settings);
            if (tokens && tokens.accessToken !== settings.grokOAuthAccessToken) {
                await db
                    .update(schema.aiSettings)
                    .set({
                        grokOAuthAccessToken: tokens.accessToken,
                        grokOAuthRefreshToken: tokens.refreshToken ?? settings.grokOAuthRefreshToken,
                        grokOAuthExpiresAt: tokens.expiresAt
                    })
                    .where(eq(schema.aiSettings.id, settings.id));
                settings.grokOAuthAccessToken = tokens.accessToken;
                settings.grokOAuthRefreshToken = tokens.refreshToken ?? settings.grokOAuthRefreshToken;
                settings.grokOAuthExpiresAt = tokens.expiresAt;
            }
        }

        res.json(settings);
    })
);

router.put(
    "/settings/:id",
    asyncHandler(async (req, res) => {
        const { id: _id, createdAt: _createdAt, lastModelsFetch, ...updates } = req.body;
        const result = await db
            .update(schema.aiSettings)
            .set({
                ...updates,
                ...(lastModelsFetch && { lastModelsFetch: new Date(lastModelsFetch) })
            })
            .where(eq(schema.aiSettings.id, req.params.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

// Proxies generation to grok.com using a stored session cookie. Unlike every other provider,
// this can't be called directly from the browser: browsers can't set a `Cookie` header on a
// cross-origin request, and grok.com won't grant our origin CORS anyway. So the client hits
// this route, and we forward to grok.com server-side, converting its response into the same
// OpenAI-style SSE shape the "local" provider already produces natively.
router.post(
    "/grok-session/generate",
    asyncHandler(async (req, res) => {
        const [settings] = await db.select().from(schema.aiSettings);
        if (!settings?.grokSessionCookie) {
            res.status(400).json({ error: "SuperGrok session cookie not configured" });
            return;
        }

        const { messages, model } = req.body;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");

        const abortController = new AbortController();
        req.on("close", () => abortController.abort());

        const [error] = await attemptPromise(async () => {
            for await (const token of streamGrokSession(
                settings.grokSessionCookie as string,
                messages,
                model,
                abortController.signal
            )) {
                const chunk = { choices: [{ delta: { content: token } }] };
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
        });

        if (error && !abortController.signal.aborted) console.error("[grok-session] stream error:", error);

        res.write("data: [DONE]\n\n");
        res.end();
    })
);

// xAI OAuth device-flow: the frontend starts a flow, shows the user a code + link, then polls
// this route at the returned interval until the user finishes approving it in their browser.
router.post(
    "/grok-oauth/device/start",
    asyncHandler(async (_, res) => {
        const authorization = await startDeviceFlow();
        res.json(authorization);
    })
);

router.post(
    "/grok-oauth/device/poll",
    asyncHandler(async (req, res) => {
        const { deviceCode } = req.body;
        const result = await pollDeviceToken(deviceCode);

        if (result.status === "complete") {
            const [settings] = await db.select().from(schema.aiSettings);
            if (settings)
                await db
                    .update(schema.aiSettings)
                    .set({
                        grokOAuthAccessToken: result.tokens.accessToken,
                        grokOAuthRefreshToken: result.tokens.refreshToken,
                        grokOAuthExpiresAt: result.tokens.expiresAt
                    })
                    .where(eq(schema.aiSettings.id, settings.id));
        }

        res.json(result);
    })
);

export default router;
