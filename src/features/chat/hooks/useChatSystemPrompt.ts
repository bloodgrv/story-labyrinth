import { useMemo, useState } from "react";
import { useAvailableModels } from "@/features/ai/hooks/useAvailableModels";
import { usePromptsQuery } from "@/features/prompts/hooks/usePromptsQuery";
import type { AIModel, AllowedModel, Prompt } from "@/types/story";

interface UseChatSystemPromptReturn {
    prompt: Prompt | null;
    isLoading: boolean;
    availableModels: AIModel[];
    selectedModel: AllowedModel | null;
    selectModel: (model: AIModel) => void;
}

// Resolves the single fixed system prompt for a chat type (brainstorm/worldbuilding/research/editor —
// exactly one per type, no picker) and manages which AI model this chat currently generates with.
// Model choice is a real per-generation decision (unlike the prompt, which is fixed); it's sourced
// from the full available-models catalogue, not a per-prompt allowedModels whitelist, since chat-type
// system prompts don't curate a model list the way the old Prompts library did.
export const useChatSystemPrompt = (
    promptType: Prompt["promptType"],
    lastUsedModelId: string | undefined,
    persistModelId: (modelId: string) => void
): UseChatSystemPromptReturn => {
    const { data: prompts = [], isLoading } = usePromptsQuery({ promptType, includeSystem: true });
    const { data: availableModels = [] } = useAvailableModels();

    const prompt = prompts[0] ?? null;

    const [selectedModelId, setSelectedModelId] = useState<string | undefined>(lastUsedModelId);

    const selectedModel = useMemo<AllowedModel | null>(() => {
        const model = availableModels.find(m => m.id === selectedModelId);
        return model ? { id: model.id, provider: model.provider, name: model.name } : null;
    }, [availableModels, selectedModelId]);

    const selectModel = (model: AIModel) => {
        setSelectedModelId(model.id);
        persistModelId(model.id);
    };

    return { prompt, isLoading, availableModels, selectedModel, selectModel };
};
