import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { detectAiText } from "../services/aiTextDetector.js";
import { getAutoHumanizerSettings, processAutoHumanize } from "../services/autoHumanizerService.js";

const router = express.Router();

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
        // A body containing only id/createdAt leaves `updates` empty — drizzle's .set({})
        // throws "No values to set" instead of a clean response. Treat it as a no-op.
        const result =
            Object.keys(updates).length === 0
                ? await db.select().from(schema.autoHumanizerSettings).where(eq(schema.autoHumanizerSettings.id, req.params.id))
                : await db
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
