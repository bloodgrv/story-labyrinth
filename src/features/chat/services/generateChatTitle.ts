import { aiService } from "@/services/ai/AIService";
import type { AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import { parseThinkingContent } from "@/utils/parseThinking";

const TITLE_SYSTEM_PROMPT =
    "Summarize the following exchange into a short, plain title of 3 to 6 words. " +
    "No punctuation, no quotation marks, no trailing period, no preamble — reply with only the title itself.";

const MAX_TITLE_LENGTH = 60;

// A title is a handful of words, so 30 looks generous — and it silently broke auto-titling for
// every reasoning-capable model. Those spend the budget on an internal reasoning phase *before*
// emitting any visible content, so a 30-token ceiling produced `finish_reason: "length"` with zero
// content, which generateChatTitle then discarded as "unusable output" with no error anywhere.
// Verified live against a local reasoning model (2026-09-07): 103 characters of reasoning, 0 of
// content. This is the same failure AIService's DEFAULT_MAX_TOKENS was raised from 2048 to 4096 to
// avoid; the title path was just never revisited in that light.
//
// Raising the ceiling is close to free: max_tokens is a cap, not a target, so a non-reasoning model
// still stops at its own end-of-turn after a few words and is billed for exactly those. Only a
// model that genuinely needs the room uses it.
const MAX_TITLE_TOKENS = 512;

// Reads a streamed Response down to its full text without going through useStreamingGeneration's
// own hook state/toast — that hook is wired to the main reply's UI (isGenerating,
// toast.error("Failed to stream response")), neither of which should fire for this side-channel,
// fire-and-forget call. Same aiService.handleStreamedResponse callback shape that hook uses
// internally, just consumed directly here instead.
function readFullResponseText(response: Response): Promise<string> {
    if (response.status === 204 || !response.ok) return Promise.resolve("");
    const chunks: string[] = [];
    return new Promise<string>(resolve => {
        aiService.handleStreamedResponse(
            response,
            token => chunks.push(token),
            () => resolve(chunks.join("")),
            error => {
                logger.warn("Chat title generation stream failed:", error);
                resolve("");
            }
        );
    });
}

// One small extra completion call after a chat's first exchange — reuses the exact same
// aiService.generate the real reply just went through, just with a short system prompt, low
// temperature, and a smaller token budget than the chat's usual 4096-token ceiling (see
// MAX_TITLE_TOKENS above for why it is not smaller still). Returns null on any failure or on
// unusable output; callers should leave the chat's existing title untouched in that case rather
// than write something empty/junk.
export async function generateChatTitle(
    provider: AIProvider,
    modelId: string,
    firstUserMessage: string,
    firstAssistantReply: string
): Promise<string | null> {
    try {
        await aiService.initialize();
        const messages: PromptMessage[] = [
            { role: "system", content: TITLE_SYSTEM_PROMPT },
            { role: "user", content: `User: ${firstUserMessage}\n\nAssistant: ${firstAssistantReply}` }
        ];
        const response = await aiService.generate(provider, messages, modelId, 0.4, MAX_TITLE_TOKENS);
        const rawTitle = await readFullResponseText(response);
        // Strip <think>/<thinking>/<reasoning> blocks before anything else. Models that keep their
        // reasoning in `content` (rather than a separate `reasoning_content` field) would otherwise
        // have the opening 60 characters of their own thinking sliced out as the title — which the
        // old 30-token ceiling hid by producing no content at all. Raising that ceiling is exactly
        // what makes this reachable, so the two changes belong together.
        const title = parseThinkingContent(rawTitle)
            .response.trim()
            .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
            .replace(/\s+/g, " ")
            .slice(0, MAX_TITLE_LENGTH)
            .trim();
        return title.length > 0 ? title : null;
    } catch (error) {
        logger.warn("Chat title generation failed:", error);
        return null;
    }
}
