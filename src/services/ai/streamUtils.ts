import { attemptPromise } from "@jfdi/attempt";
import type { GenerateContentResponse } from "@google/genai";
import { formatSSEChunk, formatSSEDone } from "@/constants/aiConstants";
import { logger } from "@/utils/logger";

interface ChatCompletionChunk {
    choices: Array<{
        delta?: {
            content?: string | null;
        };
    }>;
    // OpenAI-compatible SDKs (openai/xAI/OpenRouter) emit one final chunk with an empty `choices`
    // array and this populated, but only when the request includes `stream_options:
    // {include_usage: true}` (see each provider's own generate()) — same mechanism
    // LocalAIProvider.ts already relies on for the Context/Token Meter's post-turn usage badge.
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/**
 * Wraps an OpenAI-compatible async streaming response into a genuine SSE Web API Response —
 * `data: {...}\n\n` lines plus a trailing `data: [DONE]`, the same wire format a raw HTTP-based
 * provider (Local, grok-session) already sends and processStreamedResponse already expects. This
 * used to emit bare decoded text instead, relying on a later formatStreamAsSSE() re-wrap — which
 * only round-tripped `.content` and silently dropped the final chunk's `.usage`, since that chunk
 * has empty `choices` and formatStreamAsSSE only ever sees plain strings by that point. Producing
 * real SSE directly here, with `.usage` forwarded on whichever chunk carries it, is what makes the
 * Context/Token Meter's per-turn usage badge (and the "Say ok" idle-check upstream) actually
 * appear for openai/openrouter/grok/grok-oauth — it previously only ever showed for Local.
 */
export const wrapOpenAIStream = async (stream: AsyncIterable<ChatCompletionChunk>): Promise<Response> =>
    new Response(
        new ReadableStream({
            async start(controller) {
                const [error] = await attemptPromise(async () => {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content ?? "";
                        const usage = chunk.usage ?? undefined;
                        if (content || usage)
                            controller.enqueue(
                                new TextEncoder().encode(
                                    formatSSEChunk(
                                        content,
                                        usage && typeof usage.total_tokens === "number"
                                            ? {
                                                  prompt_tokens: usage.prompt_tokens ?? 0,
                                                  completion_tokens: usage.completion_tokens ?? 0,
                                                  total_tokens: usage.total_tokens
                                              }
                                            : undefined
                                    )
                                )
                            );
                    }
                    controller.enqueue(new TextEncoder().encode(formatSSEDone()));
                });

                if (error)
                    controller.error(error);
                 else
                    controller.close();

            }
        }),
        { headers: { "Content-Type": "text/event-stream" } }
    );

/**
 * Wraps a Gemini streaming response into a Web API Response with ReadableStream.
 */
export const wrapGeminiStream = async (
    stream: AsyncGenerator<GenerateContentResponse>
): Promise<Response> =>
    new Response(
        new ReadableStream({
            async start(controller) {
                const [error] = await attemptPromise(async () => {
                    for await (const chunk of stream) {
                        const content = chunk.text;
                        if (content)
                            controller.enqueue(new TextEncoder().encode(content));

                    }
                });

                if (error)
                    controller.error(error);
                 else
                    controller.close();

            }
        })
    );

/**
 * Formats a raw streaming response into SSE format.
 */
export const formatStreamAsSSE = (response: Response): Response => {
    const responseStream = new ReadableStream({
        async start(controller) {
            if (!response.body) {
                controller.close();
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            const [error] = await attemptPromise(async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const content = decoder.decode(value, { stream: true });
                    const formattedChunk = formatSSEChunk(content);

                    controller.enqueue(new TextEncoder().encode(formattedChunk));
                }
                controller.enqueue(new TextEncoder().encode(formatSSEDone()));
            });

            if (error)
                if ((error as Error).name === "AbortError") controller.close();
                else controller.error(error);
            else controller.close();
        }
    });

    return new Response(responseStream, {
        headers: { "Content-Type": "text/event-stream" }
    });
};

// Context/Token Meter (T4, M3) — camelCase mirror of the OpenAI-compatible
// `usage: {prompt_tokens, completion_tokens, total_tokens}` shape.
export interface StreamUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

const readUsage = (json: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }): StreamUsage | null => {
    const usage = json.usage;
    if (!usage || typeof usage.total_tokens !== "number") return null;
    return {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens
    };
};

/**
 * Processes an SSE stream, invoking callbacks for tokens, completion, and errors.
 */
export const processStreamedResponse = async (
    response: Response,
    onToken: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    // Context/Token Meter (T4, M3) — fires at most once, if the final chunk carries a `usage`
    // field (requires `stream_options: {include_usage: true}` on the request — see
    // LocalAIProvider.generate()). Optional since most callers/providers don't request it.
    onUsage?: (usage: StreamUsage) => void
): Promise<void> => {
    if (!response.body) return onError(new Error("Response body is null"));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const [error] = await attemptPromise(async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                onComplete();
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(line => line.trim() !== "");

            for (const line of lines)
                if (line.startsWith("data: ")) {
                    const data = line.substring(6);
                    if (data === "[DONE]") {
                        onComplete();
                        return;
                    }
                    const [parseError, json] = await attemptPromise(() => Promise.resolve(JSON.parse(data)));
                    if (parseError) {
                        // A non-JSON SSE payload mid-stream (e.g. a proxy/gateway timeout page
                        // injected in place of a real chunk) used to be silently dropped here —
                        // the loop would just keep going and eventually call onComplete() as if
                        // generation had finished normally, leaving the user with silently
                        // truncated output and no error. Surface it instead.
                        logger.error("processStreamedResponse - Non-JSON SSE payload:", data, parseError);
                        onError(new Error("The AI provider sent an invalid response mid-stream (possible timeout)."));
                        return;
                    }
                    if (json) {
                        const text = json.choices[0]?.delta?.content || "";
                        if (text) onToken(text);
                        const usage = readUsage(json);
                        if (usage) onUsage?.(usage);
                    }
                }
        }
    });

    if (error)
        if ((error as Error).name === "AbortError") {
            logger.info("Stream reading aborted.");
            onComplete();
        } else onError(error as Error);
};
