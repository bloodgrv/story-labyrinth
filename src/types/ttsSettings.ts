// Text-to-Speech (TTS) settings.
//
// Provider-agnostic by design: each provider's config lives as an entry in the `providers`
// JSON blob (see TtsSettings.providers), keyed by provider id. Adding a new provider later
// (ElevenLabs, OpenAI TTS, Web Speech API, ...) means adding one entry to `TTS_PROVIDERS`
// below and one TtsProviderAdapter server-side (see server/services/ttsProviders.ts, which has
// the full "how to add a provider" checklist) — no schema migration and no changes to the
// settings UI or API routes.
//
// Map of the system, client → server:
//   TtsSettingsCard / StoryVoiceCard   — settings UI (global + per-project voice)
//   VoiceCombobox                     — shared voice picker used by both cards above
//   TtsPlayButton                     — the actual "read this text aloud" control, dropped
//                                        next to assistant messages in chat UIs
//   useTtsPlayback                    — play/pause/resume state machine + <audio> lifecycle,
//                                        the one thing every playback surface shares
//   useTtsSettingsQuery / useStoryTtsVoiceQuery — React Query hooks wrapping ttsApi
//   ttsApi (services/api/client.ts)   — thin fetch wrappers, POST /api/tts/generate returns
//                                        a Blob (see fetchBlob in apiFactory.ts), not JSON
//   server/routes/tts.ts              — settings CRUD, test-connection, voices/refresh,
//                                        generate, per-story voice CRUD
//   server/services/ttsProviders.ts   — the provider adapters themselves (Speechify today)

export type TtsProvider = "speechify";

export interface TtsProviderConfig {
    apiKey?: string;
    // The user's chosen default voice for this provider, used app-wide unless a project
    // (story) sets its own override — see StoryTtsPreference.
    defaultVoiceId?: string;
}

// Stored as JSON in ttsSettings.providers.
export type TtsProviderConfigs = Partial<Record<TtsProvider, TtsProviderConfig>>;

// A single voice, normalized to the same shape regardless of provider — this is what every
// voice-picking UI component (VoiceCombobox, TtsSettingsCard, StoryVoiceCard) renders against.
export interface TtsVoice {
    id: string;
    name: string;
    provider: TtsProvider;
    locale?: string;
    gender?: "male" | "female" | "unspecified";
    previewUrl?: string | null;
}

// Stored as JSON in ttsSettings.availableVoices, keyed by provider (like `providers`), so each
// provider's voice catalog is cached independently.
export type TtsAvailableVoices = Partial<Record<TtsProvider, TtsVoice[]>>;

export interface TtsSettings {
    id: string;
    enabled: boolean;
    activeProvider: TtsProvider;
    providers: TtsProviderConfigs;
    availableVoices: TtsAvailableVoices;
    lastVoicesFetch?: Date;
    createdAt: Date;
}

export interface TtsRefreshVoicesResult {
    success: boolean;
    message?: string;
    settings?: TtsSettings;
}

// A project's (story's) voice override. Absent (null) means "use the global default voice"
// for whichever provider is currently active — see TtsProviderConfig.defaultVoiceId.
export interface StoryTtsPreference {
    id: string;
    storyId: string;
    provider: TtsProvider;
    voiceId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface TtsTestConnectionResult {
    success: boolean;
    message: string;
}

// Request body for POST /api/tts/generate. `provider`/`voiceId` are optional — when omitted
// the server falls back to the active provider's configured default voice.
export interface TtsGenerateSpeechRequest {
    provider?: TtsProvider;
    voiceId?: string;
    text: string;
}

// Metadata that drives the settings UI (provider dropdown, API key field, help text).
export interface TtsProviderMeta {
    id: TtsProvider;
    label: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    helpText: string;
    helpUrl: string;
}

export const TTS_PROVIDERS: TtsProviderMeta[] = [
    {
        id: "speechify",
        label: "Speechify",
        apiKeyLabel: "Speechify API Key",
        apiKeyPlaceholder: "Paste your Speechify API key",
        helpText: "Create an API key from the Speechify developer platform, then paste it here.",
        helpUrl: "https://platform.speechify.ai/api-keys"
    }
];

export const TTS_PROVIDER_MAP: Record<TtsProvider, TtsProviderMeta> = Object.fromEntries(
    TTS_PROVIDERS.map(provider => [provider.id, provider])
) as Record<TtsProvider, TtsProviderMeta>;
