import { attemptPromise } from "@jfdi/attempt";
import { eq } from "drizzle-orm";
import express from "express";
import { db, schema } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireOwner } from "../middleware/auth.js";
import { getTtsProviderAdapter } from "../services/ttsProviders.js";
import type { TtsAvailableVoices, TtsProviderConfig, TtsProviderConfigs } from "../../src/types/ttsSettings.js";

const router = express.Router();

// B31 (docs/CODE_REVIEW_2026-08-17.md) — this whole router sits under editor-level auth (just
// `requireAuth`/`blockViewerMutations`, applied globally in server/index.ts, matching
// `/api/codex`'s posture) so any signed-in user can play back TTS, which is the desk's actual
// job. `/settings` is different: it's where the raw provider API key lives, so those two routes
// specifically get `requireOwner` (matching `/api/ai`'s own posture) plus response redaction
// below — every other route here (generate/test-connection/voices/refresh/per-story voice) reads
// the stored key server-side and never echoes it back, so they stay reachable without needing
// owner rights.

type TtsSettingsRow = typeof schema.ttsSettings.$inferSelect;

// Strips the raw apiKey out of every provider's config before it goes over the wire, replacing it
// with a `hasApiKey` boolean the UI can use to render "a key is already saved" without ever
// re-transmitting the secret itself.
const redactSettings = (settings: TtsSettingsRow) => ({
    ...settings,
    providers: Object.fromEntries(
        Object.entries((settings.providers ?? {}) as TtsProviderConfigs).map(([providerId, config]) => {
            const { apiKey, ...rest } = (config ?? {}) as TtsProviderConfig;
            return [providerId, { ...rest, hasApiKey: Boolean(apiKey) }];
        })
    )
});


router.get(
    "/settings",
    requireOwner,
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
            res.json(redactSettings(initial as TtsSettingsRow));
            return;
        }
        res.json(redactSettings(settings));
    })
);

router.put(
    "/settings/:id",
    requireOwner,
    asyncHandler(async (req, res) => {
        const { id: _id, createdAt: _createdAt, ...updates } = req.body as Record<string, unknown>;

        // Redacted GET means the client can never round-trip a real apiKey it doesn't already
        // know — a payload that omits `apiKey` on a provider (every write except an explicit
        // "Save" of a freshly typed key) must NOT blank out whatever key is already stored.
        // Per-field merge onto the existing row, not a full-column overwrite, for `providers` only.
        if (updates.providers && typeof updates.providers === "object") {
            const [existing] = await db.select().from(schema.ttsSettings).where(eq(schema.ttsSettings.id, req.params.id));
            const existingProviders = (existing?.providers ?? {}) as TtsProviderConfigs;
            const incomingProviders = updates.providers as TtsProviderConfigs;
            const mergedProviders: TtsProviderConfigs = { ...existingProviders };
            for (const [providerId, incomingConfig] of Object.entries(incomingProviders))
                mergedProviders[providerId as keyof TtsProviderConfigs] = {
                    ...existingProviders[providerId as keyof TtsProviderConfigs],
                    ...incomingConfig
                };
            updates.providers = mergedProviders;
        }

        // A body containing only id/createdAt leaves `updates` empty — drizzle's .set({})
        // throws "No values to set" instead of a clean response. Treat it as a no-op.
        const result =
            Object.keys(updates).length === 0
                ? await db.select().from(schema.ttsSettings).where(eq(schema.ttsSettings.id, req.params.id))
                : await db.update(schema.ttsSettings).set(updates).where(eq(schema.ttsSettings.id, req.params.id)).returning();
        const updated = Array.isArray(result) ? result[0] : result;
        res.json(updated ? redactSettings(updated) : updated);
    })
);

router.post(
    "/test-connection",
    asyncHandler(async (req, res) => {
        const { provider, apiKey: requestApiKey } = req.body as { provider?: string; apiKey?: string };
        if (!provider) {
            res.status(400).json({ success: false, message: "Provider is required" });
            return;
        }

        const adapter = getTtsProviderAdapter(provider);
        if (!adapter) {
            res.json({ success: false, message: `Unknown TTS provider: ${provider}` });
            return;
        }

        // Redacted GET (B31) means the client can't re-send an already-saved key to test it
        // without the user retyping it — fall back to the server's own stored key, same lookup
        // voices/refresh below already does, so "Test Connection" on an already-saved key still
        // works with nothing typed in the field.
        let apiKey = requestApiKey;
        if (!apiKey) {
            const [settings] = await db.select().from(schema.ttsSettings);
            apiKey = (settings?.providers as TtsProviderConfigs | undefined)?.[provider as keyof TtsProviderConfigs]?.apiKey;
        }
        if (!apiKey) {
            res.status(400).json({ success: false, message: "Provider and API key are required" });
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
