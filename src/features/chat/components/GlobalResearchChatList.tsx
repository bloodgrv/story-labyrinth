import { DndContext } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AIChat } from "@/types/story";
import { useArchiveChatMutation, useCreateGlobalChatMutation, useGlobalChatsQuery, useUpdateChatMutation } from "../hooks/useChatQuery";
import { ChatListItem } from "./ChatListItem";

interface GlobalResearchChatListProps {
    selectedChat: AIChat | null;
    onSelectChat: (chat: AIChat | null) => void;
}

// Global (storyId-less) rail for Research's Global mode — same row/rename/archive shell as
// ChatList.tsx, deliberately without folder support: folders are matched via
// folder.scopeId === chat.storyId (folderService.ts's resolveChatFolderId), which has no
// meaningful value for a chat with storyId = null. Easy to extend later if wanted.
export function GlobalResearchChatList({ selectedChat, onSelectChat }: GlobalResearchChatListProps) {
    const { data: chats = [], isLoading } = useGlobalChatsQuery("research");
    const createMutation = useCreateGlobalChatMutation();
    const updateMutation = useUpdateChatMutation();
    const archiveMutation = useArchiveChatMutation();

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingChat, setEditingChat] = useState<AIChat | null>(null);
    const [newTitle, setNewTitle] = useState("");

    const handleCreateNewChat = () => {
        createMutation.mutate(
            { chatType: "research", title: `New Chat ${new Date().toLocaleString()}` },
            { onSuccess: newChat => onSelectChat(newChat) }
        );
    };

    const handleArchiveChat = (chatId: string) => {
        archiveMutation.mutate(chatId, { onSuccess: () => selectedChat?.id === chatId && onSelectChat(null) });
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
                { onSuccess: () => (setIsEditDialogOpen(false), setEditingChat(null), setNewTitle("")) }
            );
    };

    return (
        <DndContext>
            <div className="flex flex-col h-full border-l border-input w-[250px] sm:w-[300px] shrink-0 bg-background">
                <div className="p-4 border-b border-input">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-semibold text-foreground">Global Research Chats</h2>
                        <Button variant="gradient" size="sm" onClick={handleCreateNewChat} className="flex items-center gap-1">
                            <Plus className="h-4 w-4" />
                            New Chat
                        </Button>
                    </div>
                </div>
                <ul className="overflow-y-auto flex-1">
                    {isLoading ? (
                        <li className="p-8 flex items-center justify-center">
                            <p className="text-muted-foreground">Loading chats...</p>
                        </li>
                    ) : chats.length === 0 ? (
                        <li className="p-8 flex flex-col items-center justify-center text-center">
                            <p className="text-muted-foreground mb-4">No global research chats yet</p>
                            <Button onClick={handleCreateNewChat} className="flex items-center gap-1">
                                <Plus className="h-4 w-4" />
                                Start New Chat
                            </Button>
                        </li>
                    ) : (
                        chats.map(chat => (
                            <ChatListItem
                                key={chat.id}
                                chat={chat}
                                isSelected={selectedChat?.id === chat.id}
                                onSelect={onSelectChat}
                                onEditClick={handleEditClick}
                                onArchiveClick={handleArchiveChat}
                            />
                        ))
                    )}
                </ul>
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
        </DndContext>
    );
}
