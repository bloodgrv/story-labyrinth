import type {
    StoryTtsPreference,
    TtsGenerateSpeechRequest,
    TtsProvider,
    TtsRefreshVoicesResult,
    TtsSettings,
    TtsTestConnectionResult
} from "@/types/ttsSettings";
import { fetchBlob, fetchJSON } from "./apiFactory";

// TTS (Text-to-Speech) settings API
export const ttsApi = {
    getSettings: () => fetchJSON<TtsSettings>("/tts/settings"),
    updateSettings: (id: string, data: Partial<TtsSettings>) =>
        fetchJSON<TtsSettings>(`/tts/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    testConnection: (provider: TtsProvider, apiKey: string) =>
        fetchJSON<TtsTestConnectionResult>("/tts/test-connection", {
            method: "POST",
            body: JSON.stringify({ provider, apiKey })
        }),
    refreshVoices: (provider: TtsProvider) =>
        fetchJSON<TtsRefreshVoicesResult>("/tts/voices/refresh", {
            method: "POST",
            body: JSON.stringify({ provider })
        }),
    getStoryVoice: (storyId: string) => fetchJSON<StoryTtsPreference | null>(`/tts/story/${storyId}/voice`),
    setStoryVoice: (storyId: string, data: { provider: TtsProvider; voiceId: string }) =>
        fetchJSON<StoryTtsPreference>(`/tts/story/${storyId}/voice`, { method: "PUT", body: JSON.stringify(data) }),
    clearStoryVoice: (storyId: string) =>
        fetchJSON<{ success: boolean }>(`/tts/story/${storyId}/voice`, { method: "DELETE" }),
    generateSpeech: (data: TtsGenerateSpeechRequest) =>
        fetchBlob("/tts/generate", { method: "POST", body: JSON.stringify(data) })
};
