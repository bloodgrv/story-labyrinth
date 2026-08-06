import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { FolderContextMenu } from "@/features/folders/components/FolderContextMenu";
import { FolderDropZone } from "@/features/folders/components/FolderDropZone";
import { cn } from "@/lib/utils";
import type { FolderTreeNode } from "@/types/folders";
import type { AIChat } from "@/types/story";
import { ChatListItem } from "./ChatListItem";

const MAX_DEPTH = 3;

interface ChatFolderNodeProps {
    node: FolderTreeNode;
    depth: number;
    chatsByFolder: Map<string, AIChat[]>;
    selectedChat: AIChat | null;
    onSelectChat: (chat: AIChat) => void;
    onEditClick: (chat: AIChat, e: MouseEvent) => void;
    onArchiveChat: (chatId: string) => void;
    onNewSubfolder: (parentId: string) => void;
    onRename: (folderId: string) => void;
    onMoveTo: (folderId: string) => void;
    onDelete: (folderId: string) => void;
}

// Recursive folder row for the ChatList folder tree (B9, docs/Folders_Org_Design.md F3) — same
// shape as LorebookFolderTreeRow.tsx, but each node also renders its own direct chats (the tree
// itself IS the browse surface here, unlike Lorebook's separate sidebar+filtered-main-pane split).
export function ChatFolderNode({
    node,
    depth,
    chatsByFolder,
    selectedChat,
    onSelectChat,
    onEditClick,
    onArchiveChat,
    onNewSubfolder,
    onRename,
    onMoveTo,
    onDelete
}: ChatFolderNodeProps) {
    const [expanded, setExpanded] = useState(true);
    const directChats = chatsByFolder.get(node.id) ?? [];

    return (
        <li className="list-none">
            <FolderDropZone id={node.id} data={{ type: "chat-folder", targetFolderId: node.id }}>
                <div
                    className="group flex items-center gap-1 py-2 pr-2 cursor-pointer hover:bg-muted"
                    style={{ paddingLeft: `${depth * 16 + 16}px` }}
                    onClick={() => setExpanded(prev => !prev)}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpanded(prev => !prev);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                >
                    {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm font-medium">{node.name}</span>
                    <div className={cn("opacity-0 group-hover:opacity-100")}>
                        <FolderContextMenu
                            canNestDeeper={depth + 1 < MAX_DEPTH}
                            onNewSubfolder={() => onNewSubfolder(node.id)}
                            onRename={() => onRename(node.id)}
                            onMoveTo={() => onMoveTo(node.id)}
                            onDelete={() => onDelete(node.id)}
                        />
                    </div>
                </div>
            </FolderDropZone>
            {expanded && (
                <ul>
                    {directChats.map(chat => (
                        <ChatListItem
                            key={chat.id}
                            chat={chat}
                            isSelected={selectedChat?.id === chat.id}
                            onSelect={onSelectChat}
                            onEditClick={onEditClick}
                            onArchiveClick={onArchiveChat}
                        />
                    ))}
                    {node.children.map(child => (
                        <ChatFolderNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            chatsByFolder={chatsByFolder}
                            selectedChat={selectedChat}
                            onSelectChat={onSelectChat}
                            onEditClick={onEditClick}
                            onArchiveChat={onArchiveChat}
                            onNewSubfolder={onNewSubfolder}
                            onRename={onRename}
                            onMoveTo={onMoveTo}
                            onDelete={onDelete}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}
