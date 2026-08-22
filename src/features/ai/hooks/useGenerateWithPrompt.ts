import { useCallback } from "react";
import { usePromptParser } from "@/features/prompts/hooks/usePromptParser";
import { aiService } from "@/services/ai/AIService";
import type { AllowedModel, PromptMessage, PromptParserConfig } from "@/types/story";
import { generateWithProvider } from "../services/aiGenerationHelper";

// Local System Inject (T12, docs/Local_System_Inject_Design.md §5) — the one shared choke point
// every desk chat's generation already routes through (useChatMessageGeneration.ts →
// generateWithPrompt), so this is where "Best" coverage (all six desk chats, LI2's locked
// minimum) lands without duplicating the prepend in LocalAIProvider or per-host code. Idempotent
// per call — this function only ever runs once per generateWithPrompt invocation, never chained.
function applyLocalInject(messages: PromptMessage[], provider: AllowedModel["provider"]): PromptMessage[] {
    if (provider !== "local") return messages;
    const settings = aiService.getSettings();
    if (!settings?.localInjectEnabled) return messages;
    const body = settings.localInjectBody.trim();
    if (!body) return messages;

    const [first, ...rest] = messages;
    if (first?.role === "system")
        return [{ role: "system", content: `${body}\n\n---\n\n${first.content}` }, ...rest];

    return [{ role: "system", content: body }, ...messages];
}

export function useGenerateWithPrompt() {
    const { parsePrompt } = usePromptParser();

    const generateWithPrompt = useCallback(
        async (config: PromptParserConfig, selectedModel: AllowedModel): Promise<Response> => {
            await aiService.initialize();

            const { messages, error } = await parsePrompt(config);

            if (error || !messages.length) throw new Error(error || "Failed to parse prompt");

            const finalMessages = applyLocalInject(messages, selectedModel.provider);

            return generateWithProvider(selectedModel.provider, finalMessages, selectedModel.id);
        },
        [parsePrompt]
    );

    return { generateWithPrompt };
}
