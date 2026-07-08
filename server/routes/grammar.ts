import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { checkGrammar, testGrammarConnection } from "../services/grammarService.js";

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
        const [settings] = await db.select().from(schema.grammarSettings);
        if (!settings) {
            const initial = {
                id: crypto.randomUUID(),
                enabled: false,
                serverUrl: "http://localhost:8010",
                language: "auto",
                createdAt: new Date()
            };
            await db.insert(schema.grammarSettings).values(initial);
            res.json(initial);
            return;
        }
        res.json(settings);
    })
);

router.put(
    "/settings/:id",
    asyncHandler(async (req, res) => {
        const { id: _id, createdAt: _createdAt, ...updates } = req.body;
        const result = await db
            .update(schema.grammarSettings)
            .set(updates)
            .where(eq(schema.grammarSettings.id, req.params.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

router.post(
    "/test-connection",
    asyncHandler(async (req, res) => {
        const { serverUrl } = req.body as { serverUrl?: string };
        if (!serverUrl) {
            res.status(400).json({ success: false, message: "Server URL is required" });
            return;
        }
        const result = await testGrammarConnection(serverUrl);
        res.json(result);
    })
);

router.post(
    "/check",
    asyncHandler(async (req, res) => {
        const { text } = req.body as { text?: string };
        if (!text || !text.trim()) {
            res.json({ success: true, matches: [] });
            return;
        }

        const [settings] = await db.select().from(schema.grammarSettings);
        if (!settings?.enabled) {
            res.json({ success: false, message: "Grammar Checker is disabled — enable it in Settings" });
            return;
        }

        const result = await checkGrammar(text, settings.serverUrl, settings.language);
        res.json(result);
    })
);

export default router;
