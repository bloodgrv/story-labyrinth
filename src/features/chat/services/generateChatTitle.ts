import { aiService } from "@/services/ai/AIService";
import type { AIProvider, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";

const TITLE_SYSTEM_PROMPT =
    "Summarize the following exchange into a short, plain title of 3 to 6 words. " +
    "No punctuation, no quotation marks, no trailing period, no preamble — reply with only the title itself.";

const MAX_TITLE_LENGTH = 60;

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
// temperature, and a small token budget (a title needs a handful of words, not the chat's usual
// 4096-token ceiling). Returns null on any failure or unusable output; callers should leave the
// chat's existing title untouched in that case rather than write something empty/junk.
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
        const response = await aiService.generate(provider, messages, modelId, 0.4, 30);
        const rawTitle = await readFullResponseText(response);
        const title = rawTitle
            .trim()
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
