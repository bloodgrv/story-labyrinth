const THINKING_TAG_REGEX = /<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi;

export interface ParsedThinking {
    thinking: string | null;
    response: string;
}

/**
 * Splits native <think>/<thinking>/<reasoning> blocks out of raw model output.
 * Tags are always stripped from the response; callers decide whether to display `thinking`.
 */
export const parseThinkingContent = (content: string): ParsedThinking => {
    if (!content) return { thinking: null, response: content };

    const segments: string[] = [];
    const response = content.replace(THINKING_TAG_REGEX, (_match, _tag, inner: string) => {
        segments.push(inner.trim());
        return "";
    }).trim();

    if (segments.length === 0) return { thinking: null, response: content };

    return { thinking: segments.join("\n\n"), response };
};
