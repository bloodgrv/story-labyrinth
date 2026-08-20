import { attemptPromise } from "@jfdi/attempt";
import OpenAI from "openai";
import { API_URLS } from "@/constants/urls";
import type { AIModel, AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import { wrapOpenAIStream } from "../streamUtils";
import type { IAIProvider } from "./IAIProvider";

// DeepSeek's own API is OpenAI-compatible (https://api-docs.deepseek.com), so this is a plain
// `new OpenAI({baseURL, apiKey})` client — same shape as OpenRouterProvider/GrokProvider, not
// GeminiProvider's bespoke SDK. models.list() returns a plain id/object pair with no context-
// length metadata, same gap OpenAIProvider/GrokProvider already work around with a static map.
export class DeepSeekProvider implements IAIProvider {
    private client: OpenAI | null = null;

    initialize(apiKey?: string): void {
        if (!apiKey) return;

        this.client = new OpenAI({
            baseURL: API_URLS.DEEPSEEK_BASE,
            apiKey,
            dangerouslyAllowBrowser: true
        });
    }

    async fetchModels(): Promise<AIModel[]> {
        if (!this.client) {
            logger.warn("[DeepSeekProvider] Client not initialized");
            return [];
        }

        logger.info("[DeepSeekProvider] Fetching models");

        const client = this.client;
        const [error, response] = await attemptPromise(() => client.models.list());

        if (error) {
            logger.error("[DeepSeekProvider] Error fetching models:", error);
            return [];
        }

        const deepseekModels = response.data.filter(m => m.id.startsWith("deepseek"));

        const models: AIModel[] = deepseekModels.map(model => ({
            id: model.id,
            name: model.id,
            provider: "deepseek" as AIProvider,
            contextLength: this.getContextLength(model.id),
            enabled: true
        }));

        logger.info(`[DeepSeekProvider] Fetched ${models.length} models`);
        return models;
    }

    async generate(
        messages: PromptMessage[],
        model: string,
        temperature: number,
        maxTokens: number,
        signal?: AbortSignal
    ): Promise<Response> {
        if (!this.client)
            throw new Error("DeepSeek client not initialized");

        const stream = await this.client.chat.completions.create(
            {
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature,
                max_tokens: maxTokens,
                stream: true,
                // Context/Token Meter (T4, M3) — DeepSeek's API is OpenAI-compatible and honors
                // this the same way GrokProvider.ts's identical comment describes.
                stream_options: { include_usage: true }
            },
            { signal }
        );

        return wrapOpenAIStream(stream);
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    private getContextLength(_modelId: string): number {
        // Both deepseek-chat (V3.1) and deepseek-reasoner (R1) currently document a 128K context
        // window — a single constant is fine here, same "approximate, not authoritative" posture
        // GrokProvider.ts's own getContextLength takes.
        return 131072;
    }
}
