import { useCallback, useRef, useState } from "react";
import type { AllowedModel, Prompt } from "@/types/story";

interface UsePromptSelectionReturn {
    selectedPrompt: Prompt | null;
    selectedModel: AllowedModel | null;
    selectPrompt: (prompt: Prompt, model: AllowedModel) => void;
}

const findInitialSelection = (
    lastUsedPromptId: string | undefined,
    lastUsedModelId: string | undefined,
    prompts: Prompt[]
): { prompt: Prompt | null; model: AllowedModel | null } => {
    if (!lastUsedPromptId || prompts.length === 0) 
        return { prompt: null, model: null };
    

    const lastPrompt = prompts.find(p => p.id === lastUsedPromptId);
    if (!lastPrompt || lastPrompt.allowedModels.length === 0) 
        return { prompt: null, model: null };
    

    const lastModel = lastUsedModelId ? lastPrompt.allowedModels.find(m => m.id === lastUsedModelId) : undefined;

    return {
        prompt: lastPrompt,
        model: lastModel || lastPrompt.allowedModels[0]
    };
};

export const usePromptSelection = (
    chatId: string,
    lastUsedPromptId: string | undefined,
    lastUsedModelId: string | undefined,
    prompts: Prompt[],
    // Persists the selection onto the chat record — callers wire this to whichever
    // update mutation matches their backend (brainstormApi vs chatsApi).
    persistSelection: (promptId: string, modelId: string) => void
): UsePromptSelectionReturn => {
    const initialisedForChatRef = useRef<string | null>(null);

    // Compute initial values if this is first render for this chat
    const shouldInitialise = initialisedForChatRef.current !== chatId && prompts.length > 0;
    const initialValues = shouldInitialise ? findInitialSelection(lastUsedPromptId, lastUsedModelId, prompts) : null;

    if (shouldInitialise) 
        initialisedForChatRef.current = chatId;
    

    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(() => initialValues?.prompt ?? null);
    const [selectedModel, setSelectedModel] = useState<AllowedModel | null>(() => initialValues?.model ?? null);

    // Re-initialise when chat changes
    if (initialValues && selectedPrompt?.id !== initialValues.prompt?.id) {
        setSelectedPrompt(initialValues.prompt);
        setSelectedModel(initialValues.model);
    }

    const selectPrompt = useCallback(
        (prompt: Prompt, model: AllowedModel) => {
            setSelectedPrompt(prompt);
            setSelectedModel(model);
            persistSelection(prompt.id, model.id);
        },
        [persistSelection]
    );

    return {
        selectedPrompt,
        selectedModel,
        selectPrompt
    };
};
