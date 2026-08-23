import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ensureFreshAccessToken, pollDeviceToken, startDeviceFlow } from "../services/grokOAuthClient.js";
import { streamGrokSession } from "../services/grokSessionClient.js";

const router = express.Router();

router.get(
    "/settings",
    asyncHandler(async (_, res) => {
        const [settings] = await db.select().from(schema.aiSettings);
        if (!settings) {
            // Explicitly pass every JSON-mode column here rather than leaving it to its SQL-level
            // DEFAULT — found live against a genuinely fresh production DB (never caught in dev,
            // since the dev DB already had a settings row from before these columns existed):
            // when a `{mode:"json"}` column's value comes purely from SQLite's own DEFAULT clause
            // (never passed through drizzle's own `.values()`), drizzle-orm's better-sqlite3 driver
            // does NOT run its JSON deserializer on a later `.select()` of that row — it returns
            // the raw stored string (`"[]"`), not a parsed array, crashing the client's
            // `.find()`/`.map()` calls on it. `availableModels` never hit this because it's always
            // been passed explicitly, every time, everywhere. Confirmed root cause directly against
            // the raw DB: the exact same bytes, read back correctly as an array once the row's
            // insert had explicitly included the column — so the fix is "never rely on a JSON-mode
            // column's SQL DEFAULT," not a client-side workaround.
            await db.insert(schema.aiSettings).values({
                id: crypto.randomUUID(),
                availableModels: [],
                preferredMode: "cloud" as const,
                createdAt: new Date(),
                localInjectEnabled: false,
                localInjectBody: "",
                localInjectPresets: []
            });
            const [freshlyInserted] = await db.select().from(schema.aiSettings);
            res.json(freshlyInserted);
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
        const setValues = {
            ...updates,
            ...(lastModelsFetch && { lastModelsFetch: new Date(lastModelsFetch) })
        };
        // A body containing only id/createdAt/a falsy lastModelsFetch leaves `setValues`
        // empty — drizzle's .set({}) throws "No values to set" instead of a clean response.
        // Treat it as a no-op.
        const result =
            Object.keys(setValues).length === 0
                ? await db.select().from(schema.aiSettings).where(eq(schema.aiSettings.id, req.params.id))
                : await db.update(schema.aiSettings).set(setValues).where(eq(schema.aiSettings.id, req.params.id)).returning();
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
