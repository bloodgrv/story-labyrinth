import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = express.Router();

router.get(
    "/settings",
    asyncHandler(async (_, res) => {
        const [settings] = await db.select().from(schema.writerPrefsSettings);
        if (!settings) {
            const initial = {
                id: crypto.randomUUID(),
                autoDistillEnabled: false,
                createdAt: new Date()
            };
            await db.insert(schema.writerPrefsSettings).values(initial);
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
            .update(schema.writerPrefsSettings)
            .set(updates)
            .where(eq(schema.writerPrefsSettings.id, req.params.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

export default router;
