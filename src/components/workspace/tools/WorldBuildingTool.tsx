import { AlertCircle, Plus, RefreshCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { useCreateChatMutation, useChatTemplatesQuery } from "@/features/chat/hooks/useChatQuery";
import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AIChat } from "@/types/story";
import type { WorldBuildingTemplateSlug } from "@/types/worldbuilding";

const ChatErrorFallback = (error: Error, resetError: () => void) => (
    <div className="flex items-center justify-center h-full p-4">
        <Alert variant="destructive" className="max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Chat Error</AlertTitle>
            <AlertDescription className="mt-2">
                <p className="mb-4">The chat interface encountered an error: {error.message}</p>
                <div className="flex gap-2">
                    <Button onClick={resetError} variant="outline" size="sm">
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Reset Chat
                    </Button>
                    <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                        Reload Page
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    </div>
);

export const WorldBuildingTool = () => {
    const { currentStoryId } = useStoryContext();
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const createMutation = useCreateChatMutation();
    const { data: templates = [] } = useChatTemplatesQuery();

    if (!currentStoryId)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">No story selected</p>
            </div>
        );

    const handleCreateFromTemplate = (templateSlug: WorldBuildingTemplateSlug, templateName: string) => {
        createMutation.mutate(
            { storyId: currentStoryId, chatType: "worldbuilding", templateSlug, title: templateName },
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
        <LorebookProvider storyId={currentStoryId}>
            <div className="flex flex-col md:flex-row h-full">
                <div className="hidden md:block">
                    <ChatList
                        storyId={currentStoryId}
                        chatType="worldbuilding"
                        title="World-Building Chats"
                        emptyLabel="No world-building chats yet"
                        selectedChat={selectedChat}
                        onSelectChat={setSelectedChat}
                        renderNewChatAction={renderTemplatePicker}
                    />
                </div>

                <div className="flex-1 h-full min-h-0">
                    {selectedChat ? (
                        <ErrorBoundary fallback={ChatErrorFallback} resetKeys={[selectedChat.id]}>
                            <ChatInterface storyId={currentStoryId} selectedChat={selectedChat} onChatUpdate={setSelectedChat} />
                        </ErrorBoundary>
                    ) : (
                        <div className="flex items-center justify-center h-full flex-col gap-6 text-muted-foreground p-4">
                            <Sparkles className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground/50" />
                            <div className="text-center max-w-md">
                                <h3 className="text-lg md:text-xl font-semibold mb-2">No Chat Selected</h3>
                                <p className="mb-6 text-sm md:text-base">Pick a template to start a focused world-building session.</p>
                                {renderTemplatePicker()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </LorebookProvider>
    );
};
