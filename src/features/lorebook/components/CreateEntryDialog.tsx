import { attemptPromise } from "@jfdi/attempt";
import { Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { useChatTemplatesQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { useSeriesQuery } from "@/features/series/hooks/useSeriesQuery";
import { useStoryQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";
import type { AIChat, LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";
import type { WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { useCreateLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import {
    AdvancedSettings,
    CATEGORIES,
    IMPORTANCE_LEVELS,
    LevelScopeFields,
    SelectField,
    TagsField,
    buildSubmitData,
    getDefaultFormValues
} from "./form";
import type { CreateEntryForm, LorebookCategory } from "./form";
import { LevelBadge } from "./LevelBadge";

interface CreateEntryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storyId?: string;
    seriesId?: string;
    entry?: LorebookEntry;
    defaultCategory?: LorebookCategory;
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
            <ChatList
                storyId={storyId}
                chatType="worldbuilding"
                title="World-Building Chats"
                emptyLabel="No world-building chats yet"
                selectedChat={selectedChat}
                onSelectChat={setSelectedChat}
                renderNewChatAction={renderTemplatePicker}
            />

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
        </div>
    );
}

export function CreateEntryDialog({
    open,
    onOpenChange,
    storyId,
    seriesId,
    entry,
    defaultCategory
}: CreateEntryDialogProps) {
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

    useEffect(() => {
        if (open) {
            form.reset(getDefaultFormValues(entry, seriesId, storyId, defaultCategory));
            setAdvancedOpen(false);
        }
    }, [open, entry, seriesId, storyId, defaultCategory, form]);

    const handleSubmit = async (data: CreateEntryForm) => {
        const [error] = await attemptPromise(async () => {
            const dataToSubmit = buildSubmitData(data);

            if (entry)
                await updateMutation.mutateAsync({ id: entry.id, data: dataToSubmit });
            else
                await createMutation.mutateAsync({
                    id: randomUUID(),
                    ...dataToSubmit,
                    storyId: storyId || data.scopeId || ""
                } as Omit<LorebookEntry, "createdAt">);

            onOpenChange(false);
        });
        if (error) {
            // Error toast handled by mutation
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;
    const showChatPanel = isDesktop && !!storyId;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="h-[100vh] w-full sm:max-w-full lg:w-[1100px] xl:w-[1300px] p-0 flex flex-row overflow-hidden"
            >
                <div className="flex-1 min-w-0 overflow-y-auto p-6">
                    <SheetHeader>
                        <SheetTitle>
                            <div className="flex items-center gap-2">
                                {entry ? "Edit Entry" : "Create New Entry"}
                                {entry && <LevelBadge level={entry.level} />}
                            </div>
                        </SheetTitle>
                    </SheetHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
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

                            <AdvancedSettings control={form.control} open={advancedOpen} onOpenChange={setAdvancedOpen} />

                            <div className="flex justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                    Cancel
                                </Button>
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
            </SheetContent>
        </Sheet>
    );
}
