import { ChevronLeft, ChevronRight, Edit2, Plus, Trash2 } from "lucide-react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AIChat } from "@/types/story";
import type { ChatType } from "@/types/worldbuilding";
import { useChatsByStoryQuery, useCreateChatMutation, useDeleteChatMutation, useUpdateChatMutation } from "../hooks/useChatQuery";

interface ChatListProps {
    storyId: string;
    chatType: ChatType;
    title: string;
    emptyLabel?: string;
    selectedChat: AIChat | null;
    onSelectChat: (chat: AIChat | null) => void;
    // When provided, replaces the default "New Chat" button/flow — used by World-Building,
    // which needs a template picker before creating a chat.
    renderNewChatAction?: (chats: AIChat[]) => ReactNode;
    // Which side of the chat interface this list sits on — flips the shared border and the
    // collapse toggle's position/chevron direction accordingly. Defaults to "left" (list first,
    // interface after); pass "right" when the list is the trailing column instead.
    side?: "left" | "right";
}

export function ChatList({
    storyId,
    chatType,
    title,
    emptyLabel = "No chats yet",
    selectedChat,
    onSelectChat,
    renderNewChatAction,
    side = "left"
}: ChatListProps) {
    const isLeftSide = side === "left";
    const { data: chats = [], isLoading } = useChatsByStoryQuery(storyId, chatType);
    const createMutation = useCreateChatMutation();
    const updateMutation = useUpdateChatMutation();
    const deleteMutation = useDeleteChatMutation();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingChat, setEditingChat] = useState<AIChat | null>(null);
    const [newTitle, setNewTitle] = useState("");

    const handleCreateNewChat = () => {
        createMutation.mutate(
            { storyId, chatType, title: `New Chat ${new Date().toLocaleString()}` },
            { onSuccess: newChat => onSelectChat(newChat) }
        );
    };

    const handleDeleteChat = (chatId: string) => {
        deleteMutation.mutate(chatId, {
            onSuccess: () => {
                if (selectedChat?.id === chatId) onSelectChat(null);
            }
        });
    };

    const handleEditClick = (chat: AIChat, e: MouseEvent) => {
        e.stopPropagation();
        setEditingChat(chat);
        setNewTitle(chat.title);
        setIsEditDialogOpen(true);
    };

    const handleSaveTitle = () => {
        if (editingChat && newTitle.trim())
            updateMutation.mutate(
                { id: editingChat.id, data: { title: newTitle.trim() } },
                {
                    onSuccess: () => {
                        setIsEditDialogOpen(false);
                        setEditingChat(null);
                        setNewTitle("");
                    }
                }
            );
    };

    return (
        <>
            <div
                className={cn(
                    "relative bg-background transition-all duration-300",
                    isLeftSide ? "border-r border-input" : "border-l border-input",
                    isCollapsed ? "w-[40px]" : "w-[250px] sm:w-[300px]"
                )}
            >
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                        "absolute top-1/2 transform -translate-y-1/2 z-10",
                        "bg-background border-input border rounded-full p-1 shadow-sm hover:bg-muted",
                        isLeftSide ? "-right-3" : "-left-3"
                    )}
                >
                    {isCollapsed === isLeftSide ? (
                        <ChevronRight className="h-4 w-4 text-foreground" />
                    ) : (
                        <ChevronLeft className="h-4 w-4 text-foreground" />
                    )}
                </button>

                <div className={cn("h-full overflow-y-auto", isCollapsed ? "hidden" : "block")}>
                    <div className="p-4 border-b border-input">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-semibold text-foreground">{title}</h2>
                            {renderNewChatAction ? (
                                renderNewChatAction(chats)
                            ) : (
                                <Button variant="outline" size="sm" onClick={handleCreateNewChat} className="flex items-center gap-1">
                                    <Plus className="h-4 w-4" />
                                    New Chat
                                </Button>
                            )}
                        </div>
                    </div>
                    <ul className="overflow-y-auto flex-1">
                        {isLoading ? (
                            <li className="p-8 flex items-center justify-center">
                                <p className="text-muted-foreground">Loading chats...</p>
                            </li>
                        ) : chats.length === 0 ? (
                            <li className="p-8 flex flex-col items-center justify-center text-center">
                                <p className="text-muted-foreground mb-4">{emptyLabel}</p>
                                {!renderNewChatAction && (
                                    <Button onClick={handleCreateNewChat} className="flex items-center gap-1">
                                        <Plus className="h-4 w-4" />
                                        Start New Chat
                                    </Button>
                                )}
                            </li>
                        ) : (
                            chats.map(chat => (
                                <li
                                    key={chat.id}
                                    className={cn(
                                        "p-4 border-b border-input hover:bg-muted cursor-pointer relative group",
                                        selectedChat?.id === chat.id && "bg-muted/50"
                                    )}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onSelectChat(chat)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                onSelectChat(chat);
                                            }
                                        }}
                                        className="flex flex-col gap-2 w-full text-left"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="text-sm block truncate text-foreground">{chat.title}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs break-words">{chat.title}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <span className="text-xs text-muted-foreground block mt-1">
                                                {new Date(chat.updatedAt || chat.createdAt).toLocaleDateString()}{" "}
                                                {new Date(chat.updatedAt || chat.createdAt).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit"
                                                })}
                                            </span>
                                        </div>

                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleEditClick(chat, e);
                                                }}
                                                className="h-8 w-8"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleDeleteChat(chat.id);
                                                }}
                                                className="h-8 w-8 hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Chat</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="Enter new title"
                            className="w-full"
                            onKeyDown={e => {
                                if (e.key === "Enter") handleSaveTitle();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveTitle} disabled={!newTitle.trim()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
