import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { aiService } from "@/services/ai/AIService";
import { agentJobsApi } from "@/services/api/agentJobsClient";
import { adminApi, featureEndpointsApi } from "@/services/api/client";
import type { FeatureEndpoint, FeatureKey } from "@/types/aiSettings";
import type { AIProvider, AISettings, ChatMode } from "@/types/story";

export const aiSettingsKeys = {
    all: ["ai"] as const,
    settings: () => [...aiSettingsKeys.all, "settings"] as const,
    models: () => [...aiSettingsKeys.all, "models"] as const,
    modelsByProvider: (provider: AIProvider) => [...aiSettingsKeys.models(), provider] as const,
    // Shared with useDashboardData.ts's PreferencesSidebar display so saving/clearing an
    // override here also refreshes that read-only summary.
    featureEndpoints: () => [...aiSettingsKeys.all, "featureEndpoints"] as const
};

export const useFeatureEndpointsQuery = () =>
    useQuery({
        queryKey: aiSettingsKeys.featureEndpoints(),
        queryFn: () => featureEndpointsApi.get()
    });

export const useSetFeatureEndpointMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ feature, endpoint }: { feature: FeatureKey; endpoint: FeatureEndpoint }) =>
            featureEndpointsApi.setFeature(feature, endpoint),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.featureEndpoints() });
            toast.success("Feature endpoint saved");
        },
        onError: (error: Error) => {
            toast.error(`Failed to save feature endpoint: ${error.message}`);
        }
    });
};

export const useRemoveFeatureEndpointMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (feature: FeatureKey) => featureEndpointsApi.removeFeature(feature),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.featureEndpoints() });
            toast.success("Reverted to global default");
        },
        onError: (error: Error) => {
            toast.error(`Failed to clear feature endpoint: ${error.message}`);
        }
    });
};

// "Rebuild embedding index (all stories)" — Settings action for after switching the embedding
// feature's provider (e.g. to/from "local-inprocess"). Reuses the existing reconcile_index job
// type with no storyId, which jobRunner.ts now treats as "run across every story" — see
// docs/Local_Embeddings_Design.md. No new job type, no new progress UI: watch it in Settings →
// Logs → Recent Jobs like every other job.
export const useRebuildEmbeddingIndexMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => agentJobsApi.enqueue({ jobType: "reconcile_index" }),
        onSuccess: job => {
            queryClient.invalidateQueries({ queryKey: ["agentJobs"] });
            toast.success(
                job.status === "running" || job.status === "queued"
                    ? "Rebuilding embedding index for every story…"
                    : "A rebuild job already ran"
            );
        },
        onError: (error: Error) => toast.error(error.message || "Failed to queue embedding index rebuild")
    });
};

export const useAISettingsQuery = () =>
    useQuery<AISettings>({
        queryKey: aiSettingsKeys.settings(),
        queryFn: async () => {
            await aiService.initialize();
            const settings = aiService.getSettings();
            if (!settings) throw new Error("Failed to load AI settings");
            return settings;
        },
        staleTime: 5 * 60 * 1000
    });

type UpdateAPIKeyParams = { provider: AIProvider; key: string };

export const useUpdateAPIKeyMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ provider, key }: UpdateAPIKeyParams) => {
            await aiService.updateKey(provider, key);
            return aiService.getAvailableModels(provider, true);
        },
        onSuccess: (models, { provider }) => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.models() });
            queryClient.setQueryData(aiSettingsKeys.modelsByProvider(provider), models);
            toast.success(`${providerName(provider)} models updated`);
        },
        onError: (_, { provider }) => {
            toast.error(`Failed to update ${providerName(provider)} key`);
        }
    });
};

export const useUpdateLocalApiUrlMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (url: string) => {
            await aiService.updateLocalApiUrl(url);
            return aiService.getAvailableModels("local", true);
        },
        onSuccess: models => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.models() });
            queryClient.setQueryData(aiSettingsKeys.modelsByProvider("local"), models);
            toast.success("Local API URL updated");
        },
        onError: () => {
            toast.error("Failed to update local API URL");
        }
    });
};

type UpdateDefaultModelParams = { provider: AIProvider; modelId: string | undefined };

export const useUpdateDefaultModelMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ provider, modelId }: UpdateDefaultModelParams) => {
            await aiService.updateDefaultModel(provider, modelId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            toast.success("Default model updated");
        },
        onError: () => {
            toast.error("Failed to update default model");
        }
    });
};

// Context/Token Meter (T4) — contextWindowOverride/softWarnNearLimit/softWarnThreshold.
export const useUpdateContextMeterSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { contextWindowOverride?: number | null; softWarnNearLimit?: boolean; softWarnThreshold?: number }) =>
            aiService.updateContextMeterSettings(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            toast.success("Context meter settings saved");
        },
        onError: () => toast.error("Failed to save context meter settings")
    });
};

// Local generation output budget override (2026-07-27) — Settings → Local. Separate mutation
// from useUpdateContextMeterSettingsMutation above since this isn't a context/token-meter
// concept — it's the output-side generation cap that was silently causing empty replies on
// reasoning-heavy local models with long system prompts (see AIService.DEFAULT_MAX_TOKENS).
export const useUpdateLocalMaxOutputTokensMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (localMaxOutputTokens: number | null) => aiService.updateLocalMaxOutputTokens(localMaxOutputTokens),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            toast.success("Max output tokens saved");
        },
        onError: () => toast.error("Failed to save max output tokens")
    });
};

// Chat Model Routing (MR0) — Settings → Providers "chat default routing" row.
export const useUpdatePreferredModeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (mode: ChatMode) => aiService.updatePreferredMode(mode),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            toast.success("Preferred chat mode updated");
        },
        onError: () => toast.error("Failed to update preferred chat mode")
    });
};

export const useRefreshModelsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (provider: AIProvider) => {
            const models = await aiService.getAvailableModels(provider, true);
            return { provider, models };
        },
        onSuccess: ({ provider, models }) => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            queryClient.setQueryData(aiSettingsKeys.modelsByProvider(provider), models);
            toast.success(`${providerName(provider)} models refreshed`);
        },
        onError: (_, provider) => {
            toast.error(`Failed to refresh ${providerName(provider)} models`);
        }
    });
};

export const useDisconnectGrokOAuthMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => aiService.disconnectGrokOAuth(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: aiSettingsKeys.settings() });
            toast.success("Disconnected from xAI");
        },
        onError: () => {
            toast.error("Failed to disconnect from xAI");
        }
    });
};

export const useDeleteDemoDataMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => adminApi.deleteDemoData(),
        onSuccess: ({ deleted }) => {
            queryClient.invalidateQueries();
            toast.success(
                `Demo data deleted: ${deleted.stories} ${deleted.stories === 1 ? "story" : "stories"}, ${deleted.lorebookEntries} lorebook ${deleted.lorebookEntries === 1 ? "entry" : "entries"}`
            );
        },
        onError: () => {
            toast.error("Failed to delete demo data");
        }
    });
};

const providerName = (provider: AIProvider): string => {
    const names: Record<AIProvider, string> = {
        openai: "OpenAI",
        openrouter: "OpenRouter",
        local: "Local",
        gemini: "Gemini",
        grok: "Grok (xAI)",
        "grok-session": "SuperGrok (Session)",
        "grok-oauth": "Grok (xAI OAuth)"
    };
    return names[provider];
};
