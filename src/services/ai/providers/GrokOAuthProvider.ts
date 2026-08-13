import { attemptPromise } from "@jfdi/attempt";
import OpenAI from "openai";
import { API_URLS } from "@/constants/urls";
import type { AIModel, AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import { wrapOpenAIStream } from "../streamUtils";
import type { IAIProvider } from "./IAIProvider";

// Talks to the same official api.x.ai endpoint as GrokProvider, just authenticated with an xAI
// OAuth access token (obtained via the device flow — see server/services/grokOAuthClient.ts)
// instead of a console.x.ai API key. The server keeps this token fresh on every settings fetch,
// so from here it's used exactly like any other bearer token.
export class GrokOAuthProvider implements IAIProvider {
    private client: OpenAI | null = null;

    initialize(accessToken?: string): void {
        if (!accessToken) return;

        this.client = new OpenAI({
            baseURL: API_URLS.XAI_BASE,
            apiKey: accessToken,
            dangerouslyAllowBrowser: true
        });
    }

    async fetchModels(): Promise<AIModel[]> {
        if (!this.client) {
            logger.warn("[GrokOAuthProvider] Client not initialized");
            return [];
        }

        logger.info("[GrokOAuthProvider] Fetching models");

        const client = this.client;
        const [error, response] = await attemptPromise(() => client.models.list());

        if (error) {
            logger.error("[GrokOAuthProvider] Error fetching models:", error);
            return [];
        }

        const grokModels = response.data.filter(m => m.id.startsWith("grok"));

        const models: AIModel[] = grokModels.map(model => ({
            id: model.id,
            name: model.id,
            provider: "grok-oauth" as AIProvider,
            contextLength: this.getContextLength(model.id),
            enabled: true
        }));

        logger.info(`[GrokOAuthProvider] Fetched ${models.length} models`);
        return models;
    }

    async generate(
        messages: PromptMessage[],
        model: string,
        temperature: number,
        maxTokens: number,
        signal?: AbortSignal
    ): Promise<Response> {
        if (!this.client) throw new Error("Grok OAuth client not initialized");

        const stream = await this.client.chat.completions.create(
            {
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature,
                max_tokens: maxTokens,
                stream: true,
                // Context/Token Meter (T4, M3) — see GrokProvider.ts's identical comment.
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
