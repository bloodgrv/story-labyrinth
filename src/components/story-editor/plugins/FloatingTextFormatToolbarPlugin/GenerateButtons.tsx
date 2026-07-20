import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import type { LexicalEditor } from "lexical";
import { Button } from "@/components/ui/button";
import { PromptSelectMenu } from "@/components/ui/prompt-select-menu";
import type { AllowedModel, Prompt } from "@/types/story";
import { ReworkButton } from "./ReworkButton";

interface LastUsedSelection {
    prompt: Prompt;
    model: AllowedModel;
}

interface GenerateButtonsProps {
    editor: LexicalEditor;
    isLoading: boolean;
    error: string | null;
    prompts: Prompt[];
    selectedPrompt: Prompt | undefined;
    selectedModel: AllowedModel | undefined;
    onSelect: (prompt: Prompt, model: AllowedModel) => void;
    lastUsed: LastUsedSelection | null | undefined;
    isGenerating: boolean;
    onPreview: () => void;
    onGenerate: () => void;
}

// Primary path is now "Rework in chat" plus the Expand/Rewrite/Shorten chips (each just a
// pre-filled instruction into the same rework flow) — per docs/Chat_Panel_Integrations_Design.md
// §2.1, the old one-shot "pick a prompt+model, Generate, immediately insertText" flow is
// deprecated as the primary UX (no review step, thin context). It's kept, not deleted, behind a
// "More" disclosure — Preview still has real diagnostic value, and the raw prompt-driven Generate
// may still be useful for a quick one-off edit outside a chat conversation.
export const GenerateButtons = ({
    editor,
    isLoading,
    error,
    prompts,
    selectedPrompt,
    selectedModel,
    onSelect,
    lastUsed,
    isGenerating,
    onPreview,
    onGenerate
}: GenerateButtonsProps): JSX.Element => {
    const [showLegacy, setShowLegacy] = useState(false);
    const selectionPrompts = prompts.filter(p => p.promptType === "selection_specific");

    if (isGenerating)
        return (
            <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Generating...</span>
            </div>
        );

    return (
        <>
            <ReworkButton editor={editor} />
            {selectionPrompts.map(prompt => (
                <ReworkButton
                    key={prompt.id}
                    editor={editor}
                    label={prompt.name}
                    initialInstruction={prompt.description || `Please ${prompt.name.toLowerCase()} this passage.`}
                />
            ))}

            <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLegacy(value => !value)}
                className="flex items-center gap-1 text-xs text-muted-foreground"
            >
                {showLegacy ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                More
            </Button>

            {showLegacy && (
                <>
                    <PromptSelectMenu
                        isLoading={isLoading}
                        error={error}
                        prompts={prompts}
                        promptType="selection_specific"
                        selectedPrompt={selectedPrompt}
                        selectedModel={selectedModel}
                        onSelect={onSelect}
                        lastUsed={lastUsed}
                    />

                    {selectedPrompt && (
                        <Button variant="outline" size="sm" onClick={onPreview} className="flex items-center gap-1">
                            Preview
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onGenerate}
                        disabled={!selectedPrompt || !selectedModel}
                        className="flex items-center gap-1"
                    >
                        Generate (legacy, inserts immediately)
                    </Button>
                </>
            )}
        </>
    );
};
