import { estimateTokens, formatTokenCount } from "@/features/context-meter/lib/estimateTokens";
import { aiService } from "@/services/ai/AIService";
import type { AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";

// Same chars/4 heuristic the Context/Token Meter chip already surfaces in the composer (see
// estimateTokens.ts's own header comment for why it's a heuristic, not a real tokenizer) — logged
// here per-message and as a total right before every generation call, so "why is this turn slow"
// can be checked against actual outbound size instead of guessing. Browser console only (logger
// writes there client-side); look for "AI Generation Request" in DevTools after sending a message.
export const generateWithProvider = (provider: AIProvider, messages: PromptMessage[], modelId: string): Promise<Response> => {
    const perMessageTokens = messages.map(m => ({ role: m.role, estimatedTokens: estimateTokens(m.content) }));
    const totalEstimatedTokens = perMessageTokens.reduce((sum, m) => sum + m.estimatedTokens, 0);

    logger.info("AI Generation Request", {
        provider,
        model: modelId,
        messageCount: messages.length,
        totalEstimatedTokens,
        totalEstimatedTokensFormatted: formatTokenCount(totalEstimatedTokens),
        perMessageTokens,
        promptPreview: messages[0]?.content?.substring(0, 200)
    });

    return aiService.generate(provider, messages, modelId);
};
