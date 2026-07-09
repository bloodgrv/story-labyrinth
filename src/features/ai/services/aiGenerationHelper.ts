import { aiService } from "@/services/ai/AIService";
import type { AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";

export const generateWithProvider = (provider: AIProvider, messages: PromptMessage[], modelId: string): Promise<Response> => {
    logger.info("AI Generation Request", {
        provider,
        model: modelId,
        messageCount: messages.length,
        promptPreview: messages[0]?.content?.substring(0, 200)
    });

    return aiService.generate(provider, messages, modelId);
};
