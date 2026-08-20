import type { AIModel, AIProvider, AISettings, ChatMode } from "@/types/story";

// Chat Model Routing (MR1, docs/Chat_Model_Routing_And_Chrome_Design.md) — pure logic, no React/
// query dependencies, so it's unit-worthy in isolation. Fixed cloud priority when no last-used
// cloud provider is still configured (M3, decision B — "implicit", no separate primary-provider
// dropdown in v1). grok-session is deliberately excluded from this list (never was in the doc's
// priority order — it's a Grok sub-variant reached via cookie, not a first-class settings default).
const CLOUD_PRIORITY: AIProvider[] = ["grok", "openrouter", "deepseek", "openai", "gemini", "grok-oauth"];

const DEFAULT_MODEL_FIELD: Record<AIProvider, keyof AISettings> = {
    local: "defaultLocalModel",
    openai: "defaultOpenAIModel",
    openrouter: "defaultOpenRouterModel",
    deepseek: "defaultDeepSeekModel",
    gemini: "defaultGeminiModel",
    grok: "defaultGrokModel",
    "grok-session": "defaultGrokSessionModel",
    "grok-oauth": "defaultGrokOAuthModel"
};

function getDefaultModelIdForProvider(provider: AIProvider, settings: AISettings): string | undefined {
    return settings[DEFAULT_MODEL_FIELD[provider]] as string | undefined;
}

// A provider is "configured" for routing purposes when it has both a key/URL AND a chosen
// default model — mirrors server/services/aiClientFactory.ts's clientFromGlobalSettings check,
// just reimplemented client-side since that function isn't reachable from the browser bundle.
function isProviderConfigured(provider: AIProvider, settings: AISettings): boolean {
    const defaultModel = getDefaultModelIdForProvider(provider, settings);
    if (!defaultModel) return false;
    switch (provider) {
        case "local":
            return !!settings.localApiUrl;
        case "openai":
            return !!settings.openaiKey;
        case "openrouter":
            return !!settings.openrouterKey;
        case "deepseek":
            return !!settings.deepseekKey;
        case "gemini":
            return !!settings.geminiKey;
        case "grok":
            return !!settings.grokKey;
        case "grok-session":
            return !!settings.grokSessionCookie;
        case "grok-oauth":
            return !!settings.grokOAuthAccessToken;
        default:
            return false;
    }
}

export function getModeForProvider(provider: AIProvider): ChatMode {
    return provider === "local" ? "local" : "cloud";
}

// M1/M2/M3/M4 — the mode's own default model, preferring the given cloud provider (typically
// wherever a chat's own lastUsedModelId currently points) if it's still configured, else falling
// back to the fixed cloud priority order. Returns undefined if nothing in that mode is configured
// (M5 callers should treat that as "leave unset", never throw).
export function computeModeDefaultModelId(
    mode: ChatMode,
    settings: AISettings,
    preferredCloudProvider?: AIProvider
): string | undefined {
    if (mode === "local")
        return isProviderConfigured("local", settings) ? settings.defaultLocalModel : undefined;


    if (
        preferredCloudProvider &&
        preferredCloudProvider !== "local" &&
        isProviderConfigured(preferredCloudProvider, settings)
    )
        return getDefaultModelIdForProvider(preferredCloudProvider, settings);


    for (const provider of CLOUD_PRIORITY)
        if (isProviderConfigured(provider, settings)) return getDefaultModelIdForProvider(provider, settings);


    return undefined;
}

interface ResolveChatDefaultModelParams {
    mode: ChatMode;
    settings: AISettings;
    lastUsedModelId: string | undefined;
    availableModels: AIModel[];
    // Settings → Providers & Keys → Feature Endpoints' override for this chat type's Feature
    // Routing row (World-Building Chat / Editor Chat), if any — the model id it names, exactly as
    // it appears in `availableModels` (FeatureEndpointsCard.tsx's own model picker is drawn from
    // that same catalogue, so this is always a real id when the override exists and its provider
    // is still configured). Chat types with no Feature Routing row (Brainstorm/Outline/Notes/
    // Research) simply never pass one.
    featureOverrideModelId?: string;
}

// M5/M6 — initial resolution for a chat (new chat, or opening an existing one). Keeps
// lastUsedModelId as-is whenever it's still a real model in the catalogue (M6), regardless of the
// global preferred mode; only falls back to the mode's default when there's nothing valid to keep.
//
// 2026-08-15 QA fix: previously fell straight through to computeModeDefaultModelId/CLOUD_PRIORITY
// no matter what Feature Routing said for this chat type — job-queue AI calls already checked
// their feature override first (server/services/aiClientFactory.ts's buildClientForFeature), live
// chat never did. featureOverrideModelId now gets the same override-then-fallback priority,
// directly below lastUsedModelId (an explicit prior choice still wins over routing).
export function resolveChatDefaultModel({
    mode,
    settings,
    lastUsedModelId,
    availableModels,
    featureOverrideModelId
}: ResolveChatDefaultModelParams): string | undefined {
    if (lastUsedModelId && availableModels.some(m => m.id === lastUsedModelId)) return lastUsedModelId;

    if (featureOverrideModelId && availableModels.some(m => m.id === featureOverrideModelId))
        return featureOverrideModelId;

    // B19 fix: computeModeDefaultModelId reads straight out of AI settings (defaultGrokModel,
    // defaultLocalModel, ...) with no validation against the actual model catalogue — a stale
    // saved default, a rotated provider key, or an unreachable local server can all leave it
    // naming a model that no longer exists. Returning that unvalidated here meant
    // useChatSystemPrompt.ts would resolve selectedModel to null AND persist the bad id back to
    // the chat row, so the chat's Send button stayed silently, permanently dead across reloads.
    const fallback = computeModeDefaultModelId(mode, settings);
    return fallback && availableModels.some(m => m.id === fallback) ? fallback : undefined;
}

interface ResolveModelForModeSwitchParams {
    newMode: ChatMode;
    settings: AISettings;
    currentModelId: string | undefined;
    availableModels: AIModel[];
}

// M7 toggle clarification — when the user flips the chat's Cloud|Local control: keep the current
// model only if it already belongs to the new mode; otherwise jump to that mode's own default.
export function resolveModelForModeSwitch({
    newMode,
    settings,
    currentModelId,
    availableModels
}: ResolveModelForModeSwitchParams): string | undefined {
    const currentModel = currentModelId ? availableModels.find(m => m.id === currentModelId) : undefined;
    if (currentModel && getModeForProvider(currentModel.provider) === newMode) return currentModel.id;

    // B19 fix — same unvalidated-fallback risk as resolveChatDefaultModel above.
    const fallback = computeModeDefaultModelId(newMode, settings, currentModel?.provider);
    return fallback && availableModels.some(m => m.id === fallback) ? fallback : undefined;
}
