import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { db, schema } from "../db/client.js";
import type { FeatureEndpoint, FeatureEndpoints, FeatureKey } from "../../src/types/aiSettings.js";

type AiSettingsRow = typeof schema.aiSettings.$inferSelect;
type ClientAndModel = { client: OpenAI; model: string };

// ── Internal helpers ───────────────────────────────────────────────────────────

const clientFromEndpoint = (endpoint: FeatureEndpoint): ClientAndModel => {
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
                client: new OpenAI({ apiKey: endpoint.apiKey ?? "" }),
                model: endpoint.model
            };
        case "openrouter":
            return {
                client: new OpenAI({
                    baseURL: endpoint.apiUrl ?? "https://openrouter.ai/api/v1",
                    apiKey: endpoint.apiKey ?? ""
                }),
                model: endpoint.model
            };
        case "grok":
            return {
                client: new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey: endpoint.apiKey ?? "" }),
                model: endpoint.model
            };
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
 *   1. Per-feature override in aiSettings.featureEndpoints (if featureKey provided)
 *   2. Global defaults: local → openai → openrouter
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
        if (override) return clientFromEndpoint(override);
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
