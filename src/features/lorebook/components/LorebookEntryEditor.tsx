import { attemptPromise } from "@jfdi/attempt";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { useChatTemplatesQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { useSeriesQuery } from "@/features/series/hooks/useSeriesQuery";
import { useStoryQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";
import { codexApi } from "@/services/api/client";
import type { AIChat, LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";
import type { WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { useCreateLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import {
    AdvancedSettings,
    CATEGORIES,
    CodexStateEditor,
    EMPTY_CODEX_STATE,
    IMPORTANCE_LEVELS,
    LevelScopeFields,
    SelectField,
    TagsField,
    buildSubmitData,
    getDefaultFormValues
} from "./form";
import type { CreateEntryForm, LorebookCategory } from "./form";

export interface LorebookEntryEditorProps {
    storyId?: string;
    seriesId?: string;
    entry?: LorebookEntry;
    defaultCategory?: LorebookCategory;
    // Called after a successful create/update. Sheet usage closes itself; tab usage can leave
    // the tab open (entry tabs have nothing else to navigate back to).
    onSaved?: () => void;
    // Omitted entirely for tab usage — "Cancel" only makes sense when there's an overlay to
    // dismiss back to; an entry tab just stays open until closed via its tab control.
    onCancel?: () => void;
}

// Docked World-Building chat alongside the entry form — the same chat/template-picker
// composition the old standalone World-Building tool used (now folded in here, see D1/D2 in
// DECISIONS.md), reusing ChatList/ChatInterface rather than a new per-entry chat.
function WorldBuildingChatPanel({ storyId }: { storyId: string }) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: templates = [] } = useChatTemplatesQuery();

    const handleCreateFromTemplate = (templateSlug: WorldBuildingTemplateSlug, templateName: string) => {
        createMutation.mutate(
            { storyId, chatType: "worldbuilding", templateSlug, title: templateName },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
    };

    const renderTemplatePicker = () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {templates.map(template => (
                    <DropdownMenuItem key={template.slug} onClick={() => handleCreateFromTemplate(template.slug, template.name)}>
                        {template.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex h-full border-l">
            <div className="flex-1 h-full min-h-0">
                {selectedChat ? (
                    <ChatInterface storyId={storyId} promptType="worldbuilding" selectedChat={selectedChat} onChatUpdate={setSelectedChat} />
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <Sparkles className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Pick a template to start a focused world-building session.</p>
                        {renderTemplatePicker()}
                    </div>
                )}
            </div>

            <ChatList
                storyId={storyId}
                chatType="worldbuilding"
                title="World-Building Chats"
                emptyLabel="No world-building chats yet"
                selectedChat={selectedChat}
                onSelectChat={setSelectedChat}
                renderNewChatAction={renderTemplatePicker}
                side="right"
            />
        </div>
    );
}

// The entry form + docked World-Building chat, with no opinion on what contains it — reused by
// CreateEntryDialog (wrapped in a Sheet) and LorebookEntryTab (rendered full-width as tab
// content), so the two presentations can never drift apart.
//
// No reset-on-prop-change effect here on purpose: `useForm`'s `defaultValues` only apply at
// construction time, so both callers key this component on entry identity (LorebookEntryTab) or
// on open-transition (CreateEntryDialog) to force a fresh mount — and therefore fresh defaults —
// instead of fighting react-hook-form's mount-time-only defaults with an effect.
export function LorebookEntryEditor({ storyId, seriesId, entry, defaultCategory, onSaved, onCancel }: LorebookEntryEditorProps) {
    const createMutation = useCreateLorebookMutation();
    const updateMutation = useUpdateLorebookMutation();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const isDesktop = useIsDesktopViewport();

    const { data: story } = useStoryQuery(storyId || "");
    const { data: seriesList } = useSeriesQuery();

    const form = useForm<CreateEntryForm>({
        defaultValues: getDefaultFormValues(entry, seriesId, storyId, defaultCategory)
    });

    const selectedLevel = form.watch("level");
    const tagInput = form.watch("tags");
    const selectedCategory = form.watch("category");

    const handleSubmit = async (data: CreateEntryForm) => {
        const [error] = await attemptPromise(async () => {
            const dataToSubmit = buildSubmitData(data);
            const entryId = entry?.id ?? randomUUID();

            if (entry) await updateMutation.mutateAsync({ id: entry.id, data: dataToSubmit });
            else
                await createMutation.mutateAsync({
                    id: entryId,
                    ...dataToSubmit,
                    storyId: storyId || data.scopeId || ""
                } as Omit<LorebookEntry, "createdAt">);

            // Codex state is submitted separately (codexApi), not part of the base entry
            // payload above — see CodexStateEditor.tsx and CreateEntryForm's own doc comment.
            if (data.codexEnabled) {
                if (!entry?.codexEnabled) await codexApi.enable(entryId, { sourceType: "user" });

                const codexStateChanged =
                    JSON.stringify(data.codexState) !== JSON.stringify(entry?.codexState ?? EMPTY_CODEX_STATE);
                if (codexStateChanged)
                    await codexApi.recordState(entryId, { changes: { codexState: data.codexState }, sourceType: "user" });
            }

            onSaved?.();
        });
        if (error) {
            // Error toast handled by mutation
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;
    const showChatPanel = isDesktop && !!storyId;

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <LevelScopeFields
                            control={form.control}
                            setValue={form.setValue}
                            selectedLevel={selectedLevel}
                            storyId={storyId}
                            story={story}
                            seriesList={seriesList}
                        />

                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: "Name is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <SelectField
                                control={form.control}
                                name="category"
                                label="Category"
                                options={CATEGORIES}
                                placeholder="Select category"
                            />
                            <SelectField
                                control={form.control}
                                name="importance"
                                label="Importance"
                                options={IMPORTANCE_LEVELS}
                                placeholder="Select importance"
                            />
                        </div>

                        <TagsField control={form.control} tagInput={tagInput} />

                        <FormField
                            control={form.control}
                            name="description"
                            rules={{ required: "Description is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} rows={6} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {selectedCategory === "character" && <CodexStateEditor control={form.control} />}

                        <AdvancedSettings control={form.control} open={advancedOpen} onOpenChange={setAdvancedOpen} />

                        <div className="flex justify-end gap-3">
                            {onCancel && (
                                <Button type="button" variant="outline" onClick={onCancel}>
                                    Cancel
                                </Button>
                            )}
                            <Button type="submit" disabled={isPending}>
                                {isPending ? "Saving..." : entry ? "Update" : "Create"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>

            {showChatPanel && (
                <div className="w-[420px] shrink-0 h-full">
                    <WorldBuildingChatPanel storyId={storyId as string} />
                </div>
            )}
        </div>
    );
}
