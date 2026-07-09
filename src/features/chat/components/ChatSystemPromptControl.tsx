import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageEditor } from "@/features/prompts/components/MessageEditor";
import { usePromptMessages } from "@/features/prompts/hooks/usePromptMessages";
import { useUpdatePromptMutation } from "@/features/prompts/hooks/usePromptsQuery";
import type { AIModel, AllowedModel, Prompt } from "@/types/story";

interface EditSystemPromptDialogProps {
    prompt: Prompt;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function EditSystemPromptDialog({ prompt, open, onOpenChange }: EditSystemPromptDialogProps) {
    const messageHandlers = usePromptMessages({ initialMessages: prompt.messages });
    const updateMutation = useUpdatePromptMutation();

    const handleSave = () => {
        updateMutation.mutate(
            { id: prompt.id, data: { messages: messageHandlers.getMessagesWithoutIds() } },
            { onSuccess: () => onOpenChange(false) }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit "{prompt.name}" System Prompt</DialogTitle>
                </DialogHeader>
                <MessageEditor messageHandlers={messageHandlers} />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateMutation.isPending}>
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface ChatSystemPromptControlProps {
    prompt: Prompt | null;
    isLoading: boolean;
    availableModels: AIModel[];
    selectedModel: AllowedModel | null;
    onSelectModel: (model: AIModel) => void;
}

// Replaces PromptControls for chat-type contexts (Brainstorm/World-Building/Research/Editor) — there's
// exactly one system prompt per chat type now, not a library to pick from, so this is just a model
// picker plus an in-place editor for that one prompt's content.
export function ChatSystemPromptControl({
    prompt,
    isLoading,
    availableModels,
    selectedModel,
    onSelectModel
}: ChatSystemPromptControlProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);

    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (!prompt) return <p className="text-sm text-destructive">No system prompt configured for this chat type.</p>;

    return (
        <div className="flex items-center gap-2">
            <Select value={selectedModel?.id} onValueChange={id => {
                const model = availableModels.find(m => m.id === id);
                if (model) onSelectModel(model);
            }}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                    {availableModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>
                            {model.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit System Prompt
            </Button>

            <EditSystemPromptDialog prompt={prompt} open={isEditOpen} onOpenChange={setIsEditOpen} />
        </div>
    );
}
