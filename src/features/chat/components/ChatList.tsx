import { DndContext, type DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, FolderPlus, Plus } from "lucide-react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFoldersQuery } from "@/features/folders/hooks/useFoldersQuery";
import { buildFolderTree } from "@/features/folders/lib/folderTree";
import { cn } from "@/lib/utils";
import type { AIChat } from "@/types/story";
import type { ChatType } from "@/types/worldbuilding";
import { useArchiveChatMutation, useChatsByStoryQuery, useCreateChatMutation, useUpdateChatMutation } from "../hooks/useChatQuery";
import { ChatFolderDialogs } from "./ChatFolderDialogs";
import { ChatFolderNode } from "./ChatFolderNode";
import { ChatListItem } from "./ChatListItem";

// Must be a stable reference — useSensor/useSensors re-memoize on options identity, and a fresh
// object literal every render defeats that memoization (see LorebookBrowsePanel.tsx's own copy
// of this constant for the same reason).
const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 };

// Droppable wrapper for the Unfiled chats section — a plain <div> (FolderDropZone's own shape)
// can't sit directly under this list's <ul>, so this applies useDroppable straight to an <li>
// (matching ChatFolderNode's own li>ul nesting for its child chats/subfolders).
function UnfiledChatSection({ children }: { children: ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id: "drop:unfiled", data: { type: "chat-folder", targetFolderId: null } });
    return (
        <li ref={setNodeRef} className={cn("list-none", isOver && "bg-primary/10")}>
            <ul>{children}</ul>
        </li>
    );
}

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
    // Narrows the list to a subset of this story's chats of this chatType — applied before the
    // folder/unfiled split, so folders transparently reflect the filtered set too. Generic rather
    // than Editor-specific so any other rail can scope its own list the same way later (see
    // EditorChatRail.tsx's chapter-scoping use).
    filterPredicate?: (chat: AIChat) => boolean;
}

export function ChatList({
    storyId,
    chatType,
    title,
    emptyLabel = "No chats yet",
    selectedChat,
    onSelectChat,
    renderNewChatAction,
    side = "left",
    filterPredicate
}: ChatListProps) {
    const isLeftSide = side === "left";
    const { data: fetchedChats = [], isLoading } = useChatsByStoryQuery(storyId, chatType);
    const chats = filterPredicate ? fetchedChats.filter(filterPredicate) : fetchedChats;
    const { data: folders = [] } = useFoldersQuery({ kind: "chat", scopeId: storyId, chatType });
    const createMutation = useCreateChatMutation();
    const updateMutation = useUpdateChatMutation();
    const archiveMutation = useArchiveChatMutation();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingChat, setEditingChat] = useState<AIChat | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined); // undefined = closed
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const tree = buildFolderTree(folders);
    const chatsByFolder = new Map<string, AIChat[]>();
    for (const chat of chats) {
        if (!chat.folderId) continue;
        const siblings = chatsByFolder.get(chat.folderId) ?? [];
        siblings.push(chat);
        chatsByFolder.set(chat.folderId, siblings);
    }
    const unfiledChats = chats.filter(c => !c.folderId);

    const handleCreateNewChat = () => {
        createMutation.mutate(
            { storyId, chatType, title: `New Chat ${new Date().toLocaleString()}` },
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

    // DraggableLeaf spreads pointer listeners across the whole row (no dedicated drag handle),
    // so the default zero-distance PointerSensor treats the sub-pixel movement in an ordinary
    // click as a drag start and swallows the click before ChatListItem's onClick ever fires —
    // same fix as LorebookBrowsePanel.tsx's sensors.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }));

    // Drag a chat (ChatListItem/ChatFolderNode) onto a folder row or "Unfiled" to file it —
    // folder-onto-folder reparenting goes through "Move to…" instead (same restraint as
    // LorebookBrowsePanel.tsx's handleDragEnd — see B9 plan decision #7).
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeData = active.data.current as { type?: string; leafId?: string } | undefined;
        const overData = over.data.current as { type?: string; targetFolderId?: string | null } | undefined;
        if (activeData?.type !== "chat" || overData?.type !== "chat-folder") return;
        updateMutation.mutate({ id: activeData.leafId as string, data: { folderId: overData.targetFolderId ?? null } });
    };

    return (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="New folder"
                                    onClick={() => setCreatingUnder(null)}
                                >
                                    <FolderPlus className="h-4 w-4" />
                                </Button>
                                {renderNewChatAction ? (
                                    renderNewChatAction(chats)
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCreateNewChat}
                                        className="flex items-center gap-1"
                                    >
                                        <Plus className="h-4 w-4" />
                                        New Chat
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                    <ul className="overflow-y-auto flex-1">
                        {isLoading ? (
                            <li className="p-8 flex items-center justify-center">
                                <p className="text-muted-foreground">Loading chats...</p>
                            </li>
                        ) : chats.length === 0 && tree.length === 0 ? (
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
                            <>
                                <UnfiledChatSection>
                                    {unfiledChats.map(chat => (
                                        <ChatListItem
                                            key={chat.id}
                                            chat={chat}
                                            isSelected={selectedChat?.id === chat.id}
                                            onSelect={onSelectChat}
                                            onEditClick={handleEditClick}
                                            onArchiveClick={handleArchiveChat}
                                        />
                                    ))}
                                </UnfiledChatSection>
                                {tree.map(node => (
                                    <ChatFolderNode
                                        key={node.id}
                                        node={node}
                                        depth={0}
                                        chatsByFolder={chatsByFolder}
                                        selectedChat={selectedChat}
                                        onSelectChat={onSelectChat}
                                        onEditClick={handleEditClick}
                                        onArchiveChat={handleArchiveChat}
                                        onNewSubfolder={parentId => setCreatingUnder(parentId)}
                                        onRename={setRenamingId}
                                        onMoveTo={setMovingId}
                                        onDelete={setDeletingId}
                                    />
                                ))}
                            </>
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

            <ChatFolderDialogs
                storyId={storyId}
                chatType={chatType}
                folders={folders}
                creatingUnder={creatingUnder}
                onCreatingUnderChange={setCreatingUnder}
                renamingId={renamingId}
                onRenamingIdChange={setRenamingId}
                movingId={movingId}
                onMovingIdChange={setMovingId}
                deletingId={deletingId}
                onDeletingIdChange={setDeletingId}
            />
        </DndContext>
    );
}
