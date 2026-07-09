import { useCallback } from "react";
import { usePromptParser } from "@/features/prompts/hooks/usePromptParser";
import { aiService } from "@/services/ai/AIService";
import type { AllowedModel, PromptParserConfig } from "@/types/story";
import { generateWithProvider } from "../services/aiGenerationHelper";

export function useGenerateWithPrompt() {
    const { parsePrompt } = usePromptParser();

    const generateWithPrompt = useCallback(
        async (config: PromptParserConfig, selectedModel: AllowedModel): Promise<Response> => {
            await aiService.initialize();

            const { messages, error } = await parsePrompt(config);

            if (error || !messages.length) throw new Error(error || "Failed to parse prompt");

            return generateWithProvider(selectedModel.provider, messages, selectedModel.id);
        },
        [parsePrompt]
    );

    return { generateWithPrompt };
}
