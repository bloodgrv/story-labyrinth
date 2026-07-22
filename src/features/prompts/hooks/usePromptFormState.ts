import { useState } from "react";
import type { Prompt } from "@/types/story";

type PromptType = Prompt["promptType"];

interface UsePromptFormStateProps {
    prompt?: Prompt;
    fixedType?: PromptType;
}

export const usePromptFormState = ({ prompt, fixedType }: UsePromptFormStateProps) => {
    const [name, setName] = useState(prompt?.name || "");
    const [promptType, setPromptType] = useState<PromptType>(fixedType || prompt?.promptType || "other");

    return {
        name,
        setName,
        promptType,
        setPromptType
    };
};
