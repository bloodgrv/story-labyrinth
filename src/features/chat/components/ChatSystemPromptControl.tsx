import { Loader2, MoreHorizontal, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModeForProvider } from "@/features/ai/utils/resolveChatDefaultModel";
import { MessageEditor } from "@/features/prompts/components/MessageEditor";
import { usePromptMessages } from "@/features/prompts/hooks/usePromptMessages";
import { useUpdatePromptMutation } from "@/features/prompts/hooks/usePromptsQuery";
import type { AIModel, AIProvider, AllowedModel, ChatMode, Prompt } from "@/types/story";

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

const PROVIDER_GROUP_LABEL: Record<AIProvider, string> = {
    openai: "OpenAI",
    openrouter: "OpenRouter",
    deepseek: "DeepSeek",
    local: "Local",
    gemini: "Gemini",
    grok: "Grok (xAI)",
    "grok-session": "SuperGrok (Session)",
    "grok-oauth": "Grok (xAI OAuth)"
};

interface ChatSystemPromptControlProps {
    prompt: Prompt | null;
    isLoading: boolean;
    availableModels: AIModel[];
    selectedModel: AllowedModel | null;
    onSelectModel: (model: AIModel) => void;
    // Chat Model Routing (MR2) — mode is derived by the caller from selectedModel's own provider
    // (falling back to the global preferred mode when nothing's selected yet); this component just
    // renders the segmented control and filters/groups the model menu by it.
    mode: ChatMode;
    onModeChange: (mode: ChatMode) => void;
}

// Replaces PromptControls for chat-type contexts (Brainstorm/World-Building/Research/Editor) — there's
// exactly one system prompt per chat type now, not a library to pick from, so this is just a model
// picker plus an in-place editor for that one prompt's content.
export function ChatSystemPromptControl({
    prompt,
    isLoading,
    availableModels,
    selectedModel,
    onSelectModel,
    mode,
    onModeChange
}: ChatSystemPromptControlProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);

    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (!prompt) return <p className="text-sm text-destructive">No system prompt configured for this chat type.</p>;

    const modelsInMode = availableModels.filter(m => getModeForProvider(m.provider) === mode);
    const cloudGroups =
        mode === "cloud"
            ? Object.entries(
                  modelsInMode.reduce<Partial<Record<AIProvider, AIModel[]>>>((groups, model) => {
                      (groups[model.provider] ??= []).push(model);
                      return groups;
                  }, {})
              )
            : [];

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* First-Start Tour (T11, OT5) — Brainstorm micro-step 2a. */}
            <div data-tour="chat-mode-toggle">
                <Tabs value={mode} onValueChange={value => onModeChange(value as ChatMode)}>
                    <TabsList>
                        <TabsTrigger value="cloud" className={mode === "cloud" ? "raycast-pill-active" : ""}>
                            Cloud
                        </TabsTrigger>
                        <TabsTrigger value="local" className={mode === "local" ? "raycast-pill-active" : ""}>
                            Local
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <Select
                // B11 — Radix's Select renders a hidden native <select> for form semantics; a
                // value prop starting undefined (selectedModel resolves asynchronously on mount)
                // then later becoming a real id is exactly React's "uncontrolled to controlled"
                // trigger. "" isn't a real model id, so it just keeps the placeholder showing
                // until selectedModel resolves, with the component controlled from the first render.
                value={selectedModel?.id ?? ""}
                onValueChange={id => {
                    const model = availableModels.find(m => m.id === id);
                    if (model) onSelectModel(model);
                }}
            >
                {/* First-Start Tour (T11, OT5) — Brainstorm micro-step 2b. Radix's Select.Root
                    renders no DOM node of its own, so the anchor goes on the actual trigger. */}
                <SelectTrigger className="w-[220px]" data-tour="chat-model-picker">
                    <SelectValue placeholder={modelsInMode.length ? "Select a model" : `No ${mode} models configured`} />
                </SelectTrigger>
                <SelectContent>
                    {mode === "local"
                        ? modelsInMode.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                              </SelectItem>
                          ))
                        : cloudGroups.map(([provider, models]) => (
                              <SelectGroup key={provider}>
                                  <SelectLabel>{PROVIDER_GROUP_LABEL[provider as AIProvider]}</SelectLabel>
                                  {models?.map(model => (
                                      <SelectItem key={model.id} value={model.id}>
                                          {model.name}
                                      </SelectItem>
                                  ))}
                              </SelectGroup>
                          ))}
                </SelectContent>
            </Select>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit system prompt
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <EditSystemPromptDialog prompt={prompt} open={isEditOpen} onOpenChange={setIsEditOpen} />
        </div>
    );
}
