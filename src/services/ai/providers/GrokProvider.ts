import { attemptPromise } from "@jfdi/attempt";
import OpenAI from "openai";
import { API_URLS } from "@/constants/urls";
import type { AIModel, AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import { wrapOpenAIStream } from "../streamUtils";
import type { IAIProvider } from "./IAIProvider";

export class GrokProvider implements IAIProvider {
    private client: OpenAI | null = null;

    initialize(apiKey?: string): void {
        if (!apiKey) return;

        this.client = new OpenAI({
            baseURL: API_URLS.XAI_BASE,
            apiKey,
            dangerouslyAllowBrowser: true
        });
    }

    async fetchModels(): Promise<AIModel[]> {
        if (!this.client) {
            logger.warn("[GrokProvider] Client not initialized");
            return [];
        }

        logger.info("[GrokProvider] Fetching models");

        const client = this.client;
        const [error, response] = await attemptPromise(() => client.models.list());

        if (error) {
            logger.error("[GrokProvider] Error fetching models:", error);
            return [];
        }

        const grokModels = response.data.filter(m => m.id.startsWith("grok"));

        const models: AIModel[] = grokModels.map(model => ({
            id: model.id,
            name: model.id,
            provider: "grok" as AIProvider,
            contextLength: this.getContextLength(model.id),
            enabled: true
        }));

        logger.info(`[GrokProvider] Fetched ${models.length} models`);
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
            throw new Error("Grok client not initialized");


        const stream = await this.client.chat.completions.create(
            {
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature,
                max_tokens: maxTokens,
                stream: true,
                // Context/Token Meter (T4, M3) — xAI's API is OpenAI-compatible and honors this the
                // same way LocalAIProvider.ts's local servers do: one final SSE chunk with `usage`
                // populated and an empty `choices` array.
                stream_options: { include_usage: true }
            },
            { signal }
        );

        return wrapOpenAIStream(stream);
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    private getContextLength(modelId: string): number {
        if (modelId.includes("grok-4")) return 256000;
        if (modelId.includes("grok-3")) return 131072;
        return 131072;
    }
}
