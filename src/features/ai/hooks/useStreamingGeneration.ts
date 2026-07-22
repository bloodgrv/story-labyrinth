import { attemptPromise } from "@jfdi/attempt";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { aiService } from "@/services/ai/AIService";
import type { StreamUsage } from "@/services/ai/streamUtils";
import { logger } from "@/utils/logger";

type StreamingState = {
    isStreaming: boolean;
    streamedText: string;
    isComplete: boolean;
};

// Context/Token Meter (T4, M3) — processStream's return value carries whatever usage the
// provider reported (Local only this pass, via stream_options.include_usage — see
// LocalAIProvider.generate()); null for every other provider/no usage reported.
type UseStreamingGenerationReturn = StreamingState & {
    processStream: (response: Response) => Promise<{ text: string; usage: StreamUsage | null }>;
    abort: () => void;
    reset: () => void;
};

/**
 * Reusable hook for streaming AI generation.
 * Handles stream processing, state management, and abort logic.
 */
export const useStreamingGeneration = (): UseStreamingGenerationReturn => {
    const [state, setState] = useState<StreamingState>({
        isStreaming: false,
        streamedText: "",
        isComplete: false
    });

    const processStream = useCallback(async (response: Response): Promise<{ text: string; usage: StreamUsage | null }> => {
        if (response.status === 204) {
            logger.info("Generation was aborted");
            return { text: "", usage: null };
        }

        if (!response.ok)
            throw new Error("Failed to generate response");


        setState({ isStreaming: true, streamedText: "", isComplete: false });

        const chunks: string[] = [];
        let capturedUsage: StreamUsage | null = null;

        const [error] = await attemptPromise(
            () =>
                new Promise<void>((resolve, reject) => {
                    aiService.handleStreamedResponse(
                        response,
                        token => {
                            chunks.push(token);
                            setState(prev => ({ ...prev, streamedText: chunks.join("") }));
                        },
                        () => {
                            setState(prev => ({ ...prev, isStreaming: false, isComplete: true }));
                            resolve();
                        },
                        streamError => {
                            logger.error("Streaming error:", streamError);
                            reject(streamError);
                        },
                        usage => {
                            capturedUsage = usage;
                        }
                    );
                })
        );

        if (error) {
            setState(prev => ({ ...prev, isStreaming: false }));
            toast.error("Failed to stream response");
            throw error;
        }

        return { text: chunks.join(""), usage: capturedUsage };
    }, []);

    const abort = useCallback(() => {
        aiService.abortStream();
        setState(prev => ({ ...prev, isStreaming: false }));
    }, []);

    const reset = useCallback(() => {
        setState({ isStreaming: false, streamedText: "", isComplete: false });
    }, []);

    return {
        ...state,
        processStream,
        abort,
        reset
    };
};
