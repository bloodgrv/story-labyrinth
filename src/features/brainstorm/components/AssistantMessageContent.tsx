import { useShowModelThinking } from "@/lib/useShowModelThinking";
import { parseThinkingContent } from "@/utils/parseThinking";
import MarkdownRenderer from "./MarkdownRenderer";
import { ThinkingBlock } from "./ThinkingBlock";

interface AssistantMessageContentProps {
    content: string;
}

export function AssistantMessageContent({ content }: AssistantMessageContentProps) {
    const [showModelThinking] = useShowModelThinking();
    const { thinking, response } = parseThinkingContent(content);

    return (
        <>
            {showModelThinking && thinking && <ThinkingBlock thinking={thinking} />}
            <MarkdownRenderer content={response} />
        </>
    );
}
