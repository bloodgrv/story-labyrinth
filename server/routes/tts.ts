import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { getTtsProviderAdapter } from "../services/ttsProviders.js";
import type { TtsAvailableVoices, TtsProviderConfigs } from "../../src/types/ttsSettings.js";

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
        const [settings] = await db.select().from(schema.ttsSettings);
        if (!settings) {
            const initial = {
                id: crypto.randomUUID(),
                enabled: false,
                activeProvider: "speechify",
                providers: {},
                availableVoices: {},
                createdAt: new Date()
            };
            await db.insert(schema.ttsSettings).values(initial);
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
            .update(schema.ttsSettings)
            .set(updates)
            .where(eq(schema.ttsSettings.id, req.params.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated);
    })
);

router.post(
    "/test-connection",
    asyncHandler(async (req, res) => {
        const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
        if (!provider || !apiKey) {
            res.status(400).json({ success: false, message: "Provider and API key are required" });
            return;
        }

        const adapter = getTtsProviderAdapter(provider);
        if (!adapter) {
            res.json({ success: false, message: `Unknown TTS provider: ${provider}` });
            return;
        }

        const result = await adapter.testConnection(apiKey);
        res.json(result);
    })
);

router.post(
    "/voices/refresh",
    asyncHandler(async (req, res) => {
        const { provider } = req.body as { provider?: string };
        if (!provider) {
            res.status(400).json({ success: false, message: "Provider is required" });
            return;
        }

        const adapter = getTtsProviderAdapter(provider);
        if (!adapter) {
            res.json({ success: false, message: `Unknown TTS provider: ${provider}` });
            return;
        }

        const [settings] = await db.select().from(schema.ttsSettings);
        const providers = (settings?.providers ?? {}) as TtsProviderConfigs;
        const apiKey = providers[provider as keyof TtsProviderConfigs]?.apiKey;
        if (!settings || !apiKey) {
            res.json({ success: false, message: `No API key configured for ${provider}` });
            return;
        }

        const [error, voices] = await attemptPromise(() => adapter.fetchVoices(apiKey));
        if (error) {
            res.json({ success: false, message: error.message });
            return;
        }

        const availableVoices: TtsAvailableVoices = {
            ...(settings.availableVoices as TtsAvailableVoices),
            [provider]: voices
        };

        const result = await db
            .update(schema.ttsSettings)
            .set({ availableVoices, lastVoicesFetch: new Date() })
            .where(eq(schema.ttsSettings.id, settings.id))
            .returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json({ success: true, settings: updated });
    })
);

router.post(
    "/generate",
    asyncHandler(async (req, res) => {
        const {
            provider: requestedProvider,
            voiceId: requestedVoiceId,
            text
        } = req.body as { provider?: string; voiceId?: string; text?: string };

        if (!text || !text.trim()) {
            res.status(400).json({ error: "Text is required" });
            return;
        }

        const [settings] = await db.select().from(schema.ttsSettings);
        if (!settings) {
            res.status(400).json({ error: "TTS is not configured yet" });
            return;
        }
        if (!settings.enabled) {
            res.status(400).json({ error: "Text-to-speech is disabled — enable it in Settings" });
            return;
        }

        const provider = requestedProvider ?? settings.activeProvider;
        const adapter = getTtsProviderAdapter(provider);
        if (!adapter) {
            res.status(400).json({ error: `Unknown TTS provider: ${provider}` });
            return;
        }

        const providers = (settings.providers ?? {}) as TtsProviderConfigs;
        const providerConfig = providers[provider as keyof TtsProviderConfigs];
        const apiKey = providerConfig?.apiKey;
        if (!apiKey) {
            res.status(400).json({ error: `No API key configured for ${provider}` });
            return;
        }

        const voiceId = requestedVoiceId ?? providerConfig?.defaultVoiceId;
        if (!voiceId) {
            res.status(400).json({ error: "No voice selected — choose a default voice in Settings" });
            return;
        }

        const result = await adapter.generateSpeech(apiKey, { text, voiceId });
        if (!result.success) {
            res.status(502).json({ error: result.message });
            return;
        }

        res.set("Content-Type", result.mimeType);
        res.send(result.audio);
    })
);

router.get(
    "/story/:storyId/voice",
    asyncHandler(async (req, res) => {
        const [pref] = await db
            .select()
            .from(schema.storyTtsPreferences)
            .where(eq(schema.storyTtsPreferences.storyId, req.params.storyId));
        res.json(pref ?? null);
    })
);

router.put(
    "/story/:storyId/voice",
    asyncHandler(async (req, res) => {
        const { provider, voiceId } = req.body as { provider?: string; voiceId?: string };
        if (!provider || !voiceId) {
            res.status(400).json({ error: "Provider and voiceId are required" });
            return;
        }

        const [existing] = await db
            .select()
            .from(schema.storyTtsPreferences)
            .where(eq(schema.storyTtsPreferences.storyId, req.params.storyId));

        if (existing) {
            const result = await db
                .update(schema.storyTtsPreferences)
                .set({ provider, voiceId, updatedAt: new Date() })
                .where(eq(schema.storyTtsPreferences.id, existing.id))
                .returning();
            res.json(Array.isArray(result) ? result[0] : result);
            return;
        }

        const created = {
            id: crypto.randomUUID(),
            storyId: req.params.storyId,
            provider,
            voiceId,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await db.insert(schema.storyTtsPreferences).values(created);
        res.json(created);
    })
);

router.delete(
    "/story/:storyId/voice",
    asyncHandler(async (req, res) => {
        await db.delete(schema.storyTtsPreferences).where(eq(schema.storyTtsPreferences.storyId, req.params.storyId));
        res.json({ success: true });
    })
);

export default router;
