import { attemptPromise } from "@jfdi/attempt";
import { API_URLS } from "@/constants/urls";
import type { AIModel, AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import type { IAIProvider } from "./IAIProvider";

const CONTEXT_LENGTH_FIELDS = ["loaded_context_length", "max_context_length", "context_length", "n_ctx"] as const;

const readContextLength = (model: Record<string, unknown>): number | null => {
    for (const field of CONTEXT_LENGTH_FIELDS) {
        const value = model[field];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    }
    return null;
};

export class LocalAIProvider implements IAIProvider {
    private apiUrl: string;

    constructor(apiUrl: string = API_URLS.LOCAL_AI_DEFAULT) {
        this.apiUrl = apiUrl;
    }

    initialize(apiUrl?: string): void {
        if (apiUrl) 
            this.apiUrl = apiUrl;
        
    }

    async fetchModels(): Promise<AIModel[]> {
        logger.info(`[LocalAIProvider] Fetching models from: ${this.apiUrl}`);

        const [fetchError, response] = await attemptPromise(() => fetch(`${this.apiUrl}/models`));

        if (fetchError || !response) {
            logger.warn("[LocalAIProvider] Failed to fetch models:", fetchError);
            return [
                {
                    id: "local",
                    name: "Local Model",
                    provider: "local",
                    contextLength: 16384,
                    enabled: true
                }
            ];
        }

        if (!response.ok) {
            logger.error(`[LocalAIProvider] Failed to fetch models: ${response.status}`);
            return [
                {
                    id: "local",
                    name: "Local Model",
                    provider: "local",
                    contextLength: 16384,
                    enabled: true
                }
            ];
        }

        const [jsonError, result] = await attemptPromise(() => response.json());

        if (jsonError || !result) {
            logger.warn("[LocalAIProvider] Failed to parse models:", jsonError);
            return [
                {
                    id: "local",
                    name: "Local Model",
                    provider: "local",
                    contextLength: 16384,
                    enabled: true
                }
            ];
        }

        logger.info(`[LocalAIProvider] Received ${result.data.length} models`);

        // Context/Token Meter (T4, design decision #5) — "fetch from local server metadata when
        // possible." Generic OpenAI-compatible /v1/models never carries context length, but
        // LM Studio's server (and some other local runners) add extra fields onto each model
        // object beyond the OpenAI spec. Best-effort: check a few plausible field names, fall
        // back to the previous hardcoded guess if none are present — this is exactly the
        // "fetch ... when possible" the design doc anticipates, not a guaranteed value.
        const models = result.data.map((model: { id: string } & Record<string, unknown>) => ({
            id: `local/${model.id}`,
            name: model.id,
            provider: "local" as AIProvider,
            contextLength: readContextLength(model) ?? 16384,
            enabled: true
        }));

        return models;
    }

    async generate(
        messages: PromptMessage[],
        model: string,
        temperature: number,
        maxTokens: number,
        signal?: AbortSignal
    ): Promise<Response> {
        const modelId = model.replace("local/", "");

        return await fetch(`${this.apiUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelId,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: true,
                // Context/Token Meter (T4, M3) — most OpenAI-compatible local servers (LM Studio,
                // llama.cpp server, vLLM) honor this and emit one final SSE chunk with `usage`
                // populated and an empty `choices` array. Harmless no-op if the server ignores it.
                stream_options: { include_usage: true }
            }),
            signal
        });
    }

    isInitialized(): boolean {
        return !!this.apiUrl;
    }
}
