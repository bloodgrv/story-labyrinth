/**
 * AI service constants including SSE formatting
 */

const SSE_FORMAT = {
    DATA_PREFIX: "data: ",
    DONE_MESSAGE: "data: [DONE]\n\n",
    NEWLINE: "\n\n"
} as const;

// Optional `usage` — the OpenAI SDK's own snake_case shape (prompt_tokens/completion_tokens/
// total_tokens) — lets a caller attach the final chunk's token counts (see wrapOpenAIStream in
// streamUtils.ts, which forwards `stream_options: {include_usage: true}` responses through here)
// so processStreamedResponse's readUsage() picks it up same as it already does for Local.
export const formatSSEChunk = (
    content: string,
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
): string => {
    const data: Record<string, unknown> = { choices: [{ delta: { content } }] };
    if (usage) data.usage = usage;
    return `${SSE_FORMAT.DATA_PREFIX}${JSON.stringify(data)}${SSE_FORMAT.NEWLINE}`;
};

export const formatSSEDone = (): string => SSE_FORMAT.DONE_MESSAGE;
