import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ttsApi } from "@/services/api/client";
import type { TtsProvider, TtsSettings } from "@/types/ttsSettings";

export const ttsSettingsKeys = {
    all: ["tts"] as const,
    settings: () => [...ttsSettingsKeys.all, "settings"] as const
};

export const useTtsSettingsQuery = () =>
    useQuery({
        queryKey: ttsSettingsKeys.settings(),
        queryFn: ttsApi.getSettings,
        staleTime: 5 * 60 * 1000
    });

export const useUpdateTtsSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TtsSettings> }) => ttsApi.updateSettings(id, data),
        onSuccess: updated => {
            queryClient.setQueryData(ttsSettingsKeys.settings(), updated);
        },
        onError: () => {
            toast.error("Failed to update TTS settings");
        }
    });
};

export const useTestTtsConnectionMutation = () =>
    useMutation({
        mutationFn: ({ provider, apiKey }: { provider: TtsProvider; apiKey: string }) =>
            ttsApi.testConnection(provider, apiKey),
        onSuccess: result => {
            if (result.success) toast.success(result.message);
            else toast.error(result.message);
        },
        onError: () => {
            toast.error("Test connection failed");
        }
    });

export const useRefreshTtsVoicesMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (provider: TtsProvider) => ttsApi.refreshVoices(provider),
        onSuccess: result => {
            if (!result.success || !result.settings) {
                toast.error(result.message ?? "Failed to load voices");
                return;
            }
            queryClient.setQueryData(ttsSettingsKeys.settings(), result.settings);
            toast.success(`Loaded ${result.settings.availableVoices[result.settings.activeProvider]?.length ?? 0} voices`);
        },
        onError: () => {
            toast.error("Failed to load voices");
        }
    });
};
