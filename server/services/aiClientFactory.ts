import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { db, schema } from "../db/client.js";
import type { FeatureEndpoint, FeatureEndpoints, FeatureKey } from "../../src/types/aiSettings.js";
import { ensureFreshAccessToken } from "./grokOAuthClient.js";

type AiSettingsRow = typeof schema.aiSettings.$inferSelect;
type ClientAndModel = { client: OpenAI; model: string };

// ── Internal helpers ───────────────────────────────────────────────────────────

// Single source of truth for "get me a working Grok OAuth access token right now," transparently
// refreshing and persisting a rotated token back to the DB when needed — same refresh-then-persist
// pattern server/routes/ai.ts's GET /settings already does for the settings-page display, now
// also needed here since a per-feature endpoint can target grok-oauth directly.
const getFreshGrokOAuthToken = async (settings: AiSettingsRow): Promise<string | null> => {
    if (!settings.grokOAuthAccessToken) return null;
    const tokens = await ensureFreshAccessToken(settings);
    if (!tokens) return null;
    if (tokens.accessToken !== settings.grokOAuthAccessToken)
        await db
            .update(schema.aiSettings)
            .set({
                grokOAuthAccessToken: tokens.accessToken,
                grokOAuthRefreshToken: tokens.refreshToken ?? settings.grokOAuthRefreshToken,
                grokOAuthExpiresAt: tokens.expiresAt
            })
            .where(eq(schema.aiSettings.id, settings.id));
    return tokens.accessToken;
};

const clientFromEndpoint = async (endpoint: FeatureEndpoint, settings: AiSettingsRow): Promise<ClientAndModel> => {
    switch (endpoint.provider) {
        case "local":
            return {
                client: new OpenAI({
                    baseURL: endpoint.apiUrl ?? "http://localhost:1234/v1",
                    apiKey: "local"
                }),
                model: endpoint.model
            };
        case "openai":
            return {
                client: new OpenAI({ apiKey: endpoint.apiKey || settings.openaiKey || "" }),
                model: endpoint.model
            };
        case "openrouter":
            return {
                client: new OpenAI({
                    baseURL: endpoint.apiUrl ?? "https://openrouter.ai/api/v1",
                    apiKey: endpoint.apiKey || settings.openrouterKey || ""
                }),
                model: endpoint.model
            };
        case "grok":
            return {
                client: new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey: endpoint.apiKey || settings.grokKey || "" }),
                model: endpoint.model
            };
        case "grok-oauth": {
            const accessToken = await getFreshGrokOAuthToken(settings);
            if (!accessToken) throw new Error("Grok (xAI OAuth) is not connected. Connect it in AI Settings first.");
            return {
                client: new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey: accessToken }),
                model: endpoint.model
            };
        }
        case "local-inprocess":
            // No HTTP client exists for this provider — it's handled entirely inside
            // embeddingService.ts (embedTexts() checks the endpoint's provider before ever
            // calling buildClientForFeature). Reaching here means something tried to route a
            // non-embedding feature through it, which routes/admin.ts's validation should
            // already reject at write time — see docs/Local_Embeddings_Design.md.
            throw new Error(
                "'local-inprocess' has no HTTP client; it is only valid for the 'embedding' feature."
            );
    }
};

// Replicates the existing priority order: local → openai → openrouter → grok.
const clientFromGlobalSettings = (settings: AiSettingsRow): ClientAndModel | null => {
    if (settings.localApiUrl && settings.defaultLocalModel) {
        return {
            client: new OpenAI({ baseURL: settings.localApiUrl, apiKey: "local" }),
            model: settings.defaultLocalModel.replace("local/", "")
        };
    }
    if (settings.openaiKey && settings.defaultOpenAIModel) {
        return {
            client: new OpenAI({ apiKey: settings.openaiKey }),
            model: settings.defaultOpenAIModel
        };
    }
    if (settings.openrouterKey && settings.defaultOpenRouterModel) {
        return {
            client: new OpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: settings.openrouterKey
            }),
            model: settings.defaultOpenRouterModel
        };
    }
    if (settings.grokKey && settings.defaultGrokModel) {
        return {
            client: new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey: settings.grokKey }),
            model: settings.defaultGrokModel
        };
    }
    return null;
};

const parseEndpoints = (raw: string | null | undefined): FeatureEndpoints => {
    if (!raw) return {};
    try {
        return JSON.parse(raw) as FeatureEndpoints;
    } catch {
        return {};
    }
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build an OpenAI-compatible client for a specific feature.
 *
 * Resolution order:
 *   1. Per-feature override in aiSettings.featureEndpoints (if featureKey provided) - can target
 *      any of local/openai/openrouter/grok/grok-oauth directly, independent of the global default
 *   2. Global defaults: local → openai → openrouter → grok (grok-oauth is not part of this
 *      fallback chain - reach it via an explicit per-feature override)
 *
 * Returns null when no provider is configured at all.
 */
export const buildClientForFeature = async (
    featureKey?: FeatureKey
): Promise<ClientAndModel | null> => {
    const [settings] = await db.select().from(schema.aiSettings);
    if (!settings) return null;

    if (featureKey) {
        const endpoints = parseEndpoints(settings.featureEndpoints);
        const override = endpoints[featureKey];
        if (override) return clientFromEndpoint(override, settings);
    }

    return clientFromGlobalSettings(settings);
};

/**
 * Read the current per-feature endpoint map from the database.
 * Returns an empty object when no overrides are configured.
 */
export const getFeatureEndpoints = async (): Promise<FeatureEndpoints> => {
    const [settings] = await db.select().from(schema.aiSettings);
    return parseEndpoints(settings?.featureEndpoints);
};

/**
 * Write the entire per-feature endpoint map to the database (full replace).
 * Pass an empty object to clear all overrides.
 * Throws if no aiSettings row exists yet.
 */
export const setFeatureEndpoints = async (endpoints: FeatureEndpoints): Promise<void> => {
    const [settings] = await db.select().from(schema.aiSettings);
    if (!settings) throw new Error("AI settings not initialised");
    await db
        .update(schema.aiSettings)
        .set({ featureEndpoints: JSON.stringify(endpoints) })
        .where(eq(schema.aiSettings.id, settings.id));
};
