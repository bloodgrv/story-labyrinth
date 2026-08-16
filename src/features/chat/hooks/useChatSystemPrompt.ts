import { useEffect, useMemo, useState } from "react";
import { useAISettingsQuery, useFeatureEndpointsQuery } from "@/features/ai/hooks/useAISettingsQuery";
import { useAvailableModels } from "@/features/ai/hooks/useAvailableModels";
import {
    getModeForProvider,
    resolveChatDefaultModel,
    resolveModelForModeSwitch
} from "@/features/ai/utils/resolveChatDefaultModel";
import { usePromptsQuery } from "@/features/prompts/hooks/usePromptsQuery";
import type { FeatureKey } from "@/types/aiSettings";
import type { AIModel, AllowedModel, ChatMode, Prompt } from "@/types/story";

// The only two chatTypes with their own Feature Routing row (see src/types/aiSettings.ts's
// FEATURE_KEYS) — Brainstorm/Outline/Notes/Research have none, so they always fall through to
// the mode-based default below, unchanged.
const CHAT_FEATURE_KEYS: Partial<Record<Prompt["promptType"], FeatureKey>> = {
    worldbuilding: "worldbuilding_chat",
    editor: "editor_chat"
};

interface UseChatSystemPromptReturn {
    prompt: Prompt | null;
    isLoading: boolean;
    availableModels: AIModel[];
    selectedModel: AllowedModel | null;
    selectModel: (model: AIModel) => void;
    // Chat Model Routing (MR2) — current effective Cloud|Local mode (derived from the selected
    // model's own provider, falling back to the global preferred mode while nothing is selected
    // yet) and the segmented-control handler that jumps to the other mode's default model.
    mode: ChatMode;
    switchMode: (mode: ChatMode) => void;
}

// Resolves the single fixed system prompt for a chat type (brainstorm/worldbuilding/research/editor —
// exactly one per type, no picker) and manages which AI model this chat currently generates with.
// Model choice is a real per-generation decision (unlike the prompt, which is fixed); it's sourced
// from the full available-models catalogue, not a per-prompt allowedModels whitelist, since chat-type
// system prompts don't curate a model list the way the old Prompts library did.
export const useChatSystemPrompt = (
    promptType: Prompt["promptType"],
    chatId: string,
    lastUsedModelId: string | undefined,
    persistModelId: (modelId: string) => void
): UseChatSystemPromptReturn => {
    const { data: prompts = [], isLoading } = usePromptsQuery({ promptType, includeSystem: true });
    const { data: availableModels = [] } = useAvailableModels();
    const { data: aiSettings } = useAISettingsQuery();
    const { data: featureEndpoints } = useFeatureEndpointsQuery();

    const prompt = prompts[0] ?? null;
    const featureKey = CHAT_FEATURE_KEYS[promptType];
    const featureOverrideModelId = featureKey ? featureEndpoints?.[featureKey]?.model : undefined;

    const [selectedModelId, setSelectedModelId] = useState<string | undefined>(lastUsedModelId);

    // ChatInterface isn't remounted when the user switches between chats in the same rail (see
    // its own per-chat-id effects for the same reason) — this hook's local state needs its own
    // reset keyed on chat identity, or a previous chat's in-memory selection would leak into the
    // next one before persistModelId ever fires for it.
    useEffect(() => {
        setSelectedModelId(lastUsedModelId);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on chat identity change only; lastUsedModelId read at effect-run time is intentional
    }, [chatId]);

    // M5/M6 — the moment we know the real model catalogue + settings, auto-resolve+persist a
    // default if there's nothing valid selected (new chat, or a stale lastUsedModelId whose model
    // no longer exists). Never leaves a chat modelless when any default is resolvable.
    useEffect(() => {
        if (!aiSettings || availableModels.length === 0) return;
        if (selectedModelId && availableModels.some(m => m.id === selectedModelId)) return;

        const resolved = resolveChatDefaultModel({
            mode: aiSettings.preferredMode,
            settings: aiSettings,
            lastUsedModelId: selectedModelId,
            availableModels,
            featureOverrideModelId
        });
        if (resolved) {
            setSelectedModelId(resolved);
            persistModelId(resolved);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- persistModelId is a fresh closure per render, intentionally not a dep
    }, [chatId, aiSettings, availableModels, selectedModelId, featureOverrideModelId]);

    const selectedModel = useMemo<AllowedModel | null>(() => {
        const model = availableModels.find(m => m.id === selectedModelId);
        return model ? { id: model.id, provider: model.provider, name: model.name } : null;
    }, [availableModels, selectedModelId]);

    const selectModel = (model: AIModel) => {
        setSelectedModelId(model.id);
        persistModelId(model.id);
    };

    const mode: ChatMode = selectedModel ? getModeForProvider(selectedModel.provider) : (aiSettings?.preferredMode ?? "cloud");

    const switchMode = (newMode: ChatMode) => {
        if (!aiSettings || newMode === mode) return;
        const resolved = resolveModelForModeSwitch({
            newMode,
            settings: aiSettings,
            currentModelId: selectedModelId,
            availableModels
        });
        if (!resolved) return;
        const model = availableModels.find(m => m.id === resolved);
        if (model) selectModel(model);
    };

    return { prompt, isLoading, availableModels, selectedModel, selectModel, mode, switchMode };
};
