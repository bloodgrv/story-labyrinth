import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { generateHumanizedText } from "../services/humanizerService.js";
import type { HumanizerIntensity } from "../../src/types/humanizerSettings.js";

const router = express.Router();

router.get(
    "/settings",
    asyncHandler(async (_, res) => {
        const [settings] = await db.select().from(schema.humanizerSettings);
        if (!settings) {
            const initial = {
                id: crypto.randomUUID(),
                enabled: false,
                intensity: "medium",
                createdAt: new Date()
            };
            await db.insert(schema.humanizerSettings).values(initial);
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
        // A body containing only id/createdAt leaves `updates` empty — drizzle's .set({})
        // throws "No values to set" instead of a clean response. Treat it as a no-op.
        const result =
            Object.keys(updates).length === 0
                ? await db.select().from(schema.humanizerSettings).where(eq(schema.humanizerSettings.id, req.params.id))
                : await db
                      .update(schema.humanizerSettings)
                      .set(updates)
                      .where(eq(schema.humanizerSettings.id, req.params.id))
                      .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

router.post(
    "/rewrite",
    asyncHandler(async (req, res) => {
        const { text } = req.body as { text?: string };
        if (!text || !text.trim()) {
            res.json({ success: false, message: "No text provided" });
            return;
        }

        const [settings] = await db.select().from(schema.humanizerSettings);
        if (!settings?.enabled) {
            res.json({ success: false, message: "Humanizer is disabled — enable it in Settings" });
            return;
        }

        const result = await generateHumanizedText(text, settings.intensity as HumanizerIntensity);
        res.json(result);
    })
);

export default router;
