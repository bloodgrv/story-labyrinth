import { attemptPromise } from "@jfdi/attempt";
import type { TtsVoice } from "../../src/types/ttsSettings.js";

// ── TTS architecture, in one place ──────────────────────────────────────────────
//
// Every TTS provider (Speechify today; ElevenLabs/OpenAI TTS/Web Speech API later) is a
// `TtsProviderAdapter` — three functions (test a key, list voices, synthesize speech) with no
// shared base class or inheritance. Nothing outside this file knows Speechify exists:
// `server/routes/tts.ts` only ever calls `getTtsProviderAdapter(provider)` and invokes whichever
// method it needs, keyed by the `provider` string stored in the request/settings row.
//
// To add a new provider:
//   1. Write its adapter functions below (or in a new file, then import them here) —
//      `testConnection`, `fetchVoices`, `generateSpeech`, matching the shapes below.
//   2. Add one entry to the `adapters` map at the bottom of this file.
//   3. Add the provider id to `TtsProvider` and an entry to `TTS_PROVIDERS` in
//      `src/types/ttsSettings.ts` (drives the settings UI: dropdown, API key label, help text).
//   4. That's it. No schema migration, no route changes, no changes to VoiceCombobox,
//      TtsSettingsCard, StoryVoiceCard, TtsPlayButton, or useTtsPlayback — all of those are
//      already provider-agnostic (see per-provider config storage note below).
//
// Per-provider config (API key, chosen default voice) lives in `ttsSettings.providers`, a JSON
// blob keyed by provider id (`TtsProviderConfigs`), and the cached voice catalog lives in
// `ttsSettings.availableVoices`, keyed the same way (`TtsAvailableVoices`). Both are plain
// object properties, not database columns — a new provider is a new key in those objects, not
// a schema change. This mirrors `aiSettings.featureEndpoints`' JSON-blob-for-extensibility
// pattern elsewhere in this codebase, but goes one step further: aiSettings still has one
// dedicated column per provider (`openaiKey`, `openrouterKey`, ...), which is fine for a fixed
// set of three providers but would mean a migration per new TTS provider. The blob keeps TTS
// additions to pure code changes.

export interface TtsTestResult {
    success: boolean;
    message: string;
}

export interface TtsGenerateParams {
    text: string;
    voiceId: string;
}

export type TtsGenerateResult =
    | { success: true; audio: Buffer; mimeType: string }
    | { success: false; message: string };

// Everything a TTS provider needs to plug into the settings UI, voice management, and speech
// generation. Extensibility point: implement one of these per new provider and register it in
// `adapters` below — no other TTS code (routes, settings UI, playback hook) needs to change.
export interface TtsProviderAdapter {
    testConnection: (apiKey: string) => Promise<TtsTestResult>;
    // Throws on failure — callers wrap with attemptPromise so the route can turn it into
    // a { success: false, message } response instead of a 500.
    fetchVoices: (apiKey: string) => Promise<TtsVoice[]>;
    generateSpeech: (apiKey: string, params: TtsGenerateParams) => Promise<TtsGenerateResult>;
}

// ── Speechify ────────────────────────────────────────────────────────────────────
// Every endpoint takes `Authorization: Bearer <key>` (api.speechify.ai).

interface SpeechifyVoice {
    id: string;
    display_name: string;
    gender: "male" | "female" | "notSpecified";
    locale: string;
    preview_audio?: string | null;
}

// GET /v1/voices returns a paginated envelope, not a bare array (the official SDK's return
// type hides this — it unwraps `.voices` internally). In practice a single page already
// returns the whole catalog (has_more: false for 949 voices at time of writing), so pagination
// isn't handled here — revisit if `has_more` is ever seen true for a real account.
interface SpeechifyVoicesResponse {
    voices: SpeechifyVoice[];
    next_cursor?: string | null;
    has_more?: boolean;
}

interface SpeechifySpeechResponse {
    audio_data: string; // base64
    audio_format: "wav" | "mp3" | "ogg" | "aac" | "pcm";
}

const SPEECHIFY_AUDIO_MIME_TYPES: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    pcm: "audio/pcm"
};

const speechifyErrorMessage = (status: number): string => {
    switch (status) {
        case 401:
        case 403:
            return "Speechify rejected this API key";
        case 402:
            return "Speechify account has insufficient credits";
        case 404:
            return "Voice not found";
        case 429:
            return "Speechify rate limit exceeded — try again shortly";
        default:
            return `Speechify returned status ${status}`;
    }
};

const speechifyTestConnection = async (apiKey: string): Promise<TtsTestResult> => {
    const [error, response] = await attemptPromise(() =>
        fetch("https://api.speechify.ai/v1/voices", {
            headers: { Authorization: `Bearer ${apiKey}` }
        })
    );

    if (error) return { success: false, message: `Could not reach Speechify: ${error.message}` };
    if (!response.ok) return { success: false, message: speechifyErrorMessage(response.status) };

    return { success: true, message: "Connected to Speechify successfully" };
};

const speechifyFetchVoices = async (apiKey: string): Promise<TtsVoice[]> => {
    const response = await fetch("https://api.speechify.ai/v1/voices", {
        headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error(speechifyErrorMessage(response.status));

    const body = (await response.json()) as SpeechifyVoicesResponse;
    return body.voices.map(voice => ({
        id: voice.id,
        name: voice.display_name,
        provider: "speechify" as const,
        locale: voice.locale,
        gender: voice.gender === "notSpecified" ? "unspecified" : voice.gender,
        previewUrl: voice.preview_audio ?? null
    }));
};

const speechifyGenerateSpeech = async (apiKey: string, params: TtsGenerateParams): Promise<TtsGenerateResult> => {
    const [error, response] = await attemptPromise(() =>
        fetch("https://api.speechify.ai/v1/audio/speech", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                input: params.text,
                voice_id: params.voiceId,
                audio_format: "mp3"
            })
        })
    );

    if (error) return { success: false, message: `Could not reach Speechify: ${error.message}` };
    if (!response.ok) return { success: false, message: speechifyErrorMessage(response.status) };

    const [parseError, body] = await attemptPromise(() => response.json() as Promise<SpeechifySpeechResponse>);
    if (parseError) return { success: false, message: `Unexpected response from Speechify: ${parseError.message}` };

    return {
        success: true,
        audio: Buffer.from(body.audio_data, "base64"),
        mimeType: SPEECHIFY_AUDIO_MIME_TYPES[body.audio_format] ?? "audio/mpeg"
    };
};

const adapters: Record<string, TtsProviderAdapter> = {
    speechify: {
        testConnection: speechifyTestConnection,
        fetchVoices: speechifyFetchVoices,
        generateSpeech: speechifyGenerateSpeech
    }
};

export const getTtsProviderAdapter = (provider: string): TtsProviderAdapter | undefined => adapters[provider];
