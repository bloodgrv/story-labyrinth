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

// Priority order: local → openai → openrouter → grok → grok-oauth. grok-oauth was added last
// (after plain grok) rather than left out of this chain entirely, per the user's explicit call —
// a feature with no per-feature override and no other provider configured should still be able to
// reach a connected xAI OAuth session, not dead-end into "no provider configured" when one is
// genuinely available. Async only because of this one branch (a token refresh may need to hit the
// network + persist a rotated token back to the DB, same as clientFromEndpoint's own case).
const clientFromGlobalSettings = async (settings: AiSettingsRow): Promise<ClientAndModel | null> => {
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
    if (settings.grokOAuthAccessToken && settings.defaultGrokOAuthModel) {
        const accessToken = await getFreshGrokOAuthToken(settings);
        if (accessToken) {
            return {
                client: new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey: accessToken }),
                model: settings.defaultGrokOAuthModel
            };
        }
        // Token present but couldn't be refreshed (revoked/expired past recovery) — fall through
        // to "no provider configured" rather than throwing, since this is a silent global
        // fallback, not an explicit user choice of grok-oauth the way a per-feature override is
        // (clientFromEndpoint's "grok-oauth" case still throws a clear error in that explicit case).
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
 *   2. Global defaults: local → openai → openrouter → grok → grok-oauth
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
 * Like buildClientForFeature, but never falls through to the global default — returns null
 * unless this exact feature has its own per-feature override configured.
 *
 * Needed for genuine multi-tier fallback chains (e.g. Auto Humanizer's
 * auto_humanizer-override -> humanizer-override -> global-default -> degrade, see
 * autoHumanizerService.ts): buildClientForFeature("auto_humanizer") on its own would never
 * return null just because auto_humanizer has no override — it silently succeeds via the global
 * default first, so a caller chaining `?? buildClientForFeature("humanizer")` would never
 * actually reach humanizer's override even when one exists. Confirmed live: an environment with
 * a working humanizer-specific override and a broken global default resolved auto_humanizer's
 * naive chain straight to the broken global connection instead of humanizer's working one.
 */
export const buildClientForFeatureOverrideOnly = async (
    featureKey: FeatureKey
): Promise<ClientAndModel | null> => {
    const [settings] = await db.select().from(schema.aiSettings);
    if (!settings) return null;

    const endpoints = parseEndpoints(settings.featureEndpoints);
    const override = endpoints[featureKey];
    if (!override) return null;

    return clientFromEndpoint(override, settings);
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
