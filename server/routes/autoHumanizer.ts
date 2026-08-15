import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { detectAiText } from "../services/aiTextDetector.js";
import { getAutoHumanizerSettings, processAutoHumanize } from "../services/autoHumanizerService.js";

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
        res.json(await getAutoHumanizerSettings());
    })
);

router.put(
    "/settings/:id",
    asyncHandler(async (req, res) => {
        const { id: _id, createdAt: _createdAt, ...updates } = req.body;
        const result = await db
            .update(schema.autoHumanizerSettings)
            .set(updates)
            .where(eq(schema.autoHumanizerSettings.id, req.params.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

// No LLM — synchronous local heuristic scoring only. Used by process() internally and, later,
// an optional "Test detect on selection" UI (design doc's v1.1 polish note).
router.post(
    "/detect",
    asyncHandler(async (req, res) => {
        const { text } = req.body as { text?: string };
        if (!text || !text.trim()) {
            res.json({ score: 0, verdict: "human", signals: {}, matchedPhrases: [] });
            return;
        }
        res.json(detectAiText(text));
    })
);

router.post(
    "/process",
    asyncHandler(async (req, res) => {
        const { text } = req.body as { text?: string };
        if (!text || !text.trim()) {
            res.json({ success: true, skipped: true, text: text ?? "" });
            return;
        }
        res.json(await processAutoHumanize(text));
    })
);

export default router;
